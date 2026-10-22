# x402 endpoint watch

The job behind [chainward.ai/x402/watch](https://chainward.ai/x402/watch). Once a day a stock x402 buyer tries each of a seller's paid endpoints, never paying. When an endpoint breaks or recovers, it writes a report the seller can act on: the request we sent, what came back, and the field to fix.

It writes files only. Nothing is emailed or posted; sending a report is a separate, human step.

## How it checks

1. **One unpaid request per endpoint per UTC day.** `GET`, or `POST` with `{}` (or a sample body from the seller). User agent `chainward-x402-lint/1.0 (+https://chainward.ai)`; no payment headers or credentials; redirects recorded, never followed; 10 s timeout; body read up to 256 KiB; one request at a time, at least 1.2 s apart. A second request the same day reuses the first answer (`--force` overrides, for a re-check the seller asked for). Hosts resolving to private, loopback, link-local or CGNAT addresses are refused.
2. **The stock buyer, replayed offline.** The recorded 402 goes through `@x402/fetch` 2.27.0's `wrapFetchWithPayment` over `@x402/evm` 2.27.0's `registerExactEvmScheme`, signing with a throwaway key. Its fetch is ours: it hands back the recorded 402 and captures the paid retry. Nothing reaches the seller; no RPC is used. Two buyers:
   - the **standard buyer**, with the client's defaults (default tokens, $1 cap);
   - **each offer on its own**, the same client opted in to any token (`allowedAssets: true`), as a buyer who pays only on that network, in that token, would. This catches a broken second chain next to a working first one.
3. **The token's own contract**, read from keyless public RPCs (at most 2 calls a second, cached 7 days): does it exist, its EIP-712 domain, EIP-3009 support.
4. **Classified** in the Oct 21, 2026 lint run's outcome classes, ported from its `stock_outcomes.py`, `lintlib.py` and `analyze.py` (no new classes):

| Outcome | Plain words | Judged |
|---|---|---|
| `FAIL_V1_NETWORK_NAMES_IN_V2` | v1 network names like `base` in a v2 challenge | fails |
| `FAIL_WRONG_EIP712_DOMAIN` | `extra.name` / `extra.version` don't match the token | fails |
| `OVER_AUTHORIZE_VALIDITY_OVER_1_DAY` | payment valid over a day (`maxTimeoutSeconds` > 86,400, or a Unix time) | fails |
| `FAIL_ASSET_NOT_A_CONTRACT` | no contract at the asset address | fails |
| `FAIL_V2_BODY_ONLY_NO_HEADER` | v2 challenge in the body, no `PAYMENT-REQUIRED` header | fails |
| `FAIL_NO_X402_CHALLENGE` | a 402 with no x402 offer (a paused deployment, say) | fails |
| `FAIL_TOKEN_HAS_NO_EIP3009`, `FAIL_OTHER` | EIP-3009 offer for a token without it; any other client error | fails |
| `SIGNS_VALID_AUTHORIZATION`, `SIGNS_DOMAIN_UNVERIFIED` | a payment the token would accept (or whose domain couldn't be read) | passes |
| `POLICY_OVER_1_USD_DEFAULT_CAP`, `OUT_OF_SCOPE_*`, `TESTNET_ONLY_OFFER_SELECTED` | outside what the stock buyer pays | reported, not judged |
| `NO_402_RESPONSE`, `NETWORK_ERROR` | probe states, not x402 classes | down |

The first six are the classes on the watch page. The lint run's field-level findings (classes 1 to 8) ride along as detail.

5. **Compared with the last run**, per endpoint and buyer: `breaks` (now fails or answers no 402, or fails for a new reason), `recovers` (passes again, or the failing offer left the 402), `changes` (anything else, like a price over the $1 cap). An endpoint's first run is a baseline. A subscriber gets a report only when one of their endpoints breaks or recovers; `changes` ride along, or stay in the day's `daily.json`.

It can't see what happens after a payment (the seller's handler, the facilitator's uptime) or non-EVM buyers.

## Commands

From this directory, after `pnpm install --ignore-workspace --frozen-lockfile`:

```bash
./node_modules/.bin/tsx src/cli.ts check api.example.com                 # /.well-known/x402, then /openapi.json
./node_modules/.bin/tsx src/cli.ts check https://api.example.com/v1/quote --method POST --body '{"q":1}'
./node_modules/.bin/tsx src/cli.ts daily --dry-run                       # reports beside the run, state untouched
./node_modules/.bin/tsx src/cli.ts daily [--only s001]
```

Discovery takes endpoints on the document's own host only; path templates and other hosts are listed as skipped.

## Files

State lives outside the repo in `~/.x402-watch` (or `$X402_WATCH_HOME`, or `--home DIR`), `0700`, files `0600`: `watchlist.json` (private), `state.json`, `tokens.json`, optional `rpc.json` (per-chain RPC overrides, never printed), `runs/<day>/probes.jsonl` (every request and answer), `runs/<day>/daily.json`, `alerts/<day>/<id>.txt` (change reports), `checks/<stamp>-<target>.txt`.

```json
{
  "subscribers": [
    {
      "id": "s001",
      "name": "Example Co",
      "email": "ops@example.com",
      "endpoints": [
        { "url": "https://api.example.com/v1/quote" },
        { "url": "https://api.example.com/v1/report", "method": "POST", "body": "{\"symbol\":\"BTC\"}" }
      ],
      "discovery": ["https://api.example.com/.well-known/x402"]
    }
  ]
}
```

`id` names the report file. `discovery` documents are re-read daily for new routes (one request each). `"paused": true` skips a subscriber and keeps their state. The job never reads `email`.

## Install (ops host)

```bash
cd ~/Forge/chainward && git pull --ff-only
cd scripts/x402-watch && pnpm install --ignore-workspace --frozen-lockfile && ./node_modules/.bin/vitest run
mkdir -p ~/.x402-watch && chmod 700 ~/.x402-watch
printf '{\n  "subscribers": []\n}\n' > ~/.x402-watch/watchlist.json && chmod 600 ~/.x402-watch/watchlist.json
```

A wrapper (`~/bin/x402-watch-daily.sh`):

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Forge/chainward/scripts/x402-watch"
./node_modules/.bin/tsx src/cli.ts daily "$@" >> "$HOME/.x402-watch/daily.log" 2>&1
```

and a crontab line: `17 6 * * * $HOME/bin/x402-watch-daily.sh`. Re-run the `pnpm install` after any pull that touches this directory.

## Tests

`./node_modules/.bin/vitest run` and `./node_modules/.bin/tsc --noEmit`. The classifier runs on ten real 402s from the Oct 21 outreach re-probe, scrubbed (`test/fixtures/probes/`): hosts are `api.example.com`, paths generic, payTo, descriptions, error text and extensions replaced or dropped, and a mistyped asset and a timestamp swapped for made-up ones of the same kind. `test/fixtures/tokens.json` holds their tokens' facts, read from public RPCs on 2026-10-21. The diff and the daily run use a temporary home directory and a fake network.

This package is not a pnpm workspace member, so root `pnpm typecheck` and `pnpm test` skip it (root `pnpm lint` covers it). Adding it to the workspace re-resolved `viem` for unrelated web and api dependencies in the root lockfile; it keeps its own lockfile instead, pinned to versions already in the root one.
