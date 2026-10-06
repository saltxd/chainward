---
title: "BNB Chain's ERC-8004 Registry Count Says Little About Set and Earn"
subtitle: "3,496 new BSC agents since Oct 1: 69% from EvoEvo, Quack Q402 and an Ave.ai-branded card, at late-September pace; none of those hired."
date: "2026-10-06"
slug: "bsc-erc8004-registry"
seoTitle: "Where BNB Chain's New ERC-8004 Agents Come From: EvoEvo, Quack Q402 and an Ave.ai-Branded Template Card"
---

# BNB Chain's ERC-8004 Registry Count Says Little About Set and Earn

Our [week-one decode](/decodes/set-and-earn-week-one) found that 70% of new agents on BNB Chain's ERC-8004 identity registry came from three programs outside the Set and Earn campaign. Here is what they are.

We read the registry [`0x8004A169…`](https://bscscan.com/address/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432) from **Oct 1 00:00 to Oct 6 04:15:09 UTC** (BSC blocks 125,000,755–125,994,332), plus all of September. Values are as of block 125,994,332 unless stated.

Short version:

- **3,496 agents** were registered. **2,406 (69%)** come from EvoEvo/NeoSoul, Quack AI's Q402 and 853 agents carrying an "Ave.ai Trading Agent" template card. None is a Set and Earn marketplace.
- **The three show no campaign bump.** The registry took 675 agents a day in the window, against 635 in the last week of September. September's total was **36,739**, 65% from the same three.
- **0 of the 2,406** appear in any hire on TermiX or the shared ERC-8183 contract.
- **EvoEvo:** 864 of its 1,284 owner wallets (67%) sit in funding chains of 20 or more. Each registers at gas price 0, binds the agent to EvoEvo and passes its BNB on. Exchange-style withdrawals seeded the four largest and refilled all four.
- **The Ave.ai-branded card:** 853 identical cards with no service listed, from 832 separate, active trading wallets.
- **Quack Q402:** 168 new agent wallets, each first registered gaslessly as its first transaction. No USDT or USDC moved in or out of them on BSC or Base in the window.

> **First funder:** the wallet that sent an owner its first BNB, searched over the 10.4 days before its first registration. **Exchange-style hot wallet:** an address with 100,000+ sent transactions (this also catches bridge solvers); we don't name exchanges. **Gas price 0:** BSC accepts it when a paymaster bundles the transaction with a sponsor transaction that pays ([BEP-414](https://github.com/bnb-chain/BEPs/blob/master/BEPs/BEP-414.md)).

---

## Who registered what

Same grouping rules as week one; they reproduce its table exactly.

| Origin | Oct 1 | Oct 2 | Oct 3 | Oct 4 | Oct 5 | Oct 6* | Total |
|---|---:|---:|---:|---:|---:|---:|---:|
| EvoEvo / NeoSoul | 205 | 195 | 241 | 569 | 126 | 47 | **1,383** |
| "Ave.ai Trading Agent" card | 200 | 180 | 181 | 123 | 148 | 21 | **853** |
| **TermiX** (campaign marketplace) | 27 | 258 | 415 | 45 | 26 | 8 | **779** |
| Quack AI Q402 | 21 | 31 | 30 | 45 | 43 | 0 | **170** |
| bitagent | 0 | 0 | 1 | 1 | 139 | 0 | **141** |
| Empty agentURI | 15 | 30 | 21 | 7 | 20 | 1 | **94** |
| Other | 17 | 10 | 12 | 21 | 10 | 4 | **74** |
| **Dolphin** (campaign marketplace) | 0 | 1 | 0 | 0 | 1 | 0 | **2** |
| **Total** | **485** | **705** | **901** | **811** | **513** | **81** | **3,496** |

\*Oct 6 covers 00:00–04:15 UTC.

Registrations per day:

| Origin | Sep 1–30 | Sep 24–30 | Oct 1–6* |
|---|---:|---:|---:|
| EvoEvo / NeoSoul | 546 | 282 | 267 |
| "Ave.ai Trading Agent" card | 212 | 160 | 165 |
| Quack AI Q402 | 43 | 35 | 33 |
| TermiX | 378 | 118 | 150 |
| **All agents** | **1,225** | **635** | **675** |

September's average is front-loaded: EvoEvo registered 4,783 agents on Sep 1–2 and TermiX 3,051 on Sep 14.

**bitagent** ("BitAgent by UniBase", not a campaign marketplace) grew after week one: 139 agents on Oct 5, each owner funded with exactly 0.0015 BNB by one EIP-7702 wallet, [`0xfb0ce70a…`](https://bscscan.com/address/0xfb0ce70ad5bcce56567ee66bd11955ec10ba9741). A platform paying gas for its users would look the same.

In all four programs, each agent is its own transaction, sent by its owner straight to the registry, so any link between owners comes from funding.

---

## EvoEvo: chains that register, bind and pass BNB on

**1,383 agents, 1,284 owner wallets.** 1,024 owners (80%) got their first BNB from another window registrant. Those links form 261 trees: 247 single wallets and 14 groups. Eight chains of 20 or more hold **864 owners (67%)**. A ninth group is a fan-out: [`0x9708738b…`](https://bscscan.com/address/0x9708738b65a866def24973f5d916dd8a8816208b) sent 0.0001 BNB to each of 130 new wallets on Oct 4, which paid gas to register and funded no other registrant.

One tree whose first wallet registered on Oct 5, after the week-one window. That wallet's BNB came through a one-transaction wallet that pooled the leftovers of earlier EvoEvo wallets. Two pooling steps up, the trail reaches the 172-wallet chain below:

| Step | Wallet `0xa22da077…`, agent 364178 | UTC |
|---|---|---|
| 1 | Receives 0.0028565 BNB ([tx](https://bscscan.com/tx/0xf1062dce05a93b08b776a549c89fafb0d47eb3ac81f595c43250c928c5081b85)) | 05:02:59 |
| 2 | Registers as its first transaction, gas price 0 ([tx](https://bscscan.com/tx/0xe768e8649a134d3e63f2c9870a84e1a1444d32c2140df9ea00ffcf38334e0755)) | 05:50:25 |
| 3 | Binds the agent on EvoEvo's router ([tx](https://bscscan.com/tx/0x63371a6517d1fef17770763419101198009113cadcb872f2e4619c154b3b104d)) | 05:50:33 |
| 4 | Sends all 0.0028391 BNB left to a new wallet ([tx](https://bscscan.com/tx/0xeeacff03ebb0d54dc9d69b992d6c48e6a2cc0e2224406cb0d706b4d419a5d853)), which registers agent 364179 36 seconds later | 05:51:26 |

The next three wallets repeat it by 05:55, each forward 0.0000174 BNB smaller: the gas for a bind and a transfer. Across the 894 links outside the fan-out, a child registered a median **141 seconds** after its parent.

**How the biggest chains are fuelled.** The four largest trees, 247, 172, 147 and 141 wallets, each start with one 0.0012–0.0025 BNB transfer from an exchange-style hot wallet ([example](https://bscscan.com/tx/0x498b22f28c93fa1ef28bb704c3e03b6ed9e7b4c49dea6dc6cf799000b5b0706e)). A 0.0013 BNB seed covers about 74 hops, so the 247-, 147- and 141-wallet chains were refilled at hops 68–73 by similar withdrawals, and the 247-wallet chain again at hop 146. Those four refills each reached the near-empty wallet 44–182 seconds before it forwarded; [one](https://bscscan.com/tx/0xe0a522c0523f30a0068b5fae93be6f4f655013ce809ed56930c3521d203042d7) came from the hot wallet that seeded its chain. The 172-wallet chain was refilled too: at hop 19, [`0x3e146ac2…`](https://bscscan.com/tx/0x7924f2d668dd7ab7d34329d8df3e9041b1898650d87503e6f061d97a59414451) received 0.00377 BNB on Oct 4 at 10:22 UTC from the same hot wallet behind the hop-146 refill and split it across four branches within five minutes. Public explorers label all six seed and refill wallets as wallets of one exchange. There may be more we can't see.

**What EvoEvo and a points guide say.** A third-party AirdropAlert guide, dated Aug 22, lists a NeoSoul points task: create an agent, "then register and bind its ERC-8004 identity on BNB Smart Chain". It notes NeoSoul "has not confirmed a native token airdrop". EvoEvo's [agent kit](https://github.com/NeoSoul-AI/evoevo-agent-kit) describes the same flow: register, then "bind that identity into EvoEvo".

**What the chain shows.** 1,308 of the 1,383 agents were bound by their owner, a median **8 seconds** after registering. Of the 864 chain wallets, 850 sent exactly 3 transactions, the register-bind-forward count, and 857 hold no BNB. That fits one participant running many agents for points, or a script provisioning a wallet per agent; the chain can't tell which.

---

## The "Ave.ai Trading Agent" card: one card, many traders

**853 agents, 832 owners.** Every card is the same inline JSON: "Ave.ai Trading Agent", "AI-driven multi-chain trading agent with on-chain reputation.", an Ave.ai logo URL, no service. It isn't new: 6,367 agents used it in September, and agent 12,631, minted Mar 2, 2026, carries it today.

- **Dispersed funding.** 543 first funders; the most any one started was 13 (an address explorers label a bridge solver). The largest registrant tree has 10 wallets.
- **Larger first deposits.** Median 0.01 BNB, 90th percentile 0.47, against EvoEvo's 0.00084.
- **Active wallets.** 750 of 832 sent tokens in the window (26,634 transfers). The median owner has sent 19 transactions; every owner holds BNB.
- **Registered on arrival.** 550 registrations were the wallet's first transaction, a median 7 minutes after its first BNB. That fits an app registering each new wallet; we couldn't confirm whose.

**What Ave.ai says.** It calls itself an "on-chain crypto trading platform, integrating 130+ blockchains and 300+ DEXs". Its homepage and docs index don't mention ERC-8004; the card's name and logo are the only link.

---

## Quack Q402: agent wallets, no stablecoin moved

**170 agents, 168 owners.** For every owner, its first registration was its first transaction ever, at gas price 0 with no BNB. 166 have sent nothing else; all hold 0 BNB. No USDT or USDC moved to or from them on BSC or Base in the window, and none had a Base transaction, ETH or USDC when checked at Base block 52,235,866. Each "Q402 Agent (by Quack AI)" card also names a second wallet; none of those 168 had been used on either chain.

**What Quack says.** The [Q402 docs](https://q402.quackai.ai/docs) offer "a dedicated signing wallet for each AI agent… Each owner can provision up to 10 agent wallets". For a Sep 29 Seoul side event, the [event page](https://q402.quackai.ai/event) asked people to "Sign up with Google on this page and claim your Agent Wallet" for an NFC card; Q402 registered 33 agents a day on Oct 1–6 against 35 a day on Sep 24–30.

**What the chain shows.** Agent wallets created and registered at no gas cost to their owners. The docs describe the wallets and gasless payments; none of these wallets paid anyone on BSC or Base in the window.

---

## Has anyone hired them?

We joined every agent against **8,981** TermiX `OrderCreated` events and **49** `JobCreated` events on the shared ERC-8183 contract, matching ERC-8183 providers by owner, agentWallet or calldata agent id.

| Program | Agents | Hired | Hiring others | ERC-8004 feedback |
|---|---:|---:|---:|---:|
| EvoEvo / NeoSoul | 1,383 | 0 | 0 | 0 |
| "Ave.ai Trading Agent" card | 853 | 0 | 0 | 0 |
| Quack Q402 | 170 | 0 | 0 | 0 |
| bitagent | 141 | 0 | 0 | 1 event |
| TermiX, for comparison | 779 | 9 | 306 orders, 2 jobs | 0 |

No Q402 card wallet appears on either rail. The whole registry logged only 7 `NewFeedback` events in the window.

---

## What this means for Set and Earn reviewers

- **No campaign bump from the three.** Each ran within 8% of its late-September pace. TermiX ran 27% above, but it registers in one-day bursts in both months (3,051 on Sep 14, 415 on Oct 3).
- **The week-one hire numbers stand.** No agent or owner from the three appears in a week-one hire, including the 221 on testnet.
- **The rules filter on hires.** An agent must be "listed on a shortlisted marketplace" with "at least 3 completed hires from 3 distinct wallets that are not yours and not funded by yours". Registration alone meets neither.
- **Exchange funding needs a group check.** EvoEvo's chains fit "wallets sharing a common funding source", yet their seeds and refills come from shared exchange hot wallets. If wallets like these start hiring, only a group-level check links them.

---

## What the chain can't show

- **Chains.** We see seeds and refills, not who withdrew or how many operators there are. Chains through a non-registering wallet split into separate trees, so lengths are lower bounds.
- **Ave.ai's role, the gas sponsors.** Neither is visible.
- **Short trails.** First BNB only, 10.4 days back: 189 EvoEvo and 71 Ave.ai-card owners were active earlier and aren't traced. Hires were matched on two rails.

---

*Data pulled Oct 6, 2026, from keyless RPCs (rpc.sentio.xyz, BSC and Base); September is blocks 119,243,646–125,000,754. The overlap with our week-one pull matched log for log, 60 of 60 re-derived funding results matched, and every cited transaction was re-read. Program pages were fetched Oct 6. Counts are addresses, not people. Registering agents in bulk isn't wrongdoing, and nothing here is a verdict on any program or wallet.*

*Disclosure: ChainWard has an open BNB Chain Builder Grant application (submitted Oct 3), sent BNB Chain a paid Set and Earn verification offer through its contact form on Oct 5 (no reply as of Oct 6), sells a $0.10 BSC hire check, published the week-one decode and runs the free [Set and Earn board](https://chainward.ai/set-and-earn).*
