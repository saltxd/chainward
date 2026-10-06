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
- All three paid checks (`/api/risk/x402`, `/api/risk/seller-demand`,
  `/api/risk/hires`) take `chain=bsc`; payment itself is always USDC on Base.
- Spam-sender filtering (`spam-tokens.ts`) is Base-tuned; BSC airdrop spam is
  not filtered yet.

## Manual verification

```bash
pnpm --filter @chainward/indexer exec tsx scripts/verify-bsc-risk.mts 0x<address> [0x<address> ...]
```

Runs the worker's core path (fetch → classify → flags) against the live RPC and
prints the window, balances, activity, flags and `not_assessed`. No Redis/DB.

## Seller check on BSC

`GET /api/risk/seller-demand?address=<seller>&chain=bsc` (0.10 USDC on Base) walks the
seller's USDT/USDC inflows on BNB Smart Chain the same way the Base check walks USDC:
top 30 buyers, each buyer's largest funder back up to 4 hops, hubs stop the walk.
Data comes from `alchemy_getAssetTransfers` on `bnb-mainnet.g.alchemy.com` (same key as
Base; the network must be enabled for the app in the Alchemy dashboard, or set
`SELLER_DEMAND_BSC_RPC_URL`). 30 days = 5.76M blocks at ~0.45 s. Built for BNB Chain's
Set and Earn verification ("3 hires from wallets you neither own nor fund") and the nine
shortlisted marketplaces; a marketplace escrow or an agent's payout wallet is a valid target.

## Hire check (Set and Earn)

`GET /api/risk/hires?agent=<ERC-8004 id | 0x owner>&chain=bsc` (0.10 USDC on Base,
`X402_HIRES_PRICE`) answers Set and Earn's "3 completed hires from 3 distinct wallets
that are not yours and not funded by yours" for one agent. BNB Chain only:
`chain=base` is a 400. Code: `packages/decode/src/hire-check.ts` (verdicts, method,
limits) and `hire-sources.ts` (BSC reads); route `hiresCheck` in
`apps/api/src/routes/risk.ts`.

- **Agent.** An id resolves through the Identity registry `0x8004A169…a432`
  (`ownerOf`, `getAgentWallet`). An owner address uses the registry's `Transfer`
  events to it in the last 60 days (Alchemy's ERC-721 transfer index, one call),
  keeping tokens it still owns (more than 50 → 400, ask per id).
- **Hires.** TermiX escrow `OrderCreated` on `0x6A52…913C` (USDC) and `0xCE02…544c`
  (USDT), filtered on the indexed provider agent id; the shared ERC-8183 kernel
  `0xEa4D…EBA6` `JobCreated`, filtered on the indexed provider (owner or agent
  wallet). Window: 30 days back from the head, never before block 125,000,755
  (Set and Earn's first block). The hirer is the indexed client in both events.
- **Funding.** For each hirer (first 20 by first hire), its first incoming BNB
  (`external` only: Alchemy has no internal transfers on BNB) and first incoming
  USDT/USDC, back up to 4 hops; the same for the owner and agent wallet. A hub
  (100,000+ sent transactions, or 1,000+ stablecoin inflows in 30 days, the seller
  check's rule) or a contract stops a trail; an EIP-7702 delegated wallet counts as
  a wallet.
- **Verdicts.** `owner` (hirer is the owner or agent wallet) → `owner_funded` (owner
  or agent wallet in the hirer's trail) → `shared_funder` (trails meet at a non-hub,
  non-contract wallet, or the hirer is in the owner's trail) → `inconclusive` (a hirer
  trail ends at a hub or contract, nothing visible, or not traced) →
  `independent_within_limits`. `summary.passes_three_independent` needs 3 of the last.
  `independent_within_limits` is no link found within these limits, not proven
  independence; the response's `method` and `limits` say so.
- **RPCs.** Logs, `eth_call`, code, nonce and block headers go to the public BSC list
  (`BSC_RPC_URL`, sentio by default): Alchemy's free tier caps `eth_getLogs` at a
  **10-block** range on BNB (measured 2026-10-05). `alchemy_getAssetTransfers` and the
  head go to the Alchemy BNB URL, as for the seller check. A log chunk no endpoint
  can read fails the check (never a partial hire count).
- **Same rules as the seller check.** Cached in Redis for an hour
  (`hires:bsc:<id|owner>`), 50 s budget → 504 `CHECK_TIMEOUT`, no Alchemy URL or BNB
  not enabled → 503 `UNAVAILABLE`, unknown agent id → 404. Any non-2xx is not settled.
- **Pairwise only.** A closed group of wallets hiring each other can look unlinked
  pair by pair (see the Set and Earn week-one decode); the check does not group
  hirers across agents.

## Set and Earn board

`chainward.ai/set-and-earn` and `GET /api/set-and-earn/board` (free, `Cache-Control:
public, max-age=300`, 503 until the first build): every ERC-8004 agent on BSC
mainnet hired since block 125,000,755 (Oct 1 00:00 UTC), whenever it was registered
(the campaign rule asks for hires, not a new agent), with the hire check's summary for
those with 3+ distinct hirers. `registered_during_campaign` marks agents registered
from that block to the last block of Nov 5 UTC; `agents_registered` counts those,
`agents_hired` every row. Hires and completions keep counting after the campaign
closes. Built daily at 06:00 UTC by the indexer
(`packages/indexer/src/workers/setAndEarnBoard.ts`; pure part in
`packages/decode/src/set-and-earn-board.ts`), and at startup when
`set-and-earn:board:latest` is missing.

- **Incremental.** Registry (`Registered`, `URIUpdated`, `Transfer`,
  `MetadataSet("agentWallet")`) and marketplace (`OrderCreated`/`OrderSettled`,
  `JobCreated`/`JobCompleted`) logs are read from cursors
  `set-and-earn:cursor:{registry,hires}` on the public BSC RPCs; registrations,
  hires and completions live in `set-and-earn:{registrations,hires,completions}`. A
  daily run reads ~192,000 new blocks (~40 `eth_getLogs`), plus a 2,000-block overlap
  below each cursor, since a pool node behind the head can return a range short
  without an error. Once the head passes the campaign's end, its last block is found
  by binary search over headers and kept in `set-and-earn:end-block`.
- **Older agents.** Every TermiX hire is kept, for any agent id. An agent the board
  shows (top 500 by hires) or traces that wasn't seen registering is read once from
  the registry (`ownerOf`, `getAgentWallet`, `tokenURI`) and cached in
  `set-and-earn:registrations`; registry events keep it current afterwards. Its
  `registered_at` comes from its mint to the current owner (Alchemy's ERC-721
  transfer index, one call per owner, at most 100 owners a run; null if it was
  transferred). ERC-8183 providers are matched to the agents they own with the hire
  check's `agentsOwnedBy` (registry transfers to them in the last 60 days), cached a
  week in `set-and-earn:provider:<address>`.
- **Marketplace** is the week-one decode's rule: a campaign host (termix, agentsouk,
  dolphinamp, hellofugu, kattegat, marque, pokter, agent-atlas, mandatemarkets)
  anywhere in the agentURI, else `other`, or `none` for an empty URI.
- **Verdicts** come from `assessHirers`/`summarizeHirers` on the production funding
  graph (Alchemy BNB URL from `sellerDemandRpcUrl`, so the indexer needs
  `SELLER_DEMAND_BSC_RPC_URL` or a Base Alchemy URL to derive it; off without one).
  Funder lookups (first funder as `{from, block}`, hub and contract flags) are cached
  in `set-and-earn:funder:<address>` for 30 days from the address's first lookup;
  Alchemy lookups are paced (`SET_AND_EARN_ALCHEMY_RPS`, default 2/s, leaving room
  for paid checks) and capped per run (`SET_AND_EARN_TRACE_BUDGET`, default 3,000,
  checked before each agent starts). An agent past the cap, or whose
  check fails twice, keeps its previous verdict (`checked_at` says when), else shows
  `pending` / `error`.
- **Differs from the paid check** in three places: hires count from Oct 1 rather than
  the last 30 days; owner and agent wallet come from the registry's events up to
  `as_of` rather than `ownerOf`/`getAgentWallet` calls (the same values); and hub and
  contract flags can be up to 30 days old.
