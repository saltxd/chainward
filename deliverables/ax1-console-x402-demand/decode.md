---
title: "About Half of AX1 Console's Agent Runs Were Paid With AX1's Own USDC"
subtitle: "We checked all 677,593 of AX1 Console's x402 payments. About half were paid with USDC that AX1's own wallets gave out as prizes and credit."
plain: "AX1 Console has taken 677,593 paid agent runs on Base since Sep 7. About half (46% to 61%) were paid with USDC that AX1's own wallets had handed out as contest prizes and starter credit, both of which AX1 advertises. Those runs bring AX1 no new money. Before you trust an x402 ranking, ask whose money paid."
date: "2026-10-30"
slug: "ax1-console-x402-demand"
seoTitle: "AX1 Console x402 Demand On-Chain: Who Paid for 677,593 Agent Runs on Base (Prizes, Starter Credit, Oct 2026)"
---

# About Half of AX1 Console's Agent Runs Were Paid With AX1's Own USDC

AX1 Console is an app on Base where an AI agent with its own wallet pays $0.02 in USDC for a "Verdict", a short AI take on a token. It pays over x402, the standard that lets software pay for a web request in USDC. Runs in the Console also score points in a weekly contest with a prize pool, and every new account gets $0.10 of starter credit, enough for five runs.

On Oct 23 AX1 launched Console 2.0 with a press release and a sponsored article. Both gave payment and wallet counts, and the article said: "these figures can be checked onchain rather than taken on trust."

So we checked. We read every payment to AX1 Console's x402 address since it went live, every transfer out of the wallets that pay its prizes and credits, and every USDC transfer into the 6,537 wallets that paid. Figures are to Base block 53,102,444 (Oct 26, 05:57 UTC) unless a row says otherwise. Times are UTC.

## The answer

- **Whose money pays for the runs: about half AX1's own.** Between 46% and 61% of all 677,593 runs were paid with USDC that AX1's wallets had sent the payers as contest prizes and starter credit. Outside USDC paid for the rest; about a third of it came from 32 funders that each fund five or more agent wallets.
- **One reason:** every week, AX1's published prize pool was bigger than the route fees its agents paid that week. Over Episodes 1 to 7: $21,520.38 in pools against $13,515.84 in fees.
- **One limit:** money in a wallet mixes, so we give a range, not one number. And the chain does not say who controls a wallet: we call wallets AX1's because of what they do, shown further down.

## Short version

- **The count holds.** 677,593 payments of exactly $0.02 ($13,551.86) from 6,537 wallets since Sep 7. It matches the payee's balance to the cent, and x402scan's 30-day figures to within 1%.
- **Most wallets stopped at the free credit.** 3,897 of the 6,537 (59.6%) made exactly five payments, the $0.10 credit, and never paid again.
- **Prize winners carry the volume.** The 785 wallets that ever won a prize made 86.7% of all payments. In Episode 5 the winners made 96.3% of that week's payments, and almost all won more than they had spent.
- **The outside money is real but concentrated.** 1,886 of the 1,891 wallets that paid more than five times got USDC from outside AX1's wallets. But 32 funders, each behind five or more paying wallets, fund 1,043 wallets that made 30.4% of all payments, and 42.8% on Oct 25.
- **AX1's press figures: three match the chain, two of them only as of Oct 12, and one is off by 20.** "passed 430,000 x402 payments from close to 5,000 agent wallets" and "1,424 went on paying" both fit the chain on Oct 12, 11 days before the release. "605,876 x402 payments" matches exactly at Oct 23 10:43, but 5,649 wallets had paid by then, not 5,669.
- **One payout was paid with route fees.** AX1's FAQ says the prize pool "is not funded by route fees". On Oct 12 the payee's only withdrawal, 3,000 USDC, reached the prize wallet 54 seconds later through two other wallets, and Episode 5's prizes started going out 16 minutes after that. Episodes 1 to 4 were paid out before the payee had ever sent anything. Only AX1 can say how it accounts for this one.

## How a run is paid

Each run is one x402 payment: the agent signs a USDC authorization for $0.02 and a relayer puts it on Base, so the agent wallet pays no gas ([example](https://basescan.org/tx/0x0e15b2ad2b48171487c6c368b7c7146ddb7281b671d96b7f6d263472d8d4dd97)). AX1's FAQ says it sponsors gas and "your agent wallet only needs USDC". All 100 recent paying wallets we checked were ordinary wallets with no contract code, and more than half had never sent a transaction of their own.

Every payment goes to one address, AX1's payee [`0x7284d41b5b852f2bd4c99bdf95043d84452d299c`](https://basescan.org/address/0x7284d41b5b852f2bd4c99bdf95043d84452d299c). AX1's own x402 quote names it, and so do all four of AX1's listings on x402scan. The [first payment](https://basescan.org/tx/0x10ba273982ddf5f2a35bc97725848b9dc1d82bb0ccb7f84008f8695e30f21d7c) arrived on Sep 7 at 09:41, matching AX1's "paid quests went live on September 7".

USDC reaches the agent wallets in three ways:

- **Starter credit.** $0.10 per new account, enough for five runs, per AX1's pricing page. It can only be spent on runs. From Sep 6 to Oct 3 the prize wallet sent it (10,009 credits to 10,008 wallets). Since Oct 8 a second wallet sends it (3,677 transfers, including 51 of $0.20 since Oct 25).
- **Prizes.** The contest closes every Monday at 00:00. Episodes 1 to 5 paid AX1's published tiers in USDC: $90 to ranks 1 to 10, $15 to ranks 11 to 50 and $6 to ranks 51 to 300, 300 prizes and $3,000 a week (Episodes 3 and 4 paid 298 and 302). Since Episode 6 the top 50 get SPCXc, a tokenized SpaceX stock token, and other agents share a USDC pool by points. Prizes can be withdrawn.
- **The user's own money,** from any other wallet.

The contest pays for volume. AX1's rules give "1 point per verified paid quest run", counting the first run per token each week, and starter-credit runs "count as paid runs".

## The count holds

- **Every payment, no sampling.** We read every USDC transfer into the payee from block 50,500,000 (Aug 27) to the cutoff: 677,593 transfers of exactly $0.02, none before Sep 7. We left out five dust transfers of $0.00003 from look-alike addresses.
- **It adds up.** The payee held 10,551.86 USDC at the cutoff: $13,551.86 in, minus one $3,000 withdrawal. Our own Base node returned the same counts as the archive service we used, on three test windows.
- **Others agree.** For Sep 26 05:59 to Oct 26 04:54, x402scan shows 467,923 transactions and 3,849 buyers; the chain shows 469,588 payments from 3,814 wallets. AX1's landing page, refreshed at 05:45:06 on Oct 26, showed 672,784 runs and 6,509 agents; the chain at that second shows 677,483 payments from 6,531 wallets. AX1's docs say outside x402 callers can pay without a Console account, which may explain part of that gap.

The payments are concentrated. The busiest wallet, `0x0c07...b964`, made 36,028 of them (5.3%). The top 10 wallets made 28.4%, and the top 100 made 57.2%. On Oct 25, the last full day before this week's contest, 11 wallets made 63.1% of the day's 42,838 payments.

## Whose money paid

This is all the USDC that reached the 6,537 paying wallets from block 50,900,000 (Sep 5) to the cutoff, in transfers of $0.001 or more, by sender:

| Sent by | Transfers | USDC | Paying wallets reached |
|---|---:|---:|---:|
| AX1's prize wallet (credits and prizes) | 6,704 | $16,583.45 | 5,237 |
| AX1's second credit wallet | 1,211 | $126.20 | 1,194 |
| Outside wallets | 4,747 | $10,905.13 | 2,030 |
| Other paying wallets | 17 | $87.55 | 15 |

Once a prize and a deposit sit in the same wallet, nobody can say which cent paid for which run. So we worked out two bounds, wallet by wallet, in time order. The high bound assumes each wallet spent AX1's USDC first; the low bound assumes it spent its outside USDC first. The real answer sits between them.

**Across all 677,593 runs, USDC from AX1's wallets paid for 46.0% to 61.2% of them ($6,238 to $8,293).** Outside USDC paid for the rest, except 14 runs we cannot place.

A prize, once won, belongs to the winner, and spending it on more runs is what the contest invites. Our point is narrower: that USDC started in AX1's wallets, so the runs it paid for are AX1's money coming back, not new money from buyers.

### Week by week

Each episode runs Monday 00:00 to Monday 00:00 UTC. Pools are AX1's published figures from its contest API; runs, fees and wallets are from the chain.

| Week | Runs | Route fees | Paying wallets | Published prize pool | Paid with AX1's USDC |
|---|---:|---:|---:|---:|---:|
| Ep1, Sep 7 to 14 | 52,030 | $1,040.60 | 1,989 | $3,000.00 | 15.6% to 16.2% |
| Ep2, Sep 14 to 21 | 116,144 | $2,322.88 | 903 | $3,000.00 | 36.4% to 40.5% |
| Ep3, Sep 21 to 28 | 90,114 | $1,802.28 | 1,634 | $3,000.00 | 57.2% to 74.8% |
| Ep4, Sep 28 to Oct 5 | 96,510 | $1,930.20 | 1,358 | $3,000.00 | 64.3% to 80.3% |
| Ep5, Oct 5 to 12 | 81,804 | $1,636.08 | 452 | $3,000.00 | 54.2% to 69.2% |
| Ep6, Oct 12 to 19 | 91,520 | $1,830.40 | 882 | $2,988.55 | 57.4% to 78.2% |
| Ep7, Oct 19 to 26 | 147,670 | $2,953.40 | 1,298 | $3,531.83 | 34.2% to 57.8% |
| **Ep1 to Ep7** | **675,792** | **$13,515.84** | | **$21,520.38** | |
| Ep8, to Oct 26 05:57 | 1,801 | $36.02 | 180 | $10,011.03 | 35.8% to 45.8% |

- Episode 1 had no prizes yet (the first payout came on Sep 15), so only starter credit counts there.
- From Episode 3 to Episode 6, AX1's USDC paid for between about half and four fifths of each week's runs. The share fell in Episode 7 as more outside money came in. On Oct 25 it was 31.1% to 37.9%.
- Winners carried each week. The prize winners of Episodes 1 to 5 made 67.6%, 77.6%, 82.9%, 85.6% and 96.3% of their week's payments. In Episode 5, all ten $90 winners had spent less than $90 on runs that week (median about $44), as had 38 of the 40 $15 winners and 247 of the 250 $6 winners.
- Episode 7's USDC prizes went out after the cutoff, on Oct 26 from 16:02 to 16:09 UTC: 328 transfers, $1,479.67, from the prize wallet's own balance, which the funder had topped up with $1,520 on Oct 25. The payee made no withdrawal (read to 18:28 UTC). Episode 8's pool, $10,011.03, is nearly three times the largest earlier one.

## Who brings the outside money

By wallet, most payers never added money of their own. 4,503 of the 6,537 only ever received USDC from AX1's wallets; 3,807 of them made exactly five payments, and all 4,503 together made 3.1% of all runs. The heavier payers did add money: 1,886 of the 1,891 wallets that paid more than five times received USDC from outside wallets, and 1,193 of them received $1 or more.

To see where that outside money comes from, we grouped every paying wallet by its largest funder outside AX1. This groups wallets, not dollars: a wallet in the first row may also have spent prizes.

| Largest outside funder | Wallets | Share of all runs | Share of runs on Oct 25 |
|---|---:|---:|---:|
| Its own or a small funder (funds fewer than five paying wallets) | 873 | 59.3% | 51.6% |
| A funder of five or more paying wallets (32 funders) | 1,043 | 30.4% | 42.8% |
| An exchange withdrawal (two exchange hot wallets) | 99 | 6.6% | 0.3% |
| None: AX1's USDC only | 4,503 | 3.1% | 5.4% |
| Another paying wallet | 7 | 0.4% | 0% |
| A wallet linked to AX1's group | 12 | 0.2% | under 0.1% |

The 1,043 wallets behind the 32 multi-wallet funders won $4,888.82 in USDC prizes. The largest by runs, `0x2811...07ee`, is the main outside funder of 11 agent wallets that made 36,219 runs (5.3% of all); all 11 won prizes, $757.68 in all, against $265.50 it sent them. Another, `0x52f0...cbfb`, sent 25 agent wallets $0.60 each on Sep 20 through a public batch-transfer contract; the 22 for which it is the main outside funder made 28,474 runs (4.2%) and won $1,065.58 in prizes. A third, `0xe405...08bf`, funded 251 wallets, which made 3.5% of all runs.

Nothing on chain shows a broken rule. AX1's FAQ gives the starter credit to "the first agent of your account", which suggests one account can run more than one agent. The rule text we read does not say whether one operator may enter many agents in the contest.

## What AX1 said, and what the chain shows

AX1's Oct 23 press release (GlobeNewswire) and its sponsored article on CryptoSlate ("Presented by AX1 Research") gave these figures. We counted exact $0.02 payments to the payee from the first one.

| AX1's figure | What the chain shows |
|---|---|
| "passed 430,000 x402 payments from close to 5,000 agent wallets" (press release) | The [430,000th payment](https://basescan.org/tx/0x162f10a4a373a291d55b04dc1d312779215019bc82cc41b02369e1e4bdd6690c) landed on Oct 11 at 22:28, when 4,906 wallets had paid. By Oct 23 00:00 the count was 590,159 payments from 5,647 wallets. The figure fits the chain on Oct 11 and 12, 11 to 12 days before the release. |
| "transaction volume has reached 605,876 x402 payments" (sponsored article) | Exact. The [605,876th payment](https://basescan.org/tx/0xea8bbe4f9c4ef9fbaaccafe8ee2e5e5c176995d9118eb735a1f9fc84da605a6b) landed on Oct 23 at 10:43:13. |
| "5,669 agent wallets have paid for runs" (sponsored article) | At 10:43:13, 5,649 wallets had paid, 20 fewer. The 5,669th wallet [first paid](https://basescan.org/tx/0xc4e807b8218036d322f70e77d31f0003af0c9fb5e0774bf4a7736be91b580124) on Oct 24 at 08:27. |
| "Of those wallets, 1,424 went on paying once their starter credit was used up" (sponsored article) | The article does not define it. At 10:43:13, 1,821 wallets had made more than five payments (the credit covers five). That count was exactly 1,424 on Oct 12 from 13:09:55 to 13:28:59, when 4,963 to 4,971 wallets had paid, which also fits the release's "close to 5,000". |
| "Since paid quests went live on September 7" (sponsored article) | Matches: first payment Sep 7 at 09:41. |
| Top 5 on x402scan "by transactions and paying agents" over 30 days (both) | Not tested. x402scan's own figures for AX1 match the chain within 1%. |

AX1 may count from its own database, at another moment or in another way. Its texts do not say how, and we have asked.

## The Oct 12 withdrawal

AX1's Console FAQ answers "Where do contest rewards come from?" with: "From AX1. The weekly pool is subsidized by AX1 and is not funded by route fees."

On the totals, "subsidized" holds. Since Sep 6 AX1's wallets have sent out about $17,700 in USDC credits and prizes, plus SPCXc. The payee took in $13,551.86, and $3,000 of that is the one transfer below. "Not funded by route fees" does not hold for that payout. On Oct 12:

| Oct 12, UTC | What happened | Tx |
|---|---|---|
| 00:00:13 | Episode 5 closes (AX1's contest API) | |
| 13:07:19 | `0x22fa...3797` sends the payee 0.00395 ETH, its first ETH. The payee had never sent a transaction | [tx](https://basescan.org/tx/0xd1a39ec29bb9e3f21c15653c5903a5183669e9865128fa40e15a8f7df0715504) |
| 13:08:43 | The payee sends 3,000 USDC to `0x22fa...3797`. It is the payee's only withdrawal, then and since | [tx](https://basescan.org/tx/0xfadc10cbe04085a75df944795caabfcfb75a46f4622132d9172fe7ebc33b068a) |
| 13:09:07 | `0x22fa...3797` sends 3,000 USDC to the funder, `0xf79b27ed5b97bc8b11b1a6f4908aa552b8f04078` | [tx](https://basescan.org/tx/0xa70ffa6bc3407010828ed5fcd918a8b57d3df1d6bafec698110864730568ab4f) |
| 13:09:37 | The funder sends 3,000 USDC to the prize wallet, 54 seconds after the withdrawal | [tx](https://basescan.org/tx/0x85b2e6b53f05f4289b07062bf9f30cfc8808a13af2dcd58ad3ed2632fe39dd35) |
| 13:25:27 to 13:35:03 | The prize wallet pays Episode 5: ten prizes of $90, 40 of $15 and 250 of $6, $3,000 in all | [first](https://basescan.org/tx/0x7cd01dd1956b135755cdce0b07c9decefaa9fbc3302732cd4face17f12b64fec), [last](https://basescan.org/tx/0xeed165e3a6142f7e1b5720cf97d4a33ba808a06b881fa4674816baa6e92101e0) |

Just before the withdrawal, the three wallets it passed through held $1,413.39 between them, and no other USDC reached them from Oct 11 20:09 to Oct 13 16:35. Without the route fees, those three wallets did not hold enough to pay it. Under any spending order, at least $1,586.61 of the $3,000 in prizes was route fees.

The other five USDC payouts (Episodes 1 to 4, and Episode 6's USDC share) were also funded through the funder. Episodes 1 to 4 were paid before the payee had ever sent anything, and Episode 6's share followed a new $1,500 top-up from the funder on Oct 20. The payee has sent nothing else: the other $10,551.86 of route fees is still there.

Paying prizes out of route fees is AX1's business decision, and all of these wallets may be AX1's treasury. What the chain shows is narrower: Episode 5's prizes were paid with route fees, and the FAQ says the pool is not funded by them. Only AX1 can say how it accounts for that payout, and we have asked.

## Whose wallets these are

No AX1 page names the wallets that pay its prizes, and Basescan gives none of them a name tag. We call them AX1's because of what they do:

| Wallet | What it does |
|---|---|
| Payee [`0x7284d41b5b852f2bd4c99bdf95043d84452d299c`](https://basescan.org/address/0x7284d41b5b852f2bd4c99bdf95043d84452d299c) | Receives every $0.02 run. Named in AX1's x402 quote and on x402scan |
| Prize wallet [`0x3dd6f35c88f3ae22feccbde524caf9874aab1af7`](https://basescan.org/address/0x3dd6f35c88f3ae22feccbde524caf9874aab1af7) | Sent the $0.10 starter credits until Oct 3 and every prize in AX1's published tiers; holds and sends SPCXc. Its USDC came only from the funder ($18,520 in eight top-ups) and from `0x1efa...4dd2` ($990.37 on Sep 6 and 7) |
| Credit wallet [`0x23d137182e9debfe42ceed9f07f2fa7d8460d224`](https://basescan.org/address/0x23d137182e9debfe42ceed9f07f2fa7d8460d224) | Sends the starter credits since Oct 8. Funded only by the funder |
| Funder [`0xf79b27ed5b97bc8b11b1a6f4908aa552b8f04078`](https://basescan.org/address/0xf79b27ed5b97bc8b11b1a6f4908aa552b8f04078) | Funds the prize wallet and the credit wallet, and has sent the prize wallet ETH. Since Aug 27, almost all its USDC, $98,050, came from `0x22fa...3797` |
| `0x22fa...3797` | Sent the payee its first ETH, received its only withdrawal, and first funded `0x1efa...4dd2` |

Since Aug 27, `0x22fa...3797` got its money mostly from three wallets: two that it had funded first itself, and one unlabeled wallet that Basescan showed holding about $200,000 on Oct 26. Two hops back from the prize wallet, we found no exchange account and no tag that names an owner. That fits a private treasury run by AX1's operators, but only AX1 can confirm it.

## An update to our earlier notes

On [Sep 27](/decodes/x402-on-base) we wrote that at least 378 of AX1 Console's buyers were funded by the prize wallet's $0.10 transfers, called that ambiguous, and found no path from the payee back to that wallet. The payee had not sent anything then. On [Oct 13](/decodes/x402-top-ten-self-funded) we listed AX1 Console as "No loop found" among the top ten sellers on Agent402's board, because the payee's only outgoing USDC had gone to a wallet that never paid it.

Both need an update. By the links above, the prize wallet sits in the same group as the payee, and its credits and prizes paid for about half of all runs. And the Oct 12 withdrawal reached Episode 5's winners in four transfers, and 240 of those 300 winners paid the payee again. Money mixes, so this is a ceiling: at most $1,736.68 of that $3,000 came back as route fees.

## What is normal here

- Starter credit is a common way to let people try a paid service, and AX1 states it on its pricing page. Most paying wallets used exactly that and stopped.
- The $6, $15 and $90 transfers are contest prizes in AX1's published tiers, paid to agent wallets and withdrawable. Spending them on more runs, all day, is what a contest that pays for runs invites. Nothing on chain shows a broken rule.
- A launch paid for partly by its own prizes still has outside buyers: 2,030 paying wallets received $10,905.13 from outside wallets.

## If you are picking an x402 service

x402 rankings count settled payments. AX1's are real payments on Base at the advertised price. What a count cannot tell you is whose money it was. Three questions help:

- **Where did the payers' USDC come from?** If the seller's own wallets sent it, as prizes, credits or anything else, those runs are the seller's money coming back.
- **How many payers stayed after the free part?** Here, 3,897 of 6,537 stopped at the credit.
- **How concentrated is it?** Here, on Oct 25, 11 wallets made 63.1% of the day's runs.

## Right of reply

We sent AX1 these findings on Oct 26, 2026 (to the media contact in its Oct 23 release) and asked for a reply by Oct 30. As of publication we had not received one. The offer stands: if AX1 replies, we will add its answer here, and we will correct anything it shows to be wrong.

Figures in this piece are a dated snapshot, cut at Base block 53,102,444 (Oct 26, 05:57 UTC), not a live reading. The comparisons that matter here are against AX1's own Oct 23 release, so they do not move; the daily figures will have.

## Limits

- **Who controls a wallet is not on chain.** "AX1's wallets" is our reading of on-chain links. We do not know who runs the paying wallets or their funders, and one operator can run many wallets.
- **Ranges, not points.** Nobody can say which cent paid for which run, so the share paid with AX1's USDC is a range from two spending orders. We did not read the paying wallets' withdrawals; both bounds hold without them.
- **Funder groups are structural.** "Its own or a small funder" means a funder that reaches fewer than five paying wallets. It does not prove a different person behind each wallet, and wallets funded from exchanges cannot be grouped from Base data.
- **Pools are AX1's numbers.** Since Episode 6 part of each pool is paid in SPCXc, and we use AX1's dollar figures. Episode 7's USDC share was paid after the cutoff; we did not check its SPCXc prizes.
- **How AX1 counts** runs, agents and repeat payers in its own records is not visible to us.
- **Not assessed:** native ETH flows beyond those noted here, other chains, AX1's top-5 ranking claim, and everything after block 53,102,444. Episode 8 runs to Nov 2.

## Method and sources

- **Payments:** every USDC transfer log into the payee, blocks 50,500,000 to 53,102,444, read in 1,000-block chunks from a keyless archive gateway (base.gateway.tenderly.co), no sampling. Checked against our own Base node on three windows and against the payee's balance at the cutoff on mainnet.base.org.
- **AX1's wallets:** every USDC and SPCXc transfer out of the prize wallet and the credit wallet, and the transfers among the wallets in the table above, from the same sources.
- **Payers' funding:** every USDC transfer into the 6,537 paying wallets from block 50,900,000 (13,019 transfers, 12,679 of them $0.001 or more), with the ranges worked out wallet by wallet in time order.
- **AX1's own sources, read Oct 26:** its contest API (current week, history and Episodes 1 to 7) at 06:03 to 06:04; its landing-page counter at 05:45; its pricing page, agents.md and llms.txt; the Console rules and FAQ text served by console.ax1.vc. The press release (GlobeNewswire) and the sponsored CryptoSlate article, both Oct 23. x402scan's AX1 page at 05:59.
- **Basescan** for name tags and "Funded By" only.
- We show paying wallets and their funders only in short form, and AX1's payee, prize, credit and funder wallets in full. Zero-value and look-alike transfers in these wallets' histories (address poisoning) are left out.

> Disclosure: ChainWard sells paid checks over x402 on Base, including a $0.02 token check, so it competes with AX1 Console for some of the same buyers. ChainWard's treasury has never paid AX1's payee.
