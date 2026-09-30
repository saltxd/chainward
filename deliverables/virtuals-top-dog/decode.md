---
title: "Virtuals' Agent Commerce Earned $345,197 in March. In September: $5.48"
subtitle: "VIRTUAL is still the #2 AI-agent token. On-chain, the agent-to-agent marketplace behind its headline numbers ran on one month of deposits and six weeks of incentives, then went quiet."
date: "2026-09-30"
slug: "virtuals-top-dog"
seoTitle: "Virtuals Protocol On-Chain in 2026: ACP Fees, Revenue Network Payouts and Launchpad Activity"
---

# Virtuals' Agent Commerce Earned $345,197 in March. In September: $5.48

Virtuals Protocol was the name in crypto AI agents. Its token peaked at $5.07 on January 1, 2025, and its public numbers are still the biggest in the sector: 18,000+ agents, $470M+ of "agentic GDP" (aGDP), $3M+ earned by agents, and a Revenue Network paying agents up to $1M a month.

VIRTUAL is still the #2 AI-agent token by market cap: **$538M** on September 29, 2026, behind Venice. We read the contracts behind the agent numbers instead. **The fee that Virtuals' Agent Commerce Protocol (ACP) pays the platform on every job came to $345,197 in March 2026. In September it came to $5.48.** The replacement protocol, ACP v2, has taken in about **$2,660** of stablecoin across four chains in six months.

The headline numbers are mostly real as Virtuals defines them. What the chain adds is when they happened: most of the money arrived in one month, and most of the fees in six weeks of incentives.

---

## How ACP makes money

ACP is Virtuals' marketplace where agents hire other agents: a buyer escrows a payment, the seller does the job, the contract pays the seller and takes a platform fee. On Base it runs through three contracts: the original ACP contract (`0x6a1FE26D…`, live May 2025), and a Router (`0xa6C9BA86…`) and PaymentManager (`0xEF4364Fe…`) added in October 2025.

The platform fee goes to a Virtuals treasury wallet. Its inflows are the cleanest measure of paid agent work on the protocol, because every settled job pays it.

| Month | Jobs created | Money in (≈ USD) | Platform fee |
|---|---:|---:|---:|
| Aug 2025 | 28,280 | $92K | $23.7K |
| Oct 2025 | 75,730 | $37.8M | $9.7K |
| **Nov 2025** | 340,856 | **$349.8M** | $79K |
| Dec 2025 | 701,609 | $65.1M | $320K |
| Jan 2026 | 634,146 | $1.12M | $119K |
| Feb 2026 | **819,587** | $7.17M | $315K |
| **Mar 2026** | 814,185 | $2.20M | **$345.2K** |
| Apr 2026 | 214,091 | $302K | $4.9K |
| May 2026 | 26,270 | $377K | $28 |
| Jun 2026 | 5,810 | $4.8K | $0.51 |
| Jul 2026 | 4,946 | $499 | $0.93 |
| Aug 2026 | 6,594 | $18 | $3.46 |
| **Sep 2026** (to the 29th) | 6,918 | **$50** | **$5.48** |
| **Lifetime** | **3,729,274** | **≈$464M** | **≈$1.24M** |

"Money in" counts every deposit into the ACP contracts from outside them, in USDC and in VIRTUAL (ACP settled jobs in VIRTUAL until August 2025; those are priced at a monthly average and are estimates). A deposit can be withdrawn and deposited again, so this is throughput, not revenue.

> **aGDP** is Virtuals' own metric for the value moving through agent jobs. Its API reports $481.36M lifetime. Our on-chain total for money in, ≈$464M, is the same order of magnitude; the two are defined differently and are not expected to match.

---

## November 2025: three quarters of all the money

**November 2025 alone brought in about $350M, roughly 75% of everything that ever went into ACP v1.** Most of it passed straight through: $250M entered the Router from 5,512 wallets and left it the same month, to the agents that execute trades for their users. The largest single sender into the original ACP contract was one trading agent's wallet: $38.4M in 41,992 transfers.

That is capital moving through trading agents, not fees. The platform took $79K of it.

## February–March 2026: six weeks of incentives

Fees peaked later, in the only stretch where Virtuals paid agents to sell.

- **On Feb 12 and 13, 2026, the fee split changed on-chain.** The platform's cut went from 40% to 20% and moved to a new treasury wallet (`0xE968…`): tx [`0x8ee4a1c3…`](https://base.blockscout.com/tx/0x8ee4a1c32335be59778aba32b878abc0ca58dc7cb9c0e45d1dbe6de0127e2458) on the original contract and [`0xca1e1b4a…`](https://base.blockscout.com/tx/0xca1e1b4a4e58d3f9779685d53124fce6a75e32266e93dc7e3312e30ed43c263e) on the PaymentManager. (Our earlier decodes describe an 80/20 split; that is only true from these dates.)
- **The Revenue Network ran five weekly epochs, Feb 11 to Mar 23, and paid $1,022,634.** Half was USDC ($511,317, matched on-chain to the cent) and half VIRTUAL used to buy each winning agent's token. The top 10 agents took 63–86% of each epoch. Virtuals' API lists no epochs after March 23.
- **The prize pools exceeded the platform's fee in every epoch.** Over the same weeks the new treasury wallet's balance grew to about $616K, while the program paid $1.02M.
- **Virtuals flagged farming itself.** On Feb 23 it wrote that the first epoch "surfaced… actors attempting to game the system through artificial service activity, self-directed flows, pricing distortions, and other farming behavior," and introduced an Agent Score to make it harder.

Fees held at $315K–$345K a month through the program. **In April, the first month without it, they fell 98.6%, to $4,935. By May they were $28.**

## ACP v2: about $2,660 in six months

Virtuals rebuilt ACP from scratch in April 2026 as the reference implementation of ERC-8183, and deployed it on four chains:

| Chain | Live since | Jobs | Stablecoin in |
|---|---|---:|---:|
| Base | Apr 8, 2026 | 81,280 | $2,526.72 |
| Robinhood Chain | Jun 27, 2026 | 112 | $131.29 |
| Arc (Circle) | Sep 21, 2026 | 143 | $0.02 |
| Solana | Jul 16, 2026 | 149 | ≈$3 (estimate) |

The median Base payment is $0.01. **$1,618 of Base's $2,527 (64%) is two wallets paying each other** between June and August. The v2 treasury has collected about $109 in fees across all four chains. We found no ACP contracts on BNB Chain, Arbitrum, Ethereum, Optimism or Polygon.

## The launchpad: thousands of launches, few trades

Virtuals' launchpad still creates thousands of agent tokens a month, and its counts are real: on-chain launch events match the API within 1% for every week we checked. What the counts don't show is how few ever trade.

- **The March burst.** In one week (Mar 18–25), 15,484 tokens launched on Base, and 15,482 of them were tokens for registered ACP agents. It overlapped the last Revenue Network epoch, whose VIRTUAL half was paid by buying agents' tokens. **In a random sample of 150, three ever traded.**
- **Robinhood Chain.** Virtuals launched there in July: 25,833 tokens by Sep 29. About 64.5% never traded after launch, and **92 (0.36%) graduated** to a trading pool. Trading peaked at about $20.1M on July 15 and averaged about $0.89M a day in the last week of September.
- **Base, newer launches.** Of 20,145 tokens from the current launch contract, 26% have more than one holder. For September launches it is 5.3%.
- **One creator wallet** accounts for about 45% of the newer launches on both Base and Robinhood Chain. We haven't named it: the chain shows the pattern, not who is behind it or why.

## Where Virtuals still earns

The protocol is not without income. DefiLlama, a third-party tracker, puts Virtuals' protocol fees at about **$566K for September 2026**, mostly from trading on agent tokens. That is about 3% of its January 2025 peak month ($16.59M). The top 100 agent tokens traded about $5.6M on September 29, and **60% of that was one token**, Ribbita.

## Claims against the chain

| Claim | What the chain and API show |
|---|---|
| "$470M+ aGDP" | Reproduces as Virtuals defines it: API $481M, on-chain money in ≈$464M. About 75% arrived in November 2025. |
| "18,000+ agents" | The ACP registry lists 44,052 agents. 2,470 have ever had a job; 151 have earned more than $1,000 (API). |
| "$3M+ agent revenue" | API: $4.08M. The on-chain fee mechanics imply about $3.4M for agents, about two-thirds of it from Feb 12 to Apr 30, 2026 (derived, not reconciled). |
| "Up to $1M/month Revenue Network" | $1.02M paid across five weekly epochs, Feb 11 – Mar 23, 2026; none since in the API. |

## What to take from it

Virtuals built the rails first and still has the second-biggest token in the category. But on-chain, paid agent-to-agent work on those rails came in two bursts: capital moving through trading agents in November 2025, and fees during six weeks of incentives in February and March 2026. When the incentives stopped, so did the fees. If you are buying an agent token because of the protocol's usage numbers, check which month they come from.

---

*Verified September 29–30, 2026. Contract flows on Base were read with full transfer scans and archive balance reads via an Alchemy archive RPC and Base's public RPC; ChainWard's own node was not used for these figures. The March fee ($345,196.56) is the treasury's USDC balance growth ($306,552.69) plus its March outflows ($38,643.87), and matches the full transfer scan. Robinhood Chain, Arc and Solana were read from their public RPCs; the Solana figure is an estimate. Revenue Network epochs and the agent registry come from Virtuals' APIs, and the USDC half of the payouts was matched on-chain. VIRTUAL amounts are priced at monthly averages and are estimates. Market data: CoinGecko (Sep 29); protocol fees: DefiLlama (third party). Counts are wallets and tokens, not people. The chain shows where money moved, not why. Nothing here is a verdict on any agent or on Virtuals.*

> Disclosure: ChainWard has run an ACP seller agent and tested it with its own buyer agent (one $10 job plus internal test jobs). Those jobs are inside the totals above and don't affect them.
