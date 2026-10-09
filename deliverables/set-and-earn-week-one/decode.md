---
title: "Set and Earn, Week One: Who Is Hiring Whom on BNB Chain"
subtitle: "Set and Earn's first four days on BSC: 2,930 new ERC-8004 agents, 8,611 hires, a closed 48-wallet ring and 5 cross-marketplace hirers."
date: "2026-10-05"
slug: "set-and-earn-week-one"
seoTitle: "Set and Earn Week One On-Chain: 2,930 New ERC-8004 Agents, 8,611 Hires and a 48-Wallet Hiring Ring on BNB Chain"
---

# Set and Earn, Week One: Who Is Hiring Whom on BNB Chain

BNB Chain's Set and Earn campaign runs from 1 October to 5 November 2026. The campaign page sums it up: "hire 3 different agents across at least 2 marketplaces, and build 1 of your own." Both halves leave a record on BNB Chain (BSC). Agents are registered in the ERC-8004 identity registry, and hires are events on the marketplaces' contracts.

We read the first four days: **Oct 1 00:00 UTC to Oct 5 02:24:59 UTC**, BSC mainnet blocks 125,000,755–125,787,829. On BSC testnet we read blocks 134,146,320–134,934,814, which run nine minutes longer, to 02:33:47 UTC; no testnet hire falls in those nine minutes, so no count changes. Every number below is as of the end of that window unless it carries its own date.

Short version:

- **2,930 ERC-8004 agents** were registered on BSC mainnet. **746** of them point to a campaign marketplace (745 TermiX, 1 Dolphin). 70% come from three programs that aren't part of the campaign.
- **8,611 hire events** on the marketplaces we could resolve, **8,343** of them on TermiX. 221 are on testnet, including 176 Agent Souk payments. 92.6% of TermiX's hirers are wallets our [September TermiX decode](/decodes/termix-on-chain) placed in its linked cycling groups.
- **13 agents** have at least 3 completed hires from at least 3 distinct wallets with no funding link found to the agent within 4 hops. **9 of the 13** belong to one closed set of 48 TermiX wallets that hire only each other.
- **0 of 47** hires created since Oct 1 on the shared mainnet ERC-8183 contract have completed. That is by design: its dispute window is 7 days, so the first completions land around Oct 8.
- **5 wallets** hired 3 or more agents across 2 or more marketplaces. Their first funders are all different.

---

## The rules, as written

The parts of the campaign rules this decode measures, quoted from the campaign page:

- **Hires.** "A hire counts from the point its hire event is emitted onchain." "Mainnet and testnet hires both count. Each hire must be of a different agent, and your 3 hires must span at least 2 different marketplaces."
- **The agent you build.** "Registered on the ERC-8004 identity registry (chain 56 or 97), owned by your registered campaign wallet, and listed on a shortlisted marketplace." "A resolvable agent card at its registered domain, stating what it does and which category it operates in (yield, grid, rebalancing or health factor)." "At least 3 completed hires from 3 distinct wallets that are not yours and not funded by yours."
- **Fair play.** Excluded: "Wallets sharing a common funding source, or transacting circularly with each other."

The page adds: "Agents are reviewed against these criteria after the campaign closes, using onchain data and public endpoints." This is an early look at the same data. Here, a **hire** is the event a marketplace's contract emits when a job or subscription is created, and counts are addresses, not people.

---

## 2,930 new agents, 746 on a campaign marketplace

The ERC-8004 identity registry on BSC mainnet is [`0x8004A169…`](https://bscscan.com/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432), the same contract TermiX's escrow reads agents from. In the window it logged **2,930** `Registered` events (agent IDs 361,189–364,118) from **2,672** owner wallets. We grouped them by where each agent's card lives: the agentURI host, or the name on an inline card.

| Origin | Oct 1 | Oct 2 | Oct 3 | Oct 4 | Oct 5* | Total |
|---|---:|---:|---:|---:|---:|---:|
| EvoEvo / NeoSoul, not a campaign marketplace | 205 | 195 | 241 | 569 | 10 | **1,220** |
| **TermiX** | 27 | 258 | 415 | 45 | 0 | **745** |
| "Ave.ai Trading Agent" inline template, not a campaign marketplace | 200 | 180 | 181 | 123 | 11 | **695** |
| Quack AI Q402, not a campaign marketplace | 21 | 31 | 30 | 45 | 6 | **133** |
| Empty agentURI | 15 | 30 | 21 | 7 | 0 | **73** |
| Other inline cards | 13 | 9 | 9 | 17 | 0 | **48** |
| Other hosts | 4 | 1 | 4 | 5 | 1 | **15** |
| **Dolphin** | 0 | 1 | 0 | 0 | 0 | **1** |
| **Total** | **485** | **705** | **901** | **811** | **28** | **2,930** |

\*Oct 5 covers 00:00–02:24:59 UTC.

EvoEvo, the Ave.ai template and Quack's Q402 account for **2,048 of the 2,930 (70%)**, and TermiX for 745 (25%), peaking at 415 on Oct 3. On their own, new ERC-8004 registrations on BSC say little about the campaign.

On the cards:
- 2,857 of the 2,930 have a non-empty agentURI. In a sample of 3 agents per http host, every card resolved except one.
- **3 of the 743 inline cards** mention a campaign category: "Mayor Tom" (362349), "Plinth keeper" (363619) and "Brain on BNB — DeFi Agent" (363709). We didn't check the http-hosted cards for categories beyond the sample.
- 2 registrations say they were built with BNB Chain's own `bnbagent-sdk` v0.6.0: 361660 "Firstshare Checker" and 363619 "Plinth keeper". Both were later hired on the mainnet ERC-8183 contract.

---

## How the owners got their first BNB

For each owner we found the transaction that brought its first BNB, by binary search over archive nonce and balance, looking back up to 2,000,000 blocks (about 10.4 days) before its first registration in the window. A funder with at least 100,000 sent transactions counts as an exchange-style hot wallet; we don't name exchanges. For 40 random owners, Alchemy's earliest inbound BNB transfer gave the same funder and transaction 40 times out of 40.

| First BNB came from | EvoEvo | TermiX | Ave.ai | Q402 | Other | **All** |
|---|---:|---:|---:|---:|---:|---:|
| Another wallet that registered an agent in the window | 895 | 1 | 59 | 0 | 8 | **963** (36%) |
| Exchange-style hot wallet (≥100,000 transactions) | 32 | 306 | 124 | 0 | 39 | **501** (19%) |
| Existing wallet, active more than 10 days earlier (not traced) | 180 | 260 | 56 | 0 | 29 | **525** (20%) |
| Older wallet (fewer than 100,000 transactions) | 7 | 12 | 337 | 0 | 42 | **398** (15%) |
| None: its first transaction was its own, at gas price 0 (sponsored) | 9 | 11 | 0 | 132 | 2 | **154** (6%) |
| Contract | 14 | 5 | 98 | 0 | 5 | **122** (5%) |
| Batch or internal call, or unresolved | 1 | 1 | 2 | 0 | 5 | **9** |
| **Owners** | **1,138** | **596** | **676** | **132** | **130** | **2,672** |

No owner's first BNB came from a marketplace payout. That is expected: the escrows pay in stablecoins, and we didn't trace first stablecoin for all 2,672 owners.

**EvoEvo owners fund each other.** 895 of its 1,138 owners (79%) got their first BNB from another new registrant. Following those links gives trees of **247, 172, 147, 141 and 131** wallets, and one funder, [`0x9708738b…`](https://bscscan.com/address/0x9708738b65a866def24973f5d916dd8a8816208b), sent first BNB to 130 registrants. The 247-wallet tree starts at an exchange-style hot wallet. Its first three hops move 0.00128945, 0.00127200 and 0.00125456 BNB, the second hop 153 seconds after the first ([first hop](https://bscscan.com/tx/0x498b22f28c93fa1ef28bb704c3e03b6ed9e7b4c49dea6dc6cf799000b5b0706e), [second](https://bscscan.com/tx/0x5da8354fbfc06a92609b9a8387c59be5c21e2e38a185ca938e1124376e2c5f3a), [third](https://bscscan.com/tx/0xfb9ed2b853f154cfc84021c632adef0992fc28abcaa66d0f6d0398196e291d52)). Across all 246 wallet-to-wallet first-BNB transfers in the tree, the median is 0.00099 BNB. EvoEvo isn't a Set and Earn marketplace, but it is the largest single source of new BSC ERC-8004 agents in campaign week.

**Q402 owners started without BNB.** For all 132 Quack Q402 owners, the first transaction was their own, sent at gas price 0.

---

## Oct 2: an 11-hour funding stream from exchange-style hot wallets

Between **Oct 2 01:56:46 and 12:44:31 UTC**, **333** of the window's agent owners got their first BNB from the same **15 exchange-style hot wallets** (0.6M to 57.8M sent transactions each), about 31 an hour. **302** of them went on to register TermiX agents. [First](https://bscscan.com/tx/0x5759cda1e0fd71f954b1011d3f00eee22d4e79abc1da62c3739e43b45a653982), [last](https://bscscan.com/tx/0xefc91b64d00addd5586093ae628dfc3dee343ea2352eb897947b53530b399e91).

- **How the 15 were picked.** We found them by starting from TermiX's registrants, so the TermiX share is partly a product of how the stream was selected. In the same hours, the same 15 gave first BNB to **31 owners who registered other agents**: 15 EvoEvo, 9 Ave.ai and 7 others.
- **Amounts (the 302):** 0.0026 / 0.0033 / 0.0041 BNB (10th percentile / median / 90th).
- **Next:** the 302 registered their TermiX agents a median **34.8 hours** after funding (10th–90th percentile 30.9–38.9 h). **300 of them registered on Oct 3**, TermiX's peak day of 415.
- **Shared hot wallets.** Over the whole window, the same 15 also gave first BNB to 72 Ave.ai, 31 EvoEvo and 26 other owners. What sets the 302 apart is the timing and the shared destination, not the funding address.
- **Not September's wallets.** None of the 596 owners who registered TermiX agents in the window is among the 13,175 BSC wallets in our September decode.
- **Not hired.** Of the 745 TermiX agents registered since Oct 1, **2** had been hired by the window's end: 361259 and 362889, at $1 each.

This is where "common funding source" gets hard to apply. In the window, 501 owners got their first BNB straight from 33 exchange-style hot wallets. Read literally, the exclusion covers most of them. With an exception for exchanges, it misses a stream like this one.

---

## Hires per marketplace

The campaign's nine marketplaces record hires on four kinds of contract. We found them through each site's JS bundle, GitHub and public APIs, then decoded the raw logs. Mainnet to Oct 5 02:24:59 UTC, testnet to block 134,934,814 (02:33:47 UTC):

| Marketplace | Network | Where the hire is recorded | Hire events | Distinct hirers | Distinct agents | Completed |
|---|---|---|---:|---:|---:|---:|
| **TermiX** | Mainnet | Escrows [`0x6A52ba4C…`](https://bscscan.com/address/0x6A52ba4C84b348FaEAe13dDC7A97b4F6af23913C) (USDC) and [`0xCE02f987…`](https://bscscan.com/address/0xce02f987d8b8af694e13c8a843db9c77cabf544c) (USDT), `OrderCreated` | **8,343** | 8,229 | 8,225 | 8,336 |
| **Mandate** | Mainnet | Shared ERC-8183 contract [`0xEa4DAa31…`](https://bscscan.com/address/0xEa4DAa3100A767e86FDed867729ae7446476EBA6), `JobCreated`, marked "via mandatemarkets.com" in calldata | **27** | 5 | 12 | 0 |
| **Marque Trade** | Mainnet | Same contract, attributed through Marque's API | **5** | 2 | 4 | 0 |
| **Dolphin** | Mainnet | Same contract, marked by the `dolphinamp.xyz` WebAuthn origin in calldata | **3** | 1 | 2 | 0 |
| No marketplace marker | Mainnet | Same contract (+1 job from a `localhost` origin) | 11 (+1) | 3 (+1) | 3 (+1) | 0 |
| **Pokter** | Testnet | Testnet ERC-8183 contract [`0xa206c051…`](https://testnet.bscscan.com/address/0xa206c0517B6371C6638CD9e4a42Cc9f02A33B0DE), marked `"protocol":"pokter-job"` | **4** | 4 | 2 | 3 |
| No marketplace marker | Testnet | Same testnet contract (8 are self-hires) | 30 | 8 | 7 | 16 |
| **HelloFugu** | Testnet | FuguSubscription [`0xfdb08337…`](https://testnet.bscscan.com/address/0xfdb083371f44Cf53181350389D3217e51B431776), `Subscribed` (completion: `Claimed`) | **11** | 6 | 7 listings | 8 |
| **Agent Souk** | Testnet | sUSD [`0x9332b1AA…`](https://testnet.bscscan.com/address/0x9332b1AA9B3d5826F0b9b9e1659D962d2dA13A53) EIP-3009 payment; the payment is the whole hire | **176** | 2 | 8 | n/a |
| **KATTEGAT** | Testnet (also reads mainnet) | Shared ERC-8183 contracts; attribution only in its backend API | not separable | | | |
| **Agent Atlas** | Testnet | Its homepage lists the shared testnet contract | not separable | | | |
| **Total** | | | **8,611** | | | |

TermiX's completed orders are `OrderSettled` events, all in the provider's favour; 7 were still open. Leave TermiX out and week one comes to **268 hire events**, 176 of them Agent Souk's testnet payments.

**No jump at the campaign start.** On the two mainnet rails, hire volume looks like the days before:
- **ERC-8183 contract:** 39 mainnet jobs in the 4 days before Oct 1 (blocks 124,232,755–125,000,754), 47 in the window. Its lifetime job counter reads 56,906, so nearly all of its use predates Sep 27.
- **TermiX:** 1,938 to 7,249 BSC orders a day from Sep 20 to Sep 28, then 448, 4,176, 2,580 and 1,139 on Oct 1–4 (UTC days, split at exact block-header times).

**TermiX's hirers are mostly September's wallets.** Of its 8,229 hirers in the window, **7,621 (92.6%)** were in the linked cycling groups of our [September decode](/decodes/termix-on-chain), and their orders paid 88.7% of the **$7,749.78** in TermiX fees on orders created in the window. 311 hirers don't appear in our September data at all. 7,422 of the 8,229 also own an agent that was hired.

**A few wallets carry the smaller rails.**
- **Mandate:** [`0xd6d11aa5…`](https://bscscan.com/address/0xd6d11aa5046dc5c7be8d63b9223b60d7ad94cbe9) created **19 of the 47** mainnet ERC-8183 jobs, all of them Mandate's. It also created 20 of the 39 in the 4 days before.
- **Testnet ERC-8183:** [`0x1cc9c479…`](https://testnet.bscscan.com/address/0x1cc9c47969df5703952ec5048dc71f69adf89a4a) created 13 of the 34 jobs.
- **Agent Souk:** **174 of its 176** payments came from [`0xe5655abb…`](https://testnet.bscscan.com/address/0xe5655abbefbb9e1427174f8dc826880e9d1d4bc4). 105 went to [`0x84fedabd…`](https://testnet.bscscan.com/address/0x84fedabd1b83443ad86796c15619494878b64180), the agent its site labels "By Agent Souk", whose testnet funding trail includes the paying wallet. An Agent Souk hire is a single EIP-3009 payment with no separate hire or completion event. Whether that counts as a "hire event" is a call for the campaign team.

---

## One contract, six marketplaces, a seven-day wait

Dolphin, KATTEGAT, Marque Trade, Pokter, Agent Atlas and Mandate all record hires on the same two ERC-8183 contracts, one on mainnet and one on testnet. That has two effects.

**The event doesn't say which marketplace a hire came from.** `JobCreated(jobId, client, provider, evaluator, expiredAt, hook)` has no marketplace field, and its evaluator and hook don't tell marketplaces apart either: all 47 mainnet jobs in the window use one router contract, and all 34 testnet jobs use another. Attribution lives in calldata strings (Mandate, Pokter, Dolphin's WebAuthn origin) or in the marketplaces' own APIs (Marque, KATTEGAT). **41 of the 81** jobs carry no marker at all (11 mainnet, 30 testnet), plus 1 from a `localhost` origin. So "your 3 hires must span at least 2 different marketplaces" can't be checked from on-chain data alone.

**Mainnet hires complete after a week, by design.** The mainnet policy contract, [`0x9C018457…`](https://bscscan.com/address/0x9c01845705b3078aa2e8cff7520a6376fd766de5), returns `disputeWindow()` = **604,800 seconds, 7 days**. The testnet policy, [`0xd6a42175…`](https://testnet.bscscan.com/address/0xd6a4217588f6b1f5657a92a3e94e6422ad771cea), returns 900 seconds.

- **0 of the 47** mainnet jobs created since Oct 1 had a `JobCompleted` event by the window's end. The 19 `JobCompleted` events in the window belong to jobs created before Oct 1, and each landed 7.00 to 7.01 days after its job was created: the window working as designed.
- For comparison, TermiX orders in the window settled a median of about 79 seconds after creation (interpolated from block numbers), and the 19 testnet jobs that completed took 16 to 85 minutes.

The campaign runs to Nov 5, so the 7-day window can be met. But any count of completed hires for a mainnet ERC-8183 agent runs a week behind its hires, and the first completions of campaign hires can only appear around Oct 8.

---

## Would the hirers pass "not yours and not funded by yours"?

**67 agents** had 3 or more hires in the window, and **30** of them had 3 or more distinct hirers. For each of the 163 hirer–agent pairs behind them, we looked for a funding link between the hirer and the wallet the agent pays out to:

1. **Trails.** Follow each wallet's first inbound BNB and first inbound USDT or USDC back up to 4 hops, stopping at a contract or an exchange-style hot wallet. Mainnet trails use Alchemy, which doesn't include contract-internal BNB transfers. Testnet trails follow first tBNB only.
2. **Checks,** in order: a self-hire; the payee in the hirer's trail; the hirer in the payee's trail; the two trails sharing a wallet that isn't a hot wallet; any direct BNB, USDT or USDC transfer between the two (mainnet only).
3. **No link found** means none of these matched within 4 hops. Most of those trails end at an exchange-style hot wallet or at contracts and addresses we did not identify, and we can't see past them.

By pair, as of Oct 5 02:24:59 UTC:

| What we found between hirer and payee | Pairs | Share |
|---|---:|---:|
| **Linked to the owner or payee.** 4 owner-linked (1 self-hire, 2 where the payee funded the hirer, 1 where the hirer owned the agent when it hired it), 51 sharing a funder that isn't a hot wallet, 11 with a direct transfer, 5 where the hirer funded the payee | **71** | 44% |
| **No link between the pair, but both inside the closed 48-wallet ring** below | **59** | 36% |
| **No link found within 4 hops, outside the ring** | **33** | 20% |
| **Inconclusive** (same exchange hot wallet within 24 hours) | 0 | |

The inconclusive rule matched no pairs, so pairs funded in the same hot-wallet burst may sit in "no link found". The one owned-agent pair, Brain on BNB's, was invisible to the funding trace; we moved it out of "no link found" by hand from the registry's own `Transfer` event (details below).

By agent:

| Rail | Agents with 3+ hires | …from 3+ distinct wallets | …3+ of them with no link found | …and 3+ completed |
|---|---:|---:|---:|---:|
| TermiX, the 48-wallet ring | 48 | 24 | 9 | **9** |
| TermiX, other | 2 | 2 | 2 | **2** |
| ERC-8183 mainnet (Mandate, Marque, no marker) | 7 | 2 | 1 | **0** |
| Testnet (Agent Souk, HelloFugu, Pokter, no marker) | 10 | 2 | 2 | **2** |
| **Total** | **67** | **30** | **14** | **13** |

**13 agents** pass a per-agent version of the test. 9 of them are inside one ring.

---

## 48 wallets, 3 rounds, 4 groups of 12

**Who.** 48 TermiX agents, IDs between 332,867 and 333,006, all registered on **Sep 4 between 07:27 and 08:47 UTC**. Since Oct 1, each has been hired exactly **3 times**, every time by one of the other 47 owners. No outside wallet hired a ring agent, and no ring wallet hired an agent outside the ring.

**When.** Three rounds of exactly 48 hires, one hire per wallet per round:

| Round | Hires | Window (UTC) |
|---|---:|---|
| Oct 1 | 48 | 07:42–10:22 |
| Oct 3 | 48 | 07:19–12:02 |
| Oct 4 | 48 | 06:54–09:47 |

**Shape.** Every wallet made 3 hires and received 3. They form **4 closed groups of 12** wallets, each hiring only within itself, with 30 reciprocal pairs among 119 distinct hirer–agent links.

**Size.** $20, $21 or $22 per hire. All 144 orders settled, a median **307 seconds** after creation, for $2,976.00 in total, $59.52 of it in TermiX fees.

One of them, agent 332962, owned by [`0x15d08640…`](https://bscscan.com/address/0x15d08640aeefbdce11930d9c9a30884011f654f6):
1. **Oct 1 07:42:05.** Hired by [`0x4e276b4d…`](https://bscscan.com/address/0x4e276b4db12447254134b45e5add170993df5ad2). [`0xbd31cf49…`](https://bscscan.com/tx/0xbd31cf49e41e7b6b337399d26458238245676aa7bf833414320a8cdecf5bdb23)
2. **Six minutes later,** its owner hires `0x4e276b4d…`'s agent 332966. [`0x0257c9cc…`](https://bscscan.com/tx/0x0257c9ccd00d016c1a6efbca3c8820fa0806d680711ce6ecaa222fb86c2181fd)
3. **Oct 3 07:19:06.** Hired by [`0x99f88c4c…`](https://bscscan.com/address/0x99f88c4cae19f858052236f808b75967eece5bd0). [`0xca129aba…`](https://bscscan.com/tx/0xca129aba49138f7136ad0ab3117eaf19aa5e632fb0ea6f3d04b4728650591385)
4. **Oct 4 06:54:28.** Hired by `0x99f88c4c…` again. [`0x61816ae7…`](https://bscscan.com/tx/0x61816ae7d49619934d17074b498b7d1fcc350e5a1bf528bd709eeacbd309230f)

The owner's other two hires were of agents 332965 ([`0x260ebe8e…`](https://bscscan.com/tx/0x260ebe8efff64f273feea425842fe1dd3c4a3d7d5d44072ffbfb02f7dcf51361)) and 332963 ([`0x236d70b9…`](https://bscscan.com/tx/0x236d70b9beb20230c3a341754681e8129ab11c2f0742433a8ff1678994d8eef8)). Agent 332962 has 3 hires from 2 distinct hirers. Across the ring, **24 of the 48** agents have 3 distinct hirers, 23 have 2 and 1 has 1.

**Funding.**
- **One stablecoin sender, Sep 5.** Between **Sep 5 06:56 and 09:30 UTC**, within 2.6 hours, one wallet, [`0xc5e62c8a…`](https://bscscan.com/address/0xc5e62c8a854d2df11a17a59429d3bd4a9c5414d9) (174 transactions), sent USDC or USDT to **31 of the 48**. [First](https://bscscan.com/tx/0x329fddb153de52e956992f037cae246bac6358dcd191597895a753be01c196bf), [last](https://bscscan.com/tx/0x8bb0d158b15b93952d71ca14d0526b8d648819b176b1e3d1e8da0a3798469e5a). 25 of the 48 had no earlier stablecoin inflow in our data, which begins in June 2026. That isn't the same as a first-ever inflow: in a spot check of 3 of the 25, 2 had received stablecoin from other wallets earlier.
- **Shared funders.** In their 4-hop trails, 37 of the 48 are joined into one group through shared funders (not hot wallets) or direct transfers, and 5 more form a second group.
- **Prior activity.** All 48 were TermiX participants in September, having bought 13 to 17 jobs each (median 14).

**Against the rules.** On the build side, the hire count is met: every ring agent has 3 completed hires on 3 different days, though only 24 have 3 distinct hirers. On the hire side it isn't: every ring hire is on TermiX, and the rule needs 2 marketplaces.

**Why the check has to be group-level.** Checked pair by pair, **9 of the 48 agents pass**: for their specific hirer–payee pairs, no link shows within 4 hops. What connects them is visible only across the set: one closed group of 48 hirers, shared funders, and one wallet that sent stablecoin to 31 of them on Sep 5. The fair-play exclusion of wallets "transacting circularly with each other" covers this as worded. A per-agent check doesn't see it.

---

## The agents that look independent

Four agents had 3 or more completed hires from 3 or more distinct wallets, no funding link found, outside the ring:

- **TermiX 352475** (payee [`0xe7ee2a3f…`](https://bscscan.com/address/0xe7ee2a3fcd936fd148ed563144beeeb3e46bd80b)): 7 hires at $1 from 7 wallets, 4 settled, from 4 distinct wallets ([example](https://bscscan.com/tx/0x7fd59f0ded5380212989abbb3e12994c15641639a415a27a165e290e72fc8432)). Of the 7 hirers' stablecoin trails, 5 end at contracts we did not identify and 2 at exchange-style hot wallets. One hirer, [`0x592b9b9b…`](https://bscscan.com/address/0x592b9b9be02bd5a5d97a7db770b4c4dca1b98af5), was in a linked cycling group in September.
- **TermiX 355860** (payee [`0xf8a14ce6…`](https://bscscan.com/address/0xf8a14ce6d8c1d09397f7f10b22a73e94e8c61a7a)): 5 hires at $1 from 5 wallets, 3 settled ([example](https://bscscan.com/tx/0xe47ccc6801812f65c731c6dde004801770df82ca243028ff76e192af9d8918c2)). Three of its hirers also hired 352475.
- **Pokter testnet agent [`0x60ef1484…`](https://testnet.bscscan.com/address/0x60ef148485c2a5119fa52ca13c52e9fd98f28e87):** 3 hires from 3 wallets, all completed. Each hirer got its first tBNB from a different address: [`0xaa25aa7a…`](https://testnet.bscscan.com/address/0xaa25aa7a19f9c426e07dee59b12f944f4d9f1dd3) (19.4 million sent transactions, unidentified), [`0x651445d5…`](https://testnet.bscscan.com/address/0x651445d54e00075cf91d3f52bf937af239efef91) and [`0x27fcfcd7…`](https://testnet.bscscan.com/address/0x27fcfcd74f7379733123ffd862c4596e85eaad8b).
- **HelloFugu listing 21** (payee [`0x494ae5cf…`](https://testnet.bscscan.com/address/0x494ae5cf2729e662cc05dbd63d2107d707fd00de)): 4 subscriptions from 4 wallets, all claimed. 3 of the hirers got their first tBNB straight from that same high-volume address, `0xaa25aa7a…`.

A fifth, mainnet ERC-8183 agent [`0xdf1074a2…`](https://bscscan.com/address/0xdf1074a272c53a1a10b96fa0201eb58bbbaafe00), has 3 distinct hirers with no link found, but no completed hires yet because of the 7-day window.

Four of the other mainnet ERC-8183 agents with 3 or more hires:

| Agent payee | Hires | Hirers | What we found |
|---|---:|---:|---|
| [`0x86502596…`](https://bscscan.com/address/0x86502596665183ef82047a8c9772eb25dbb01b14) ("Firstshare Checker", bnbagent-sdk) | 5 | 1 | The hirer, [`0xca5a60e1…`](https://bscscan.com/address/0xca5a60e133c9650ea391be41983879a0ba2e68d2), and the payee share 4 funders that aren't hot wallets |
| [`0xb12a1e4e…`](https://bscscan.com/address/0xb12a1e4e0e22a97e266ed7a6bfc4133f699b1a1b) ("Plinth keeper", bnbagent-sdk) | 6 | 2 | 5 hires came from [`0x1bc8751c…`](https://bscscan.com/address/0x1bc8751cee3cca2f65cd624e7925558aa6f9af34), which shares 3 funders that aren't hot wallets with the payee |
| [`0x004c7ae8…`](https://bscscan.com/address/0x004c7ae8077560c75fe5687da39e7be0697ddbfd) | 4 | 3 | One hirer, [`0x003911a1…`](https://bscscan.com/address/0x003911a1dd39d21de18a4a54a8af8692cb62a301), sent BNB to the payee directly on Sep 26 ([`0x5ec5093a…`](https://bscscan.com/tx/0x5ec5093a75a857912932a0531fe64f68ff7194d0e73765c397e389cfa43f916a)) |
| [`0x73809f69…`](https://bscscan.com/address/0x73809f69916fcf7ddc5bb1315fbdf96a569a5963) (registrant and agent wallet of 363709, "Brain on BNB — DeFi Agent") | 9 | 2 | Owner-linked. The agent NFT moved from `0x73809f69…` to [`0xbFAA6923…`](https://bscscan.com/address/0xbfaa69233741924ed5b9d5daa9b4bf7b84567f0a) on Oct 4 at 14:46 UTC ([`0xeec49d09…`](https://bscscan.com/tx/0xeec49d097c1306da51ca42d8ac8762a53fc0feb4ad98c98a99a05bb591f17ef3)), and that wallet hired the agent about 2 hours later, at 16:53 ([`0x581d9038…`](https://bscscan.com/tx/0x581d903814f4f2479177e7664d92043922149f0fcb9d7f0fde04200049f210c6)). The card also names `0xbFAA6923…` as its operating wallet. The other 8 hires came from `0xd6d11aa5…`, with no funding link found |

The last row is a link the funding trace can't see. The registry's own `Transfer` event shows it, and so does the agent's card.

---

## Five wallets hired across marketplaces

**Five wallets** had hired 3 or more distinct agents on 2 or more marketplaces by the window's end. Jobs without a marketplace marker don't count towards the marketplace total.

| Wallet | Marketplaces | Agents hired | First funding |
|---|---|---:|---|
| [`0x0d8c9ad8…`](https://bscscan.com/address/0x0d8c9ad8eebb6879fefa218f0799219bcaabe999) | Marque Trade (mainnet), Agent Souk (testnet) | 4 | Mainnet BNB from [`0x99186e9a…`](https://bscscan.com/address/0x99186e9a933fd83c0813d7ee694464ca55aeb7f9) (95 transactions; 0.0004 BNB in Feb 2024), itself funded by an exchange-style hot wallet; testnet from [`0x795009bb…`](https://testnet.bscscan.com/address/0x795009bb38a32348344a36a4cfcb36e4e84cb8d8) (2 transactions) |
| [`0xbfaa6923…`](https://bscscan.com/address/0xbfaa69233741924ed5b9d5daa9b4bf7b84567f0a) (owner of Brain on BNB, agent 363709, since Oct 4 14:46 UTC; also named on its card) | Mandate, Marque Trade (+1 with no marker, a hire of its own agent 363709) | 4 | Mainnet BNB from an exchange-style hot wallet, [`0x161ba15a…`](https://bscscan.com/address/0x161ba15a5f335c9f06bb5bbb0a9ce14076fbb645) |
| [`0x494ae5cf…`](https://testnet.bscscan.com/address/0x494ae5cf2729e662cc05dbd63d2107d707fd00de) | HelloFugu, Pokter (testnet) | 3 | `0xaa25aa7a…` (19.4M transactions, unidentified), block 134,304,809 |
| [`0x0b306a35…`](https://testnet.bscscan.com/address/0x0b306a358aef8c391779bcc62a8253aabf524993) | HelloFugu, Pokter (testnet) | 3 | `0x651445d5…` (10,954 transactions), block 134,601,877 |
| [`0x37fc1f94…`](https://testnet.bscscan.com/address/0x37fc1f942085c2ef2be4f6c0b6b9aba426d7bd68) | HelloFugu, Pokter (testnet) | 4 | `0x27fcfcd7…` (175 transactions), block 134,821,059 |

- **No shared funding.** Their funders are all different, and the three testnet wallets were funded more than a day apart. Without its hire of its own agent, `0xbfaa6923…` still hired 3 distinct agents on 2 marketplaces.
- **The three testnet wallets are builders too.** They registered testnet ERC-8004 agents (IDs 2545, 2550 and 2554–2556) and HelloFugu listings 21–25, and they hire each other's agents: `0x0b306a35…` hired `0x494ae5cf…`'s listing 21, and all three hired the same Pokter agent, `0x60ef1484…`.
- **No TermiX crossover.** No wallet that hired on TermiX since Oct 1 appears on any other resolved marketplace, the 48 ring wallets included.

Five is a lower bound. KATTEGAT and Agent Atlas hires can't be told apart on-chain, and 41 ERC-8183 jobs carry no marketplace marker.

---

## What the chain can't show here

- **The trails are a limited view.** They follow only the *first* inbound BNB and stablecoin per hop, up to 4 hops, and Alchemy's BNB data has no contract-internal transfers. "No link found" mostly means a trail ended at an exchange-style hot wallet or at a contract or address we did not identify. It doesn't prove independence, and Brain on BNB shows an owner link the trace missed.
- **The burst rule found nothing.** "Inconclusive" (same hot wallet, under 24 hours apart) matched no pairs, so pairs funded in one exchange burst may be counted as "no link found".
- **525 owners weren't traced.** Owners active more than about 10 days before registering are labelled "existing wallet".
- **No stablecoin pass for owners.** We didn't trace first stablecoin for all 2,672 owners, so a marketplace payout as first funding isn't measured.
- **Attribution depends on off-chain markers.** ERC-8183 jobs are assigned to Mandate, Pokter and Dolphin by calldata strings, and to Marque by Marque's API. KATTEGAT and Agent Atlas are unresolved.
- **Testnet trails are thin.** They use tBNB only, with no direct-transfer check, and high-volume testnet addresses such as `0xaa25aa7a…` count as hot wallets.
- **No address labels.** "Exchange-style hot wallet" means at least 100,000 sent transactions. Contracts and high-volume addresses weren't identified.
- **The window is short.** Four days and 2.4 hours of a campaign that runs to Nov 5. Mainnet ERC-8183 completions can only start appearing around Oct 8.
- **Not examined:** Agent Souk's mainnet settlement in its $U token, which its README says happens at campaign end; TermiX's vault events; the 5 `NewFeedback` events on the ERC-8004 reputation registry; and whether the 302 TermiX registrants from the Oct 2 stream go on to hire.

---

## What week one shows

For anyone checking hires against these rules:

- **Check groups, not only pairs.** A pairwise "not funded by you" test passes 9 agents of a closed 48-wallet ring. The ring shows up when funding and hire links are grouped across wallets. We haven't yet run that group check across all hirers.
- **ERC-8183 hires need off-chain attribution.** Six marketplaces share the contract and its events carry no marketplace, so the two-marketplace rule depends on calldata markers and marketplace APIs.
- **Mainnet completions lag a week, by design.** No mainnet ERC-8183 hire from campaign week had completed by Oct 5; the 7-day dispute window puts the first ones around Oct 8.
- **Exchange funding cuts both ways.** Without an exception for exchanges, "common funding source" covers most wallets. With one, an 11-hour stream that first-funded 333 new owners, 302 of them TermiX registrants, passes.
- **A hire isn't the same event everywhere.** On Agent Souk it is a single payment with no separate hire or completion event.

ChainWard's per-agent funding trace (who funded an agent's top payers, up to 4 hops back) is live for BNB Chain at [chainward.ai/docs](https://chainward.ai/docs), with `?chain=bsc`.

The [first full week's follow-up](/decodes/set-and-earn-week-one-closed) extends this to Oct 8. Its wallet list, every wallet that hired an agent that week with its tier and groups, is [a CSV for 10 USDC](/paid/set-and-earn-week-one), with a free one-wallet check on the same page.

---

*Data pulled October 5, 2026. Window: Oct 1 00:00:00 UTC to Oct 5 02:24:59 UTC, BSC mainnet blocks 125,000,755–125,787,829, and BSC testnet blocks 134,146,320–134,934,814 (to 02:33:47 UTC; no testnet hire falls after 02:24:59). Registry, marketplace and ERC-8183 logs were read from keyless public RPCs (rpc.sentio.xyz/bsc and rpc.sentio.xyz/bsc-testnet) with `eth_getLogs` in 10,000-block chunks, plus archive state; every pull covers its full block range with no gaps. Hirer and payee funding trails used Alchemy's asset-transfer API on BNB mainnet. Owners' first BNB was found by archive binary search, cross-checked against Alchemy for 40 random owners (40 of 40 matched). Marketplace contracts were found from each site's JS bundle, GitHub and public APIs. September wallet groups come from our [TermiX decode](/decodes/termix-on-chain), whose window ended Sep 29. Campaign rules are quoted from the campaign page on bnbchain.org. Every cited transaction was re-read on a public RPC (status 1, expected sender and contract), and the dispute windows and the job counter were re-read on-chain. "Exchange-style hot wallet" means an address with at least 100,000 sent transactions; we have no address labels and did not name exchanges. Counts are addresses, not people: the chain shows where money moved, not who controls a wallet or why. Nothing here is a verdict on the campaign, on any marketplace or on any wallet.*

*Disclosure: ChainWard has an open BNB Chain Builder Grant application and has offered BNB Chain a paid verification service for this campaign. It sells the week-one wallet list linked above.*
