# BNB Chain (BSC) risk check

The free risk check runs on BNB Chain (chain id 56) as well as Base. Same
classifier, same report page, same integrity rules — read from public JSON-RPC
only, because there is no Blockscout for BSC and we run no BSC node.

## How to use it

- **Web:** the home intake has a Base / BNB Chain toggle. BSC reports live at
  `/report/<address>?chain=bsc`; bare `/report/<address>` is still Base.
- **API:** `POST /api/risk/check` takes `chain: 'base' | 'bsc'` (default base).
  `GET /api/risk/report/:address?chain=bsc`, `GET /api/risk/library?chain=bsc`
  (cards carry `chain` and a chain-aware `report_url`). Poll ids look like
  `risk-bsc-<address>`.
- **Handles (`@name`)** resolve through Virtuals ACP, which is Base-only; on BSC
  they return `INVALID_TARGET` with a message saying so.

## What the check reads

| Need | Base | BSC |
|------|------|-----|
| Transfer list | own node `eth_getLogs` (30d), Blockscout fallback | public RPC `eth_getLogs`, bounded window (default **14 days**); BscScan `tokentx` (30d) when `BSCSCAN_API_KEY` is set |
| Code / nonce / native balance | own node | public RPC |
| USDC / USDT balance | own node (USDC 6 dp) | public RPC (`0x8AC7…580d` / `0x55d3…7955`, **18 dp**) |
| ACP claims, handle, peers | acpx.virtuals.io + observatory | not available → `not_assessed` |
| Attestation | EAS on Base | none yet → `not_assessed` (BAS later) |

The adapter is `packages/decode/src/rpc-fixtures.ts` (`fetchRpcFixtures`). It
produces the same fixture shape the Base path does, so `computeQuickDecodeData`
and `deriveRiskFlags` run unchanged with `chain: 'bsc'`. Chain config lives in
`packages/common/src/constants/riskChains.ts` (`RISK_CHAINS`).

### The log scan

- `eth_getLogs` on the ERC-20 `Transfer` topic with the wallet as `from` and as
  `to`, newest chunk first, 8 chunks in flight, under a wall-clock budget.
- Chunk size starts at the endpoint's measured cap (sentio: **10,000 blocks**)
  and halves on a range/size error. Any other error truncates the scan once
  recent chunks have succeeded; only a failing newest chunk moves to the next RPC.
- Block timestamps are interpolated from the measured block rate (~0.45 s on
  post-Maxwell BSC, measured over a 100k-block span each run).
- Results are capped at 2,000 transfers (newest kept). Busy wallets hit the cap
  within hours of history; the report says so.
- Cached in Redis per `(chain, address, window)` for 10 minutes.

**The report records what the scan actually covered.** `fetch_meta.window_days`
is the span read (fractional when the scan stopped early), and
`window_requested_days` is kept when it fell short. The `not_assessed` list,
the `inactive_no_history` / `activity_truncated` evidence, the coverage block
and the zero-flag copy all use that number — never an implied 30 days.

### Flags on BSC

Chain-agnostic checks run: `dormant_wallet`, `stranded_value`,
`counterparty_concentration`, `inactive_no_history`, `activity_truncated`.
Base-only checks are skipped and NOT listed as "not raised":
`claim_vs_chain_offline` (ACP), `factory_proxy_clone` (Virtuals factory),
`cluster_collapsed` (observatory). Flag sources cite `bscscan.com`.

## Two-stage fetch

`POST /api/risk/check` runs inside a 30 s web-proxy timeout, so the API's
history gate + teaser use a **shallow** fetch (1-day window, 8 s budget); the
worker then runs the **full** window (14 days, 45 s budget) under its 120 s
watchdog. Separate cache keys (`…:1d`, `…:14d`).

Measured 2026-10-03 against `rpc.sentio.xyz/bsc`: a quiet wallet's full 14-day
scan took ~35 s (538 calls); a hub wallet hits the transfer cap in ~2 s.

## Endpoints (keyless, measured 2026-09-30 / 10-03)

| Endpoint | Logs | Notes |
|----------|------|-------|
| `https://rpc.sentio.xyz/bsc` (default) | 10,000-block cap, fast | occasional "block beyond latest" race in its pool → retried 2 blocks lower |
| `https://public-bsc.nownodes.io` | ~200k-block spans OK, ~4 s/call, 30 s server timeout | fallback |
| `https://56.rpc.thirdweb.com` | 1,000-block cap | fallback |
| `bsc-dataseed*.bnbchain.org` | refuses `eth_getLogs` | not used |
| `bsc-rpc.publicnode.com` | recent ~100k blocks only | not used |

## Env vars

| Var | Default | Purpose |
|-----|---------|---------|
| `BSC_RPC_URL` | `https://rpc.sentio.xyz/bsc` | primary RPC |
| `BSC_RPC_LOG_CHUNK_BLOCKS` | `10000` | primary's `eth_getLogs` span cap |
| `BSC_RPC_FALLBACK_URLS` | nownodes, thirdweb | comma-separated fallbacks |
| `RISK_RPC_WINDOW_DAYS` | `14` | worker scan window |
| `RISK_RPC_SCAN_BUDGET_MS` | `45000` | worker scan budget |
| `RISK_RPC_SCAN_CONCURRENCY` | `8` | chunks in flight |
| `RISK_RPC_PRECHECK_WINDOW_DAYS` | `1` | API gate/teaser window |
| `RISK_RPC_PRECHECK_BUDGET_MS` | `8000` | API gate/teaser budget |
| `BSCSCAN_API_KEY` | unset | optional Etherscan-v2 key: 30-day transfers with exact timestamps |

Helm: `bsc.rpcUrl` / `bsc.windowDays` in `values.yaml` → `chainward-config`
ConfigMap (api + indexer). A BscScan key, if ever added, belongs in the secret.

## Limits / known gaps

- No lifetime history without a BscScan key; the window is what it says.
- `token_count` in the teaser = tokens that paid into the wallet in the window
  and still have a balance (checked for up to 20); flagged as a lower bound.
- The history gate only sees USDC/USDT balances + nonce + native + code + the
  1-day transfer window. A wallet whose only footprint is an old inbound
  transfer of some other token reads as `no_history`.
- No attestation on BSC (EAS is not there; BAS is the candidate).
- `x402` paid check and the seller-demand check remain Base-only.
- Spam-sender filtering (`spam-tokens.ts`) is Base-tuned; BSC airdrop spam is
  not filtered yet.

## Manual verification

```bash
pnpm --filter @chainward/indexer exec tsx scripts/verify-bsc-risk.mts 0x<address> [0x<address> ...]
```

Runs the worker's core path (fetch → classify → flags) against the live RPC and
prints the window, balances, activity, flags and `not_assessed`. No Redis/DB.
