# Publish checklist: px402-private-payments (DRAFT)

Every claim in `decode-draft.md` and `thread-draft.md`, mapped to its source. Snapshot: **Base block 52,833,048, 2026-10-20 00:17:23 UTC** (Blockscout's indexed head when the pulls started at 00:19 UTC; the latest item in the pulls is at block 52,831,255). First pass was at block 52,830,564 (22:54:35 UTC Oct 19); between the two snapshots there were no new payments, deposits or withdrawals, only 63 more reimbursements and one more issuer spend total.

**Privacy rule for this file.** It names protocol addresses only (reserve contract, deployer, issuer, registry, relayers). User-side claims (the two reserves, their two funders, their deposits and withdrawals) are sourced by event type and by local file, never by address or tx hash. Local files under `data/` and `finding.md` DO contain user-side identifiers: keep them out of the public repo (see the pre-publish list).

Shorthand used below:
- `RESERVE` = 0xdd31c57E8F7CAC78090a516292f0C9Dea6c6119f; relayer A = 0x6f890cc63aa57da9695528c9f5e3434897b32b8e; relayer B = 0x47e5499c44ecf8c78da82b9b64183df1e301a0b4; deployer = 0xa116959Ffe4f64B82e294eF2209B34423C078e9F; issuer = 0xb1025af12f16dce40b27057d22d0518674857ab8; registry = 0x3a647497dc0d0806991ada9752cafeee34553d1e.
- `BS logs` = `https://base.blockscout.com/api/v2/addresses/RESERVE/logs` (1,310 items to the snapshot). `BS tt(x)` = `/api/v2/addresses/x/token-transfers?type=ERC-20&token=USDC`. Saved locally as `data/refresh-20261020/{reserve_logs,reserve_tt,r1_tt,r2_tt}.jsonl` (local only; first pass in `data/refresh-20261019/`).
- `totals` = `python3 -I scripts/refresh_totals.py data/refresh-20261020 52833048`; `state` = `python3 -I scripts/state_reads.py <rpc> 52833048 data/refresh-20261020`, run on base.drpc.org, base-mainnet.public.blastapi.io and mainnet.base.org (identical results; base-rpc.publicnode.com now refuses a block this old with 403).
- Event topics (keccak of the verified ABI's signatures): Deposit `0xe31c7b8d…`, WithdrawAuthorized `0x0d2b0a4c…`, Redeemed `0x61d905e6…`, PayoutRecorded `0xdb2f7f81…`, Bonded `0x524384ad…`, SpendRootCommitted `0x92b3c69e…`, RelayerRegistered `0xd7c6894a…`.

## Framing and public claims

| Claim | Source |
|---|---|
| Virtuals posted "Private agent payments are live on Virtuals Protocol" on Oct 19, 12:05:51 UTC, quoting PRXVT's Oct 6 post | `https://api.fxtwitter.com/virtuals_io/status/2112153249017143314` (created_at Mon Oct 19 12:05:51 +0000 2026; quote = x.com/PRXVTai/status/2107549502835978562, created Tue Oct 06 19:12:12 +0000 2026) |
| 46,378 views when read on Oct 20 at 00:23 UTC | same fxtwitter endpoint, `views` field (45,130 at 22:55 UTC Oct 19). **Re-read at publish if the post goes out later; it will be higher.** |
| px402 is PRXVT's privacy layer for x402; payments "stop revealing who made them" | docs.prxvt.com/getting-started/what-is-px402.md, line 5 |
| x402 and facilitator definitions | house definitions, same wording as x402-top-ten-self-funded |

## Design and credit

| Claim | Source |
|---|---|
| Issuer signs coins without seeing them, cannot recognize them when spent | what-is-px402.md: "The issuer signs each coin without ever seeing it, so it cannot recognise the coin when it is spent." |
| Contract has no owner, no pause, no admin withdrawal | Verified ABI from basescan.org/address/RESERVE#code: no owner/pause/admin/allow/block function; only `freezeRedemption` (a challenger mechanism with a $10,000 bond) and `FREEZE_DURATION` matched. Docs Security section: "The contract has no owner and no admin withdrawal" |
| Source verified, exact match | basescan.org/address/RESERVE#code: "Exact Match", contract name PX402Reserve, v0.8.28+commit.7893614a (fetched 2026-10-19 ~23:05 UTC) |
| `reclaimBalance` returns unspent USDC on the reserve's own signature | ABI function list; SDK guide error table (`RESERVE_SCREENED` row: "the contract's `reclaimBalance`, signed by the reserve key ... pays it back to your reserve address") |
| Issuer's keys committed on chain eight minutes after deploy | tx 0x4f4ef46861ce93cc42a9352921130a85982561d2b72b64061f3ab69ce15a04d5, block 52,221,657, 20:37:41 UTC, sent by the issuer to RESERVE (receipt read on ChainWard's node). Deploy was 20:29:55: 7 min 46 s |
| SDK refuses a key the contract did not commit | SDK guide: `PX402KeysetCommitmentError` row ("The issuer served a keyset the reserve did not commit on chain ... Stop. Do not withdraw."); docs "Verifiable keys" bullet |
| "makes it hard for the issuer to give one wallet a key that marks its coins" | Inference from the two rows above (one committed keyset, epoch 1; wallets reject uncommitted keys). Worded as an inference |
| Docs table of what each party sees, incl. "one operator running issuer, registry and facilitator, logging network addresses" | SDK guide section 11 table (QUICKSTART.md lines ~1270 to 1278) |
| Timing quote: "a payment made soon after your own withdrawal can be matched to it by timing when few other wallets withdraw in between" | QUICKSTART.md lines 20 to 22 ("Pre-fund early: ...") |
| FAQ quote: "No address links a payment to the agent's deposit" | docs.prxvt.com/resources/faq.md, "How private is px402?" |
| Floats, "$5 by default", "learns your float, not your price" | QUICKSTART.md lines 86 to 91 and the `float` option row (line 159) |
| SDK guide version | `https://cdn.jsdelivr.net/npm/px402@2/docs/QUICKSTART.md` served `x-jsd-version: 2.0.2`, byte-identical to `px402@2.0.2`; npm registry: 2.0.2 published 2026-10-06T16:09:50Z, MIT |

## Protocol wallets

| Claim | Source |
|---|---|
| Reserve deployed Oct 5 20:29:55 UTC, block 52,221,424, by the deployer | creation tx 0xf48758770e9633cda7ca261ef59c41aecdad0023c8164b9b95e8f1175e8fdeaf: Blockscout `/api/v2/transactions/<tx>` (created_contract = RESERVE, from = deployer) and receipt on ChainWard's node |
| Deployer funded both relayers with $200 each | BS tt(relayer A), BS tt(relayer B): four 100 USDC transfers from the deployer, 2026-10-05 20:18:07, 20:19:03, 20:23:13, 20:23:43 UTC (two per relayer) |
| Both relayers got their first USDC and ETH from the deployer on Oct 5 | same four USDC transfers (earliest USDC rows: blocks 52,221,070 and 52,221,098); Blockscout `/addresses/<relayer>/transactions`: earliest tx is 0.002 ETH from the deployer at 20:25:43 (A) and 20:25:19 (B); deployer is the only ETH sender to either |
| `issuer()`, `registry()` | `state` at block 52,833,048 |
| Relayer A registered at deploy | RelayerRegistered(relayer A) log in the creation tx receipt |
| Relayer A $100 bond | tx 0x6e3e7840ba3b991072eb09482513b17e51591a8726db63b4309452c0e89cb303, block 52,221,666: Transfer A to RESERVE 100 USDC + Bonded |
| Relayer B registered with $100 bond | tx 0x941204003dae596af0b78ac36d33fb8b9bd8bbc9a565df11bbaa00d5ecea384e, block 52,221,673: RelayerRegistered + Transfer B to RESERVE 100 USDC + Bonded |
| `relayerCount()` is 2 | `state`; `relayerList(0)` = A, `relayerList(1)` = B, `relayerList(2)` reverts |

## What the seller sees

| Claim | Source |
|---|---|
| Launch-day test payment: tx 0xd8f4212c2d13f77d29f7ce791182df8f765d20cefa4440dc99c88f00df1e4468, block 52,223,235, 21:30:17 UTC; sent by a Coinbase facilitator wallet; relayer A is the authorizer; $0.001 relayer A to seller | Receipt on ChainWard's node: tx.from 0x4c934c63…, selector 0xe3ee160e (`transferWithAuthorization`), logs AuthorizationUsed(authorizer = relayer A) + Transfer(A to 0xb5f08f2d…, 1000). 0x4c934c63c786157fefd990945b25ea60a0fb0205 = `coinbase` in `deliverables/x402-on-base/x402scan-facilitators-base-f205fbe.csv` |
| That payment is PRXVT's test | The only reserve with coins at that time was the test reserve (its deposit and withdrawal were 21:28 UTC that day); the second reserve's first deposit is on Oct 15 (Deposit events, BS logs) |
| All 691 have that shape; Coinbase 687, PayAI 3, Dexter 1 | tx.from of every payment tx: `data/pay_meta.jsonl` (ChainWard node), `data/pay_meta_tail.jsonl` (Alchemy, by hash), `data/refresh-20261019/pay_meta_tail2.jsonl` (publicnode, the 19 payments after block 52,818,898), matched against the x402scan CSV. Selectors: 688 `transferWithAuthorization`, 3 Multicall3 `aggregate3`. No payment after block 52,830,564 (the last is at 21:46:33 UTC Oct 19), so the attribution covers every payment to the snapshot |
| None was a native px402 settlement | PRXVT's facilitator signers are the two relayers (`GET https://facilitator.prxvt.com/supported`, `signers.eip155:8453`); no payment tx was sent by a relayer |

## Usage totals (block 52,833,048)

| Claim | Source |
|---|---|
| 2 reserves ever funded; 3 deposits, $11.00, from 2 funding wallets | Deposit events in BS logs (`totals`: "deposits 3 total $11.000 reserves 2 funders 2"); RESERVE USDC in = 5 transfers, $211.000 = $200 bonds + $11 deposits (BS tt(RESERVE)) |
| 12 withdrawals, $8.37 | WithdrawAuthorized events ($8.366, 2 reserves); `finalizedDebits()` = 8,366,000 |
| 691 payments, $0.820, 562 at $0.001, 129 at $0.002, 43 sellers | USDC transfers out of relayers A and B, excluding their two $100 bonds to RESERVE (BS tt(A), BS tt(B); `totals`). A 359, B 332. PayoutRecorded events = 691 |
| 576 reimbursements, $1.260 | `redeemed()` = 1,260,000. Blockscout lists 575 Redeemed events ($1.258); the 576th is tx 0xa4416674f9cbd4b8986b315be5ef3a08a4c08285d35b13dce59f5d22c005e329 (block 52,809,468, sent by relayer B, status 1, Transfer RESERVE to B 0.002 + Redeemed; receipt via base.drpc.org). `redeemed()` first diverges from the Blockscout event sum at that block (1,033,000 vs 1,031,000; binary search over `eth_call`). Blockscout `/api/v2/transactions/<tx>` returns no record (re-checked Oct 20 00:2x UTC: still missing). The gap is still only that tx: `redeemed()` at 52,830,564 was 1,131,000, plus 63 Blockscout-listed reimbursements ($0.129, the 23:10 to 23:17 UTC burst) = 1,260,000 |
| Relayer bonds $200.00 | `totalBonded()` = 200,000,000; 2 Bonded events |
| USDC in the contract $209.74, $200 of it bonds | USDC `balanceOf(RESERVE)` = 209,740,000 on three RPCs = $211.000 in minus $1.260 out. Remainder: $2.634 unspent in one reserve slot + $7.106 withdrawn and not yet redeemed ($8.366 minus $1.260; `reserves()` slot read, local only) |
| Relayer balances reconcile | `balanceOf` A = 100,230,000, B = 100,210,000; Blockscout-implied A 100.230, B 100.208 + the missing $0.002 = 100.210 |
| Daily table (payments, $, sellers per UTC day) | `totals` day table at 52,833,048: Oct 5 4 / $0.004 / 1; Oct 6 to 14 none; Oct 15 157 / $0.189 / 34; Oct 16 192 / $0.230 / 25; Oct 17 111 / $0.135 / 23; Oct 18 112 / $0.126 / 25; Oct 19 115 / $0.136 / 22. Sums: 691 payments, $0.820, 43 distinct sellers. Oct 19 is now a full day (115, unchanged); Oct 20 row = 0 payments to 00:17 UTC |
| "14 days" | deploy 2026-10-05 20:29:55 to snapshot 2026-10-20 00:17:23 = 14 days 3.8 h |

## Who is paying (aggregate only)

| Claim | Source |
|---|---|
| One reserve is PRXVT's test: its funder got 1.1 USDC + 0.001 ETH from the deployer at 21:27 UTC Oct 5 and deposited $1.00 a minute later | Blockscout token-transfers and transactions of that funder (fromDeployer = true for both, 21:27); its Deposit event at block 52,223,188, 21:28 UTC. Identifiers withheld here; see `finding.md` section 2 (local only) |
| The test reserve has not deposited or withdrawn since Oct 5 | Deposit and WithdrawAuthorized events per reserve (`totals --private`: 1 deposit, 1 withdrawal of $1.00); `reserves()` slot balance 0, nonce 1 |
| The other reserve's funding did not come from PRXVT's wallets | Its funder's USDC and ETH inflows are from non-PRXVT senders (Blockscout, one hop). Scope: one hop |
| Nothing we read ties it to Virtuals | Scoped negative; no Virtuals wallet among the funders or one hop up. Not an exhaustive search |
| Median gap about seven minutes; 42 sellers since Oct 15 | `totals`: median gap 406 s (all payments and since Oct 15); distinct payTo since Oct 15 = 42 (43 including the launch-day seller) |
| Since the Virtuals post: 57 payments, one top-up by an existing reserve, no new reserve | Relayer outflows and Deposit events from 2026-10-19T12:05:51Z to block 52,833,048: 57 payments, $0.063; 1 Deposit, 0 reserves not seen before |
| "One paying user" | 2 funded reserves, one being the operator test above. Wording relies on that; see Limits in the decode |

## Privacy measures

| Claim | Source |
|---|---|
| Reserves that had withdrawn before the payment: 2 for 687, 1 for 4 | `totals`: `{1: 4, 2: 687}` |
| Reserves that withdrew in the prior 24 h: none 484, 1 for 207, never 2 | `totals`: `{0: 484, 1: 207}` |
| Latest withdrawal to payment: median 34 h, 39 within an hour | `totals`: median 123,950 s; 39 within 3,600 s (12 within 600 s) |
| Deposit to first same-reserve withdrawal: 2 to 20 s | `totals`: [20, 2, 2] |
| Issuer spend total $1.688 by Oct 19 23:08 UTC; test reserve withdrew $1.00; so at least $0.68 from the other reserve | SpendRootCommitted tx 0xe17bdf42f57d7050210a3ea9b7b30a98ad263f7e33af40436fb5b5f30ddef847, block 52,830,996, 23:08:59 UTC, snapId 10, totalSpent 1,688,000 (latest of 11 such events at the snapshot; the previous, snapId 9, was $1.531 at 11:08:59, tx 0xbd2773399a079a3c764a7769076cc782629ff69eee1a51d33664cdcdf7d0eaae); test reserve's single WithdrawAuthorized = $1.00 |
| One PayoutRecorded per payment (691 = 691) | PayoutRecorded count in BS logs vs payment count |

## Cost

| Claim | Source |
|---|---|
| First 576 payments are 468 at $0.001 and 108 at $0.002; reimbursements are 468 at $0.002 and 108 at $0.003 | Payments sorted by (block, logIndex), first 576 counted; Redeemed amounts: Blockscout 467 x 2,000 + 108 x 3,000, plus the missing tx (2,000). 115 payments (Oct 19) not yet reimbursed |
| Fee rounded up to the smallest coin, $0.001 | `/supported`: `feeRounding: "smallest-denomination"`, facilitator `feeBps: 100`, relayers `feeBps: 25`; smallest coin $0.001 per the SDK's denomination ladder (finding.md section 1) |
| Sellers received $0.684, relayers repaid $1.260 for those 576 | 468 x 0.001 + 108 x 0.002 = 0.684; `redeemed()` |

## Screening

| Claim | Source |
|---|---|
| `deposit(reserveAddr, amount)`, no allowlist, blocklist, owner or pause | Verified ABI (Basescan) |
| `RESERVE_SCREENED`, `PAYEE_SCREENED`, fails closed on `SCREENING_UNAVAILABLE` | SDK guide (px402 2.0.2) error table, QUICKSTART.md lines 1181 to 1185 and 1194 |
| Which lists are used is not documented | grep of QUICKSTART.md, docs.prxvt.com pages (what-is, how-to-use, token overview, FAQ) and `/supported`: no list, provider or policy named |
| 4 user-side + 6 protocol addresses, 0 OFAC matches | `packages/decode/src/ofac-snapshot.ts` (0xB10C SDN extracts, 124 EVM addresses, fetched 2026-10-11), checked 2026-10-19 ~23:10 UTC; no new user-side address by block 52,833,048 (still 3 deposits, 2 reserves, 2 funders) |
| ChainWard's counterparty check answers Unknown: Payer hidden, and the wallet check answers Review, for the reserve and both relayers, with the quoted reason; a newer relayer or another privacy pool is not recognized | On main as commit 0a25e40 (PR #61, merged 2026-10-19 23:22:43 UTC); `api.chainward.ai/api/health` reports `version: 0a25e40` (read Oct 20 ~00:25 UTC). `packages/decode/src/verdict.ts` `counterpartyVerdict`: `{ label: 'unknown', text: 'Payer hidden', reason: PRIVACY_RELAY_REASON }`; `packages/decode/src/wallet-lookup.ts:172`: `{ label: 'review', reason: PRIVACY_RELAY_REASON }`; `PRIVACY_RELAY_REASON` and `PRIVACY_RELAY_LIMITS` in `packages/decode/src/privacy-relays.ts` match the decode's wording. The "live since 23:45 UTC" rollout time is from the deploy, not independently timed here |

## Method claims

| Claim | Source |
|---|---|
| Node history to block 52,794,207 matched Blockscout exactly | `finding.md` section 2 Method (earlier pass, same day). ChainWard's node was still at head 52,794,207 at the first pull (Finish stage; Execution at 52,816,349), so it was not used for the tail. Note: its `eth_call` at "52,794,207" returned post-head state (`redeemed()` 1,131,000 where dRPC gives 1,022,000 at 52,800,000), so do not use the node for state reads until it is at the tip |
| Three public RPCs agreed | `state` at 52,833,048 on dRPC, Blast API and mainnet.base.org: identical values (first pass at 52,830,564: publicnode and dRPC, identical) |

## Corrections to carry back into finding.md (internal)

- The node head timestamp is **2026-10-19** 02:42:41 UTC, not 10-18; the "last 38 hours" in section 6 is about 14 hours.
- Section 4 says the SDK and docs mention no screening. The 2.0.2 SDK guide documents issuer-side reserve screening and facilitator-side payee screening (above). The on-chain finding (permissionless deposit) stands.
- 512 melts / $1.129 was Blockscout's count at the first pass; the chain had 513 / $1.131 (missing tx above; now 576 / $1.260). The finding's reconciliation used `redeemed()` and was right.

## Pre-publish

- [ ] **Do not commit `finding.md`, `data/` or this folder wholesale.** The repo is public and neither is gitignored; `data/*.jsonl` and `finding.md` contain the active reserve's address, its funder and its tx hashes. Commit only the decode (and, if wanted, the thread and this checklist), or gitignore `deliverables/px402/data/` and `deliverables/px402/finding.md` first.
- [ ] Re-pull on the day: the four `bs_page.py` pulls into a fresh `data/refresh-YYYYMMDD/`, then `totals` and `state` at Blockscout's head block. If `redeemed()` differs from the Redeemed event sum, Blockscout is missing a melt again: binary-search `redeemed()` to find it. Update every number, the as-of block and time, the view count and the "since the Virtuals post" line. If a third reserve appears, the counts change; the story does not.
- [x] Relay label merged and deployed (0a25e40, PR #61); ChainWard paragraph updated, editor note removed.
- [ ] Rename `decode-draft.md` to `decode.md`, remove `draft: true`, set `date`. Until then `draft: true` is what keeps it off the site: the loader takes the first non-skipped `.md` in the folder, and `decode-draft.md` sorts first.
- [ ] `node scripts/build-decode-manifest.mjs` and commit `apps/api/src/data/decode-manifest.json`.
- [ ] `pnpm decode:og-render px402-private-payments` to `apps/web/public/decodes/px402-private-payments/og.png` (1200x675).
- [ ] Push to main, wait for Flux, confirm `chainward.ai/decodes/px402-private-payments` is 200 and og:image is the static file.
- [ ] One @chainwardai thread only, link in the last post, no link replies to PRXVT or Virtuals posts (spam-label rule), max one post that day.
