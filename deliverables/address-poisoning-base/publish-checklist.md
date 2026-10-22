# Publish checklist: address-poisoning-base (DRAFT, not published)

Every claim in `decode.md` and `thread.md`, mapped to its source and to how it was checked. Measurement window: Base blocks 52,602,209 to 52,904,609 (2026-10-14 16:02:45 to 2026-10-21 16:02:45 UTC). Loss scan to block 52,905,875. State snapshot block 52,906,634 (Oct 21 17:10:15 UTC). ETH price $2,517.65 (Chainlink ETH/USD on Base, read at block 52,905,731, updated 16:39:57 UTC).

**Privacy rule for this file** (it lands in the public repo if the decode ships): transaction hashes in full. Full addresses only for the operator wallet, its imitation contracts, the two wallets Basescan labels as ChangeNOW's, and public contracts (USDC, the Chainlink feed, Coinbase's facilitator). Payee wallets, the wallets that paid look-alikes, and every look-alike are shortened only. `finding.md`, `data/` and `draft/verify/` contain those addresses in full: never copy them into `deliverables/`.

Shorthand:
- `OP` = 0x43b2f01186fda9814c5f40770554ac68fd8304bd (operator wallet). `IMUSDC` = 0x72846b6b37ee99e88e1cfb0acd490ed766d91a00.
- `RPC` = mainnet.base.org (archive). `TND` = base.gateway.tenderly.co (keyless archive eth_getLogs, 1,000-block windows). `NODE` = cw-sentinel, head 52,866,183 when used.
- `FINDING` = `ops/poisoning/finding.md`; `DATA` = `ops/poisoning/data/`; `SCRIPTS` = `ops/poisoning/scripts/` (inv-poison's investigation, Oct 21).
- `V1` = `draft/verify/poison_verify.py` (+ `.log`): payouts, copy tx, OP balance and nonce at both bounds, price feed, `symbol()`, catches 1/4/6, funding, cash-out, agent402 txs. `V2` = `poison_verify2.py`: look-alike pairs in the catch-4 plant, the agent402 copy and WPA's other payout. `V3` = `poison_verify3.py`: imitation-USDC deploy, WPA Oct 16 copy and Oct 21 repeat, catches 2/3/5, agent-control.net, OP state at 52,906,634. `RC` = `poison_recount.py`: local recount of events, addresses, USDC lag, look-alike match, amounts, pairs, EIP-3009. `TR` = `token_and_rate.py`: IMUSDC selectors, `decimals()`, `balanceOf` revert, the 1-in-9 estimate. All re-run by the decode drafter on 2026-10-21, public RPC paced at 2 req/s, no Alchemy key.

## Frontmatter and opening

| Claim | Source | Checked by |
|---|---|---|
| "104 seconds" (title, lede, post) | payout #105 tx 0x49652a25ec3aadf5b4abe30fcb3c61777593989d50f76d2e44669903733817a4, block 52,904,025, 15:43:17 UTC; copy tx 0xfb329dcb45f3e01ef2d65ac9b5404dad3513c57e4bab5f89205baea8c970bb64, block 52,904,077, 15:45:01 UTC; 52 blocks x 2 s. Payout #101 tx 0xcec19f99cfdaf19108dc7313855f2fe0eff23b9f0ec035fdf55047c6f40d0446, block 52,904,023, 15:43:13 (108 s) | V1, `eth_getBlockByNumber` timestamps |
| Two 10-cent bounties, plain USDC transfers, WPA payout wallet (0x2284…4bfb) to treasury (0xf7ee…67cd) | both payout receipts: tx.to = USDC, selector `0xa9059cbb`, one Transfer of 100,000 raw | V1; `https://wouldpayagain.com/api/bounty/status?id=101` and `?id=105`: status paid, verdict accepted, `payout_tx` = the two hashes, `payout_usdc` 0.1 (read Oct 21) |
| Would Pay Again is "a newsletter about x402 payments" | wouldpayagain.com meta description: "A newsletter about the x402 machine-payments economy, sold over x402 itself." (read Oct 21) | curl |
| One new line in each wallet's history: 0.1 from WPA's look-alike (0x2284…94bfb) to the treasury; 0.1 from WPA to the treasury's look-alike (0xf7ee…667cd) | copy tx receipt: 200 Transfer logs from IMUSDC, selector `0x7111a994`, sent by OP; the two logs above | V1 |
| "No money moved" | IMUSDC code has no `balanceOf`, `totalSupply`, `transfer` or `approve`; `balanceOf` reverts | TR |
| Basescan labels OP "Fake_Phishing2822323" | basescan.org/address/OP page title (fetched Oct 21) | curl |
| Subtitle: "about 439,000 payments", "$53 of gas", "plain sends, not x402 payments" | 439,209 pairs (`DATA/summary.json`, `SCRIPTS/pairs.py`); gas below; targeting and x402 rows below | see sections |
| plain: "about 1 in 9 plain USDC payments within minutes" | 1-in-9 row and USDC lag row below | TR, RC |
| Values as of block 52,906,634: OP 0.178921 ETH, nonce 138,930, 0 USDC | `eth_getBalance`, `eth_getTransactionCount`, USDC `balanceOf` at that block | V3 |
| ETH $2,517.65 | `latestRoundData()` on 0x71041dddad3595f9ced3dccfbe3d1f4b0a16bb70 at block 52,905,731: 2517.65, updatedAt 2026-10-21 16:39:57 UTC | V1 |

## What landed in two wallets' histories

| Claim | Source | Checked by |
|---|---|---|
| Copy tx writes 200 transfers copying 100 payments made 44 to 136 s earlier | 200 logs: V1. Lag range: FINDING section 2 (seed batch, median 88 s) | V1 (count); FINDING (lags) |
| One pair copies the payouts to us; another a payout to another contributor | copy tx logs; that payout is tx 0x51e251cb8f4deb25c405d522dab667a8c8212238e85b2b6a30d9b7bb826dd2cb (WPA to 0xb5c1…c8bc, 0.1) | V1, V2 |
| Two identical payouts, one copy; almost every pair copied only once in the week | 182,137 distinct payer and payee pairs in 182,140 USDC copies | RC |
| Look-alike table (first 4 + last 4 identical; longer view 8 + 6) | computed from the four addresses; real: 0x228440f8…894bfb, 0xf7ee6513…2667cd; look-alikes: 0x22848226…b94bfb, 0xf7eea0ba…1667cd | python, by hand |
| 99.95% (182,050 of 182,140) share at least 4 leading and 5 trailing hex characters, both sides | `DATA/match_USDC.jsonl.gz` + `matchpre_USDC.jsonl.gz` | RC |
| IMUSDC created by OP Oct 20 14:02:07 UTC | tx 0xd317b0263ae08a0983e45bc8fe4f049f8d861f26feb6185ef4c0cf38c02c5660, block 52,857,790, receipt `contractAddress` = IMUSDC | V3 |
| Symbol: Ethiopic ሀ, Cyrillic Ѕ and С, one D, six invisible characters | `symbol()`: U+1200, U+200C, U+200D, U+0405, U+200B, U+200C, U+0044, U+200B, U+200B, U+0421 | V1 |
| 6 decimals; no `balanceOf` | `decimals()` = 6; selector scan; `balanceOf` reverts | TR |
| 414 contracts like it in its last 13,930 transactions (nonces 125,000 to 138,929) | CREATE addresses for OP nonces 125,000 to 138,949, code read at each: 414 with `0x7111a994` (2 skeleton variants) | FINDING (`SCRIPTS/create_scan.py`); not re-run |

## How a copy works

| Claim | Source | Checked by |
|---|---|---|
| Each copy = A-look-alike to B and A to B-look-alike, same amount, one tx | pair structure in `SCRIPTS/pairs.py`; seen in every plant re-read (catches 1 to 6, the copy tx, agent402, agent-control) | V1, V2, V3 |
| Catches go both directions | catches 1, 2, 5 = paid the payer's look-alike; 3, 4, 6 = paid the payee's look-alike | V1, V3 |

## One week of the operator wallet

| Claim | Source | Checked by |
|---|---|---|
| 5,446 transactions | OP nonce 133,448 at 52,602,209 and 138,894 at 52,904,609 | V1 |
| 5,410 batch calls + 36 new tokens | distinct txs in the fake logs + CREATE addresses at nonces 133,965 to 138,087 | FINDING; 150-tx sender sample `DATA/verify_senders.json` |
| 884,017 planted transfers | 804,593 (`fake_logs_window`) + 79,424 (`fake_logs_window_pre`) | RC |
| 439,209 pairs | `DATA/summary.json` | FINDING |
| 882,888 distinct addresses | union over both log files | RC |
| About half look-alikes: 230,247 real wallets, 229,435 look-alikes (token copies) | FINDING section 1 (all token copies); USDC-only recount 227,802 real, 226,990 look-alikes | RC (USDC subset) |
| Gas 0.0209 ETH, about $53; $0.00012 per copied payment | 0.199959649 minus 0.179052996 = 0.020906653 ETH; x 2,517.65 = $52.64; / 439,209 = $0.00012 | V1 + arithmetic |
| No sign of a deposit in the window | 62 balance and nonce samples at 5,000-block steps, fee per tx 2.2e-6 to 4.5e-6 ETH | FINDING (`DATA/op_balance_samples.json`) |
| 44 contracts in use | `DATA/summary.json` `contracts_used` | FINDING |
| Transfers by asset (ETH 514,488; USDC 365,889; WETH 1,428; cbBTC 1,098; EURC 644; ZORA 186; SOL 180; B3 104) | kind map `DATA/fake_contract_kinds.json` | RC |
| Median lags (USDC 142; WETH, cbBTC 912; EURC 818; ZORA 74; SOL 42; B3 64 s) | `DATA/summary.json` `lag_seconds` | RC (USDC); FINDING (others) |
| ETH about 90 s from 32 checked pairs | `DATA/eth_native_check.json`: 4 copy txs, 8 verified pairs each | FINDING |
| USDC 10% within 58 s, 90% within 446 s (7.4 min), 99% within 1,328 s (22 min) | match files | RC |

## Which payments it copies

| Claim | Source | Checked by |
|---|---|---|
| 1% sample: 60 evenly spaced 50-block windows, 3,000 blocks, 255,187 real USDC transfers | `DATA/base_sample.json` | RC-style count (60 windows, 3,000 blocks, 255,187) |
| Copied 1,738 (0.68%) | sample vs match files | FINDING |
| 1,656 classified copies: all plain `transfer` sent by the payer to USDC; senders 1,579 EOA + 77 EIP-7702, 0 contracts | `DATA/targeting_rows.json` (`SCRIPTS/targeting.py`, seed 7) | TR |
| None was a smart-contract wallet | follows from 0 contract senders | TR |
| Skipped sample: 1,847 of 2,500 contract senders; 130 plain sends by the payer | `targeting_rows.json` | TR |
| About 1 in 9 (roughly 1 in 7 to 1 in 10) | 130/2,500 x 253,449 = 13,179 skipped plain sends vs 1,656 copied: 1 in 9.0; 95% binomial range 1 in 7.6 to 1 in 10.3 | TR |
| Amount, recipient type, repeat pairs do not explain the pick | FINDING section 2 | FINDING only |
| WPA Oct 16 payout copied 54 s later; Oct 21 repeat to the same contributor not copied | real tx 0x2481edf7119cd49b19734d51aac8ab88de22c2d6a2a7b9d9ef2fc07991f609ee 15:02:09, copy tx 0xaab62106e03a4a6b5cd7cc0dfc8a76bcb35514aa2f806326599d3f4700283e4b 15:03:03 (WPA look-alike reused); repeat tx 0x5bf08d61e2504f9061a550af8d59a9446c584129bbcfbca038113cc7dba10c6a 15:43:25 Oct 21 | V3 (both txs); "not copied" = FINDING fact 2 (scan of the window's copies) |
| Amounts: $0.000001 to $2.6M, median $5.00, 33,149 under $1, 5,594 at $1,000+, $95.6M total | USDC match files | RC |

## Why it copied no x402 payment

| Claim | Source | Checked by |
|---|---|---|
| x402 on Base usually settles as EIP-3009 sent by a facilitator | payTo inbound sample: 272 of 300 EIP-3009 (231 `0xe3ee160e`, 41 `0xcf092995`), 21 via contracts, 7 plain | FINDING (`DATA/payto_analysis.json`) |
| 0 of 183,951 matched token copies is EIP-3009 | AuthorizationUsed matched per copy (`SCRIPTS/match_real.py`, field 11) | RC (USDC: 0 of 182,140); FINDING (all tokens) |
| Sample: 0 of 8,360 EIP-3009 copied; 1,738 of the other 246,827 | `base_sample.json` (8,360 flagged) | RC-style count; FINDING |
| 613 payTo addresses from PayAI's catalog, Oct 12 to 13; our treasury among them | `DATA/x402_payto_payai.json` (613 keys) | python |
| 19,193 real USDC transfers to block 52,866,183; 17 copied (0.09%) | `DATA/payto_analysis.json` (5 inbound + 12 outbound copied, all plain) | FINDING |
| 19 of 613 touched (18 without the treasury), 21 pairs, all plain transfers | `DATA/payto_echo_pairs.json`: 21 rows, 18 distinct payTo + the treasury via the #105 pair | python |
| agent402.tools: 3,614 payments, none copied | `DATA/payto_sentinel.json` (NODE) | FINDING |
| Example settlement sent by a facilitator | tx 0x37e06e9414f47c276689e03cac4c1fbf8358208016cd6b481545a3c14f2cf67c: from 0x68a96f41ff1e9f2e7b591a931a4ad224e7c07863 (`coinbase` in `deliverables/x402-on-base/x402scan-facilitators-base-f205fbe.csv`), selector `0xe3ee160e` | V1 + CSV |
| 20 USDC plain send copied 80 s later | real tx 0xf66a2af625a26275632cd61ce58531802e306d3c75dcb6ef2f5e186e06e0af21 block 52,851,484; copy tx 0xe181e9466726e97c0d8515d2a26fb0cb8c9995d8f371fa1a06f8861fd19af9b4 block 52,851,524, logs name look-alikes of both sides | V1, V2 |
| agent-control.net received 80 USDC by plain transfer, copied 90 s later | real tx 0xdad526e20ff1a1afe6e7320ac7bd41209c3da2afcda1414c0b2730090ab88bb3 (selector `0xa9059cbb`, sent by the payer) 11:35:43 Oct 19; copy tx 0x1906f2638ebb7e3a1800dc2afec29454e2c3ea2b1ae0d4a170de97c1673a4f04 11:37:13 | V3 |
| Would Pay Again, three pairs this week | `payto_echo_pairs.json` (Oct 16 pair, and two pairs in the Oct 21 copy tx) | python |

## What it has caught

| Claim | Source | Checked by |
|---|---|---|
| This week: 0.003 WETH to a contract 11:42 UTC; plant 11:47; 0.00003 WETH to the look-alike 11:54 | real tx 0xe71fd84e5b37d4e603f3ef49a1d75baeaffc3d915eebbb7bba3fc474369a6bd4 (block 52,896,797); plant tx 0xcbd4ce20181059d649a166b68d4152c62bdb355b3a7910d4610fb683f47333b8 (52,896,943); payment tx 0x5866df92aecf2a262742e36110632735a529e98f1842b7ceeea47f6a8ccb8f10 (52,897,171) | V1 (plant, payment); block time (real) |
| Still held at block 52,906,451 | FINDING | FINDING only; **re-read at publish** |
| No USDC into the 229,435 token look-alikes to block 52,905,875; positive control 3 of 3 | `SCRIPTS/loss_scan.py`, `DATA/loss_*.jsonl` (NODE to 52,866,183, then TND) | FINDING |
| ETH sample: 1,982 look-alikes from 1,000 ETH copies, all EOA, nonce 0, 0 ETH | `DATA/eth_lookalike_sample.json` summary | python (summary read) |
| Three of six catches came 25 to 33 hours after the plant | plant-to-payment blocks: 44,533 / 54,722 / 60,047 blocks x 2 s = 24.7 / 30.4 / 33.4 h | V1, V3 |
| Catch 1, May 27, 0.5 ETH: received 0.287 ETH; plant 450 s later; 0.5 ETH to the look-alike 33.4 h after the plant | real tx 0xaa8b4fea3053fa8ddeab758e8566ef458e4519f4a4a5988d6fe09e73064dc87d (block 46,470,908); plant 0x365cfe467f25fd6c46f34fa1dcae39e613a0b97569a62d67a699ed8338464445 (46,471,133, logs 0.28695560629892384 imitation ETH from the look-alike); payment 0x00045b02d01c66c6262b4fd355180bf9736c52ecf98993b75645bf04cbd95c76 (46,531,180, 2026-05-27 03:15:07) | V1 (plant, payment); `DATA/catches.json` |
| Catch 2, Jun 15, 0.25 ETH: copied a 0.00000001 ETH dust transfer; dust sender's funder labeled "Fake_Phishing4592177" | dust tx 0xd11c387da4ed5f41772172e4bbfe9d6a2a9a021a72e151391fc77883a5ce2c2b; plant 0xe0a9e6e7e8758a63e5e694480f24e9b19ae787162069d3028c798b4a509e90e2; payment 0xda5eaccfd930f5533cdfa4e017e88727fedbf22329ee10e81fc967a19e0af759 (2026-06-15 15:21:37); label: basescan.org/address/0x1014b131…74cc "Funded By Fake_Phishing4592177" | V3; curl (label, Oct 21) |
| Catch 3, Jul 29, 1 USDC: paid 1 USDC, then 1 USDC to the look-alike 16 min after the plant | real 0xbc1002103240a89d5b08f051af3de522b132badd6eaa0b611f3b0704a96d7474; plant 0x4972c8308f3103c9c4f1fe68b47b74daa4d1cd0fde8d50e4d3373299373aa86d; payment 0xb8ce0d7d9563e21da826d10b14ccd7e079196f49319b9f0f13aaa4c168832dd7 | V3 |
| Catch 4, Sep 1, 133 USDC: paid 0.5 USDC; plant 4.5 min later; 133 USDC to the look-alike 24.7 h after the plant | real 0x3d1634f1c82c56505eb72502b1c78305c77daa01bfa446a8617bb5f748898f77; plant 0xfc2d416d91198b7e8fde0c2a052a8ebc9372c208697a76024e728bf464bd9b99; payment 0x1762abd83b883d68a6d5feb9c2362f90d8ea6944abf6283fc1e76f8d5518bf33 | V1, V2 |
| Catch 5, Sep 14, 0.001 ETH: the receiving contract's own deployer sent exactly 0.001 ETH to the payer's look-alike, 40 min after the plant | real 0x06daacaa13bcac1b64f3cf1da220744a1ba168cbaedc460584aca27f07f87f1c; plant 0x4660ae05016acc1e28bacad235c645cac831fde2663e03b36caab8d2ab651a9c; payment 0x9a5281d6792e06f010b5f827c16b5ca71bc8f06bf36f7dad2f9d38280e1af4d9; deployer: creation tx 0x79801d9d403ea6b5c7766adedc5c8b66d449a8b67fc4fb205a71ef177b8ca7b7, receipt from 0x3098…0c99, `contractAddress` 0x99b2…2777 | V3; RPC receipt; Basescan "Contract Creator" |
| Total 0.751 ETH, 134 USDC, 0.00003 WETH, about $2,025 at the Oct 21 price | 0.751 x 2,517.65 + 134 + 0.00003 x 2,517.65 = $2,024.83 | arithmetic |
| Five of six reached OP; ETH direct (0.49999758 ETH) | forward tx 0x3d8adf8d9abbc822eee3dd5ca2bd2144211091c278f696685ef5258b3f91b94c | V1 |
| USDC via look-alike chain (133 USDC sweep Sep 7) | tx 0xb29fc5f3a4b5bb485fcfc7de5eeaeb53bffce1c7d05ab004f95f2204a37ce701; chain in `DATA/sweepchain_sep7.json` | V1 (sweep); FINDING (chain) |
| Or a MetaMask swap a relayer submitted, from an EIP-7702 look-alike delegated to "MetaMask: EIP-7702 Delegator" | swap tx 0xe594c7dff5130f39aa7f38d946df7fb735f9e5ef9dd39c65fe233428a8246e35 (sent by relayer 0xb01caea8…9c2e); look-alike code `0xef0100` + 0x63c0c19a…e32b; forward 0xa07ec10ad46478f913c6a0f09cdb925f44fabc0f5c236f2f67111344a0da49aa (0.000522644710864398 ETH to OP) | RPC (Oct 21); label per FINDING |
| At least 0.81 ETH and 258.97 USDC from 15 wallets; traced catches = 0.75 ETH and 133 USDC of that | `DATA/op_inflows.json`, `op_usdc_changes.json`; 0.49999758 + 0.24999907 + 0.00052264 + 0.00099928 = 0.7515 ETH | FINDING + arithmetic |

## Where its money came from and went

| Claim | Source | Checked by |
|---|---|---|
| Apr 4 10:11:45 UTC, 0.02 ETH from 0x1b1d2149d656f8ca33fb633e6f642b5a2426b53d ("ChangeNOW: Hot Wallet"); OP unused before | tx 0xd8a366b83fe08be62efec0a3ea548be75c68a07031b150d61419c81d98015fd1, block 44,254,079; OP nonce 0 and balance 0 before (archive) | V1; Basescan title (Oct 21); FINDING (prior state) |
| Later ETH deposits from small new dust-left wallets, one exception (87 USDC + 0.018 ETH, Sep 11) | `DATA/hops.json`, `hopaudit_*.json`, exception tx 0xa8a1aa1f…5af8 | FINDING only |
| Sep 29: 258.970759 USDC out, forwarded in full 8.6 min later to 0xf9a316b8044e757cf709f390583e671e0c087338 ("ChangeNOW: Hot Wallet 2") | tx 0x3363ca1cd47afdc1a324572b214be13964e150d5ee3614703cc7864b21c0e382 (11:34:13); tx 0x4f6cc4efbb7d6dbf9bc0fb839e397d373361d75ff5071d796c1f5ddc5a677afd (11:42:49) | V1; Basescan title (Oct 21) |
| Oct 21: 0.179 ETH, 0 USDC, nonce 138,930 | block 52,906,634 | V3 |
| About a cent per batch of 100 copies; 0.5 ETH = about 24 weeks of gas at this week's rate | $0.0097 per tx; 4,374 of 5,410 batches carry exactly 200 events; 0.5 / 0.020906653 = 23.9 | arithmetic |

## Other bots

| Claim | Source | Checked by |
|---|---|---|
| WPA's payout wallet got imitation "USDC" from 3 other contracts, other symbol and code, 3 other senders | `DATA/victims_window.json`; FINDING section 1 | FINDING only |
| Two contracts from other kits planted look-alikes of OP on Sep 7; another kit copied the 133 USDC payment 21 min after it landed | `DATA/sweepchain_sep7.json`; FINDING catch 4 side note | FINDING only |

## What to do (product claims; verified against code at 43da229)

| Claim | Source |
|---|---|
| Free check live since Oct 21 | `https://api.chainward.ai/api/health` version `43da229` (the PR #70 merge), read Oct 21 |
| Hold rule: never sent a tx, wallet code, at most 0.0001 ETH and 0.01 USDC; newest 25 token transfers each way; listed-token transfers all imitations, zero or dust; first and last 4 characters match a real counterparty within 36,000 blocks (20 h) before the plant | `packages/decode/src/decoy.ts` (`detectDecoy`, `NATIVE_DUST`, `USDC_DUST`, `TOUCH_PAGE`, `ECHO_WINDOW_BLOCKS`), `lookalike.ts` (`sharesEnds`) |
| Tokens covered: USDC, USDbC, DAI, EURC, WETH, cbBTC (the KNOWN entries with a Base contract) | `lookalike.ts` `KNOWN` |
| Answer text quoted | `apps/web/src/lib/plainAnswer.ts`, case `poisoning_decoy` |
| Never names an address to pay | `decoyReason`, `decoySentence` (names the poisoned counterparty and tx hashes only) |
| Rug check Hold on a token passing for USDC or another known token | `token-check.ts` `imitationVerdict`, `imitates_known_token` |
| Wallet lookup and counterparty check hold too | `wallet-lookup.ts` verdict (`poisoning_decoy` = hold); `verdict.ts` `counterpartyVerdict` |
| Not caught: imitation-ETH plants; already-paid look-alikes; off Base | `KNOWN` ETH has no Base contract, so `detectDecoy` skips those plants; state gate (USDC > 0.01) and "a real payment of a listed token" return null; `checkDecoyForReport` returns `not_applicable` off Base |
| 58% of transfers were imitation ETH | 514,488 / 884,017 |
| Circle's one USDC on Base is 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 | `lookalike.ts` `KNOWN` (verified on chain 2026-10-21 per its comment); Circle's contract-address page |

## Pre-publish gates

1. **User OK to publish.** Approved so far: drafting only.
2. **Product gate (blocker, recommend fixing before publishing).** A never-used look-alike planted only with imitation ETH is skipped by `detectDecoy`, and `computeActivity` (`chain-audit.ts`) counts the imitation transfer as activity. No other flag fires, so `counterpartyVerdict` most likely answers **Pay ("Active: 1 transfers with 1 counterparties")** on the free report. That is the catch-1 pattern (0.5 ETH). Confirm with a unit test or a private prod check, then either (a) stop counting transfers of tokens that imitate a known token as activity, so the answer becomes Unknown "No track record", and/or (b) treat imitation-ETH plants as plants, matched against the counterparty's native ETH transfers (`external` category). If not fixed, keep the "does not catch yet" paragraph and consider softening "paste it here before you send" in `plain:`.
3. **Prod spot check, privately:** the free report on one of the three look-alikes from tx 0xfb329dcb… answers Hold (memory says branch code was verified; confirm on 43da229). Do not paste a look-alike into any public surface.
4. **Re-read at publish:** the WETH look-alike still holds 0.00003 WETH; OP balance and nonce (state row); and new catches since block 52,905,875 (re-run `SCRIPTS/loss_scan.py` from the plant blocks to a fresh head; 3 of 6 catches came 25 to 33 h late). Update "$0.08" and the state row if they changed. Keep the Oct 21 price and say so.
5. **Move into the site:** `deliverables/address-poisoning-base/` gets `decode.md`, `thread.md` and this file only. Remove `draft: true`. Never copy `finding.md`, `data/`, `scripts/` or `draft/verify/` (full addresses of the paying wallets and the look-alikes).
6. **If published after Oct 22:** update `date`.
7. **Decide on telling Would Pay Again first.** The decode names its payout wallet as poisoned (neutrally). The disclosure has no "we did not contact" line until this is decided.
8. **OG card and manifest:** `pnpm decode:og-render address-poisoning-base`; `node scripts/build-decode-manifest.mjs` and commit the manifest; ship through main (Flux); verify the page, `og.png` and `/api/public/decodes` slug before posting.
9. **One post** (thread.md, the 279-character single post or the thread), not on a day with another @chainwardai post; no link replies under other accounts.
10. Lint: `python3 -I draft/verify/draft_lint.py draft data` (0 em dashes, 0 en dashes, "fake" only inside Basescan labels, no full payee or look-alike address, subtitle 140, plain 304 and 2 sentences, every post under 280).

## Skeptic pass (claims weaker than their first wording, and the fix)

| # | First wording (brief, finding or first draft) | Why it was too strong | Fix in the draft |
|---|---|---|---|
| 1 | "A check like ChainWard's now flags planted decoys" | The decoy check matches only plants of tokens with a real Base contract. Imitation-ETH plants (58% of this bot's transfers, and both of its largest catches) are skipped, a look-alike that has been paid reads as a used wallet, and it is Base only. An ETH look-alike likely gets Pay on the free report | Exact rule stated with the token list, plus "What the check does not catch yet"; product gate 2 above |
| 2 | "This week's catch was $0.08" | Only the token-transfer scan found it. Native ETH to look-alikes was sampled (1,982), not scanned; the scan stopped 42 min after the window; 3 of 6 traced catches came 25 to 33 h after the plant | "The only payment to this week's look-alikes we found", "catches often come a day or more after the plant", "ETH catches this week are not ruled out", "can still catch payments" |
| 3 | "x402 settlements are never echoed, which is why agents paying through x402 are spared" | Measured for one bot in one week: 0 of 183,951 matched copies and 0 of 8,360 sampled EIP-3009 transfers. Other settlement types were not counted separately, other bots were not measured, and the same agents' and sellers' wallets are copied whenever they send a plain transfer | "It copied no x402 payment", the mechanism given as what fits the data, "This is one bot's rule...", x402 limit line |
| 4 | "884,017 fake transfers touching 882,888 Base addresses" | About half of those addresses are look-alikes the bot made (230,247 real vs 229,435 look-alikes where measurable) | Lead with "copied about 439,000 payments"; "882,888, about half of them look-alikes it made" |
| 5 | "It copies about 1 in 9 plain wallet-signed USDC transfers" | Point estimate from 130 of 2,500 in a 1% sample; 95% range 1 in 7.6 to 1 in 10.3 | "In a 1% sample... about 1 in 9 (roughly 1 in 7 to 1 in 10)" |
| 6 | "Six traced catches total about $2,025" | At the Oct 21 ETH price, not the price on each day | "about $2,025 at the Oct 21 ETH price", stated in the lede and the Limits |
| 7 | "Two minutes after a $0.10 bounty payout" | Two $0.10 payouts, one copy, 104 and 108 s later | "two 10-cent bounties", "104 seconds after the second one" |
| 8 | "Median echo 142 s" | USDC only; WETH, cbBTC and EURC medians are 13.6 to 15.2 min; ETH about 90 s from 32 pairs | "Half of its USDC copies...", per-asset table |
| 9 | "First and only outside gas"; "the operation ran on what came in"; lifetime gas 0.65 ETH | One later inflow is unplaced, and the 0.65 ETH is inflows minus balance, which assumes no inflow was missed | "Every later ETH deposit we found... except one we could not place", "as far as we can see"; the 0.65 ETH and any profit figure dropped for the measured 24-weeks comparison |
| 10 | "Cash-out through ChangeNOW" | Basescan's name tags, not our finding | "a wallet Basescan labels", "labeled" |
| 11 | "Look-alikes match the first 4 and last 5 characters" | Measured on USDC copies: 99.95% | "99.95% of this bot's USDC look-alikes" |
| 12 | "A refund sent to the wrong address" (catch 5) | Intent is not on chain | "which is what a refund to the wrong address looks like" |
| 13 | "Another operation's dust" (catch 2) | Rests on Basescan's funded-by label | "a wallet that Basescan shows as funded by 'Fake_Phishing4592177', likely another operation's" |
| 14 | "Size is no filter" (first draft) | The data shows copies at every size, not that size plays no part in the pick | "Any size: ... ran from $0.000001 to $2.6 million" |
| 15 | "Most skipped transfers came from contracts such as swaps and routers" (first draft) | The sample does not break contract senders down by type | "were sent from a contract (1,847 of a random 2,500)" |
| 16 | "414 contracts among its last 13,950 transactions (nonces 125,000 to 138,949)" (first draft) | Nonces from 138,930 on were not yet used | "In its last 13,930 transactions" |
| 17 | "Wrote two new lines into both wallets' histories" (first draft) | Each wallet got one line | "a new line into each wallet's history", with which line went where |
| 18 | "Longer view 0x228440f8…094bfb" (first draft) | Typo: the real ending is 894bfb | Corrected from the computed value |
| 19 | "Each payer and payee pair is copied once a week" (finding; first draft) | 182,140 USDC copies cover 182,137 pairs, so a few pairs were copied twice; and it is one week | "almost every payer and payee pair only once" |

Accepted as worded, with the basis noted: "copied about 439,000 payments" (token pairs 99.94% matched to a real transfer; ETH pairs by a 32-pair check plus the pair structure); "No money moved" (IMUSDC has no balance, transfer or approve functions; `balanceOf` reverts).

## Blocker resolved (2026-10-21)

The product gate above is fixed: PR #71 (2e18a05, deployed 2026-10-21 about 20:20 UTC, all four deployments, login smoke green) makes an imitation of the native coin trace the counterparty's native ETH transfers. Verified: four of four sampled imitation-ETH look-alikes found with the branch code, and a fresh production report on 0xfff90637e8960bce5de4ff2274ce2fd189cd5784 answers Hold with the poisoning_decoy flag ("look-alike ETH"). decode.md now lists ETH among the plants the check reads and keeps "a look-alike that has already been paid" and "anything off Base" as what it does not catch yet.

