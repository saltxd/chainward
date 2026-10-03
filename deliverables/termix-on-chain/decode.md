---
title: "TermiX Collected $507K in Job Fees. 99% Came From Wallets Hiring Each Other"
subtitle: "483,738 agent jobs on Base and BNB Chain, $25.4M settled. 99.11% of the fees came from 18,862 wallets that hire each other and get their money back."
date: "2026-10-02"
slug: "termix-on-chain"
seoTitle: "TermiX On-Chain: 483,738 Escrow Jobs on Base and BNB Chain, $507K in Fees, and the Wallets That Hire Each Other"
---

# TermiX Collected $507K in Job Fees. 99% Came From Wallets Hiring Each Other

TermiX runs a marketplace where AI agents hire other agents. A buyer locks USDC in an escrow contract, the seller's agent accepts the job and delivers, and the escrow pays the seller minus a 2% fee to TermiX. It runs on Base and on BNB Chain (BSC), and every agent has an identity in the ERC-8004 registry. Jobs earn TermiX Points (TP), which TermiX plans to convert into its token, $TMT.

We read every job the escrows have settled, from launch to September 29: **483,738 jobs, $25.4M of volume and $507,564 in fees.** The fees are real USDC, and TermiX received them. What the chain adds is who paid them.

Short version: **99.11% of the fees came from 18,862 wallets that hire each other.** Each one buys jobs, sells jobs, typically puts each payout into its next purchase within hours, and ends close to where it started. In the last 30 days their share was 99.23%. Nearly all of them are linked to each other by how they were funded and how fast they were hired. The 488 wallets that look like ordinary users paid **$2.12** in fees over the same 30 days.

---

## The escrow in numbers

Window: each escrow's full history up to **2026-09-29 23:59:59 UTC**. On Base, blocks 49,608,741–51,968,526 (escrow created Aug 6, first job Aug 7). On BNB Chain, blocks 107,641,535–124,808,836 (escrow created Jul 2, first job Jul 3).

The USDC escrows are [`0xc3d963E0…`](https://base.blockscout.com/address/0xc3d963E0856A2c2d6F75C83C1355f680fd8F9f10) on Base and [`0x6A52ba4C…`](https://bscscan.com/address/0x6A52ba4C84b348FaEAe13dDC7A97b4F6af23913C) on BNB Chain, each with a smaller USDT twin. On both chains, fees go to the same 2-of-3 Safe, [`0x1095deD9…`](https://base.blockscout.com/address/0x1095deD95CB6e81C01204F7A94950dd559195E42).

| | Base | BNB Chain | Total |
|---|---:|---:|---:|
| Jobs settled | 186,844 | 296,894 | **483,738** |
| Job volume | $7,397,791 | $17,980,418 | **$25,378,209** |
| Fees to TermiX | $147,956 | $359,608 | **$507,564** |
| Wallets that settled a job | 6,725 | 13,175 | 19,900 |
| Median job, order to release | 138 s | 76 s | |

By month, fees were $15,233 in July (BNB Chain only), $292,145 in August and $200,186 in September up to the 29th.

---

## Who paid the fees

We put every wallet that settled a job into one group, based on how it traded and what links it to other participants. Jobs and fees count against the wallet that bought the job.

| What the chain shows | Wallets | Jobs bought | Fees | Share of fees | Fees, last 30 days |
|---|---:|---:|---:|---:|---:|
| **Cycling**, with a direct on-chain link to another participant | 5,384 | 168,576 | $137,159.06 | 27.02% | $56,182.85 |
| **Cycling**, linked by timing (same withdrawal burst, or hired within minutes of registering) | 13,417 | 311,555 | $364,555.95 | 71.82% | $150,221.66 |
| **Cycling**, no link found | 61 | 1,330 | $1,351.18 | 0.27% | $666.10 |
| Bought and sold, without the full cycling pattern | 418 | 1,117 | $1,559.62 | 0.31% | $1,461.47 |
| Bought or sold only, linked to cycling wallets | 132 | 847 | $947.53 | 0.19% | $144.53 |
| Bought or sold only, no link found | 488 | 313 | $1,990.84 | 0.39% | **$2.12** |
| **Total** | **19,900** | **483,738** | **$507,564.18** | 100% | **$208,678.73** |

"Last 30 days" is Aug 31 00:00 to Sep 29 23:59:59 UTC. The three cycling rows paid **$503,066 of $507,564 (99.11%)** over the full window, and **$207,071 of $208,679 (99.23%)** in the last 30 days.

A wallet counts as **cycling** when it bought at least two jobs and sold at least two, typically put each payout into a new job within 24 hours, and ended within about one job's value of where it started. Money it sent to outside addresses doesn't count towards that balance, so an agent that withdraws its earnings doesn't qualify. "Cycling" describes the flows. It says nothing about who runs the wallets or why.

---

## What cycling looks like

| | Base | BNB Chain |
|---|---|---|
| Payouts followed by the same wallet buying a new job within 24 h | 98.4% (median wait 1 h 28 min) | 97.1% (1 h 03 min) |
| Next job's budget within ±2% of the payout just received | 79.1% | 90.4% |
| Buyer → seller pairs used only once | 99.4% | 99.7% |
| Wallets in the largest payment cycle | 6,396 (174,508 of 186,844 jobs) | 12,432 (286,639 of 296,894 jobs) |

A wallet gets paid, waits about an hour, and hires a *different* wallet for roughly the same amount. Almost no pair trades twice. The money moves through a pool of thousands of wallets and returns to where it started over days, and TermiX takes 2% at every hop. A typical cycling wallet on Base made about 20 purchases and 20 sales and finished within a few dollars of zero.

Here is one short stretch of it on Base, Sep 14:

| Time (UTC) | Job | Paid | Seller received | Tx |
|---|---|---:|---:|---|
| 06:12:27 | Wallet A hires B | $28.68 | $28.11 | [create](https://base.blockscout.com/tx/0x5df551f8cd4531218be2c55689d01d0b79f485c28d63493c7f55c55f0f188c28), [release](https://base.blockscout.com/tx/0x9a60d9d2848df94553c15fc887610bdfb6b618223d975b868323ae2efe1745a0) |
| 06:41:17 | B hires C | $27.82 | $27.26 | [create](https://base.blockscout.com/tx/0x5dbc4ad83441f592cdf4c6ce62138e9296e1a301f354cbafd484f0b412ab218f), [release](https://base.blockscout.com/tx/0xe6e20a7e009f3c62e58063b6603e8510141e29815b4d4e0bb16497f541fde724) |
| 07:19:39 | C hires A | $27.49 | $26.94 | [create](https://base.blockscout.com/tx/0x314867a07e1318dd506d2ec57b34adce6acb7f95cd9edbe4484dc11d5d1840d7), [release](https://base.blockscout.com/tx/0x411fd453700e925e4a919565fb34d0c21e2b48bddea7640dba756d698c4f6868) |

A paid out $28.68 and had $26.94 back 70 minutes later. TermiX took $1.68 in fees along the way. Each job was released 164 to 240 seconds after it was created.

One ring like this proves little on its own. With thousands of wallets trading, short rings also appear when the sellers are shuffled at random, so we didn't use them to classify anyone. The evidence is in how the wallets were funded.

---

## Base: one custodial account, trees of five

All of the outside USDC that reached Base participants (transfers of $1 or more) came from one source: a custodial smart-contract account holding about $114M of USDC. It sent first USDC to **720 wallets**, $175,095.77 in 721 transfers, and 700 of those wallets were funded in five bursts:

| Burst (UTC) | Wallets | USDC per wallet |
|---|---:|---|
| Aug 7, 14:08 – 16:17 | 38 | $250.00 each |
| Aug 11, 02:05 – 10:11 | 400 | $49.83 – $74.75 |
| Aug 21, 02:07 – 02:57 | 82 | $451.93 – $547.99 |
| Aug 27, 01:59 – 05:05 | 100 | $401.63 – $599.53 |
| Sep 17, 01:44 – 19:48 | 80 | $460.95 – $538.31 |

**680 of the 720 funded wallets each sent USDC to exactly four new wallets, and 686 of the resulting trees hold exactly five wallets.** These trees contain 3,726 Base wallets. In one tree from the Aug 21 burst, the four children registered their agents that afternoon and each bought its first job 54 to 86 seconds later. By the end of September each had made 18 to 24 purchases, and its net spend through the escrow was within a dollar of what its root had sent it.

The rest of the Base evidence points the same way:
- **Gas from each other.** In a random sample of 3,215 Base wallets, 2,591 (80.6%) got their first ETH from another participant.
- **Hired at registration.** 2,963 Base wallets were hired for their first job within 10 minutes of registering their agent, a median 60 seconds after it. The buyer was always another cycling wallet.
- **Registered in batches.** On Aug 22, participants registered 488 consecutive agent IDs between 03:06 and 05:15 UTC, about one every 16 seconds.

---

## BNB Chain: exchange withdrawals in round numbers

On BNB Chain the money came through an exchange, which hides who withdrew it. **3,730 wallets received their first USDC in eight withdrawal bursts from two exchange hot wallets**, which alternate within each burst. The burst sizes are exact round numbers:

| Burst (UTC) | Wallets | USDC per wallet |
|---|---:|---|
| Jul 4, 06:52 – 07:29 | 30 | $5.00 each |
| Jul 19, 02:59 – Jul 21, 19:44 | **1,000** | $30.03 – $1,363.45 (median $52.05) |
| Aug 8, 03:28 – 15:26 | **200** | $108.25 – $149.98 |
| Aug 19, 14:54 – Aug 20, 01:06 | **500** | $100.04 – $149.98 |
| Aug 24, 02:57 – 13:07 | **500** | $100.06 – $119.97 |
| Aug 31, 11:08 – 21:19 | **500** | $90.02 – $109.93 |
| Sep 7, 00:36 – 10:48 | **500** | $80.06 – $119.98 |
| Sep 22, 13:47 – 23:59 | **500** | $80.01 – $119.92 |

Wallets funded from exchanges at other times look different. The 134 wallets first funded from exchanges on Jul 1 and Jul 3 got their USDC from 15 and 9 different exchange addresses, and none of them cycles. The chain can't show which account requested the burst withdrawals, or whether several accounts running the same tooling did.

The other BNB Chain signal is speed. **8,748 wallets were hired for their first job within 10 minutes of registering their agent, a median 49 seconds after it** (10th–90th percentile: 22–240 s). In every case the buyer was another cycling wallet. For comparison, the 206 sellers that look like ordinary users were first hired a median 2 h 19 min after registering, and none within 10 minutes.

One of them, Aug 7:
1. **14:20:28.** A new wallet registers agent 258193. [`0x70573b7c…`](https://bscscan.com/tx/0x70573b7c858255396ef4a0b439c717603628764792e7dd742befb53145af5910)
2. **14:21:16, 48 seconds later.** A cycling wallet registered 47 minutes earlier hires it for $254.18. The job is released 62 seconds later, and the new wallet receives $249.10, its first USDC. [create](https://bscscan.com/tx/0x2423e10d17626dff30b9ad93bac4c8b8e62fff09b0861989bea156a1e6dad40c), [release](https://bscscan.com/tx/0xf150c3678d05c4f68323549a42379ad775ac13c45cfd3038b09eec879dff84af)
3. **17:05:54.** The new wallet hires a different wallet for $248.23. Released 49 seconds later. [create](https://bscscan.com/tx/0x54fa5dbb850ec43bc49010bb1f358af3486a49d20676edb9a12db83dacb3bd20), [release](https://bscscan.com/tx/0xdc05666cfd6f1af5a1a28002aaa8d7be37ce1946cdd79b1ee3f37772b0942527)

By the end of September it had bought 23 jobs and sold 23, and was $0.76 ahead.

Gas doesn't help on this chain: 1,187 of 1,197 sampled BNB Chain wallets got their first BNB from exchange addresses. Registrations came in batches here too: on the evening of Aug 9, runs of 130 to 144 consecutive agents were registered every 30 minutes, with 5-minute pauses between them.

---

## Money in, fees out

Across both chains, the cycling wallets brought **$528,696** of USDC and USDT in from outside, 94% of it in the Base and BNB Chain bursts above. They paid **$503,066** to TermiX in fees and sent **$12,894** back out.

Nearly everything that came in left as fees, 2% at a time. In practice, the fee was the price of the TermiX Points each job earns.

---

## One address, both chains

No wallet took part on both chains. On September 22 their money went to the same place anyway.

- **Base:** between 21:37:41 and 21:39:19 UTC, **79 cycling wallets sent $2,988.90 to one plain wallet within 98 seconds**, most of them their last $9 to $10. [Example](https://base.blockscout.com/tx/0x4b85caedde5c964fcbc69dcd15498687156670efd33a19f7357d673486330bcc)
- **BNB Chain:** between 21:19 and 00:25 UTC, 42 participants sent the same address $6,923.73. [Example](https://bscscan.com/tx/0x9007c373423c9db4cad7896eb69c73a4aff20506ec2d30b6f0ea1dd2246e950d)

On Base the receiving address has four transactions in total.

---

## What ordinary use looks like

**488 wallets only bought or only sold, and have no link to the cycling wallets.** All of them are on BNB Chain, and 455 were first active in July, the escrow's first month. Their jobs took a median 863 seconds (about 14 minutes) from order to release, against 76 seconds for all BNB Chain jobs and 138 for Base.

They bought $99,541.95 of jobs (0.39% of volume) and paid $1,990.84 in fees, almost all of it in July. **In the last 30 days they paid $2.12.** On Base we found no wallet like this.

The month-by-month split makes the same point. In July these wallets paid 13% of the fees. In August the cycling wallets paid 99.96%, and in September 99.2%.

---

## TermiX's own wallets aren't in the cycles

We checked the escrow deployer, the fee Safe and its three owners, and TermiX's staking and reputation contracts. None of them is a participant. None sent a participant its first stablecoin, and none sent first gas to any sampled participant. The only flows between them and the participants are 48 staking deposits and withdrawals of 50 USDC or less.

We found no on-chain link between TermiX's addresses and the cycling wallets.

---

## What it means for TP → $TMT

TermiX defines the points, and we haven't seen its points ledger, so points per wallet are unknown. But if points follow settled jobs, nearly all of them went to wallets that hire each other. Before converting points to a token, a project in this position could:

- **Review linked wallets.** Hold back wallets that share a funder, came out of the same withdrawal burst or sent money to each other directly, and put them through a claim-time check.
- **Skip instant hires.** Give no points for jobs where the seller's agent was registered minutes before it was hired.
- **Count counterparties, not jobs.** Weight points by the number of distinct, independently funded counterparties.
- **Slow the jobs down.** Set a minimum job duration or check deliveries. The median job here was released one to two minutes after it was created.
- **Cap and vest.** Cap points per wallet per day, and vest converted tokens.

None of these was tested here, and each has trade-offs for real users.

---

## DefiLlama's number holds up

DefiLlama's `termix` adapter, a third-party tracker, showed **$219,006** of fees over its last 30 days when we read it on September 29, about 64% from BNB Chain. Our escrow fees for Aug 31 – Sep 29 come to **$208,679**, 65.1% from BNB Chain.

DefiLlama's window is slightly different, and it also counts TermiX's campaign vaults, which carried $263 of fees in total. So the two numbers shouldn't match to the dollar, and they agree within 5%. The fee total is right. It just doesn't say who paid it.

---

We built the full list for this decode: all 19,900 wallets, each with its group, funder, burst, agent registration and the transactions behind it. **[The full wallet list is available as a CSV for 10 USDC](/paid/termix-wallets)**, paid from any wallet on Base, or over x402 for agents. If you run a points or incentive program and want the same audit of yours, start at [chainward.ai](https://chainward.ai).

---

*Verified September 30 – October 1, 2026. Window: every TermiX job escrow from creation to 2026-09-29 23:59:59 UTC, Base blocks 49,608,741–51,968,526 and BNB Chain blocks 107,641,535–124,808,836. Data was read from keyless public RPCs: on Base, mainnet.base.org, cross-checked against developer-access-mainnet.base.org; on BNB Chain, rpc.sentio.xyz/bsc and public-bsc.nownodes.io, cross-checked against 56.rpc.thirdweb.com. ChainWard's own node was not used. Every pull covers its full block range with no gaps. In 30 random 1,000-block ranges per chain, a second endpoint returned no escrow event or transfer missing from our data, and returned every event we had. Fee transfers to TermiX's Safe equal the sum of the escrows' `OrderSettled` fees. At the window end, each escrow's token balance equals the budgets of its open orders to the cent, and its order counter equals our order count. We re-read 621 job receipts (300 random per chain, plus every job cited here) and every other cited transaction; all matched. First gas was looked up for a random sample (47.8% of Base wallets, 9.1% of BNB Chain wallets). "Exchange" and "custodial" mean an address holding at least $1M of USDC/USDT or with at least 100,000 sent transactions; we did not name them. BNB Chain aggregate times are interpolated from block headers (99.17% within 1 s), and the times cited above are exact. Totals include both escrows on each chain (USDC and USDT) and exclude the campaign vaults. Balances of the custodial and exchange addresses were read on October 1. DefiLlama is a third party. We did not see TermiX's points ledger or examine what was delivered. Counts are addresses, not people: the chain shows where money went, not who controls the wallets or why. Nothing here is a verdict on TermiX or on any wallet.*

> Disclosure: Before publishing, ChainWard offered TermiX the wallet-level version of this audit as a private, paid report. This public version leaves out the wallet list.
