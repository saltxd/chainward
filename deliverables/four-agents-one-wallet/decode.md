---
title: "Four Virtuals Agents, One Wallet, 77 Seconds Apart"
subtitle: "One wallet made four Virtuals agents in 77 seconds. All four were top-20 earners, and most of their buyers are the same 1,100 wallets."
plain: "Virtuals lists four separate agents with 5,076 buyers. Its records show one wallet made all four in 77 seconds and received about $200,900. Most buyers are the same 1,100 wallets, often paying identical amounts. That crowd also hires another owner's agents, so it doesn't prove this owner runs it. Read the four as one operator."
date: "2026-10-29"
slug: "four-agents-one-wallet"
seoTitle: "Four Virtuals ACP Agents, One Owner: Synapse, AutoForge, MechaMind, RoboSphere Share One Wallet and One Crowd (Base, 2026)"
---

# Four Virtuals Agents, One Wallet, 77 Seconds Apart

Virtuals' agent directory lists these as four separate businesses:

| Agent | ACP ID | Token | Created (UTC) |
|---|---|---|---|
| Synapse Robotics Network | 18347 | SYNRO | 2026-03-04 16:19:12 |
| AutoForge AI | 18348 | AFORGE | 2026-03-04 16:19:40 |
| MechaMind Protocol | 18349 | MECHA | 2026-03-04 16:20:03 |
| RoboSphere Network | 18350 | ROBO | 2026-03-04 16:20:29 |

Four names, four tokens, four dashboards. The four registrations are 77 seconds apart end to end (ACP API `createdAt`), and Virtuals' March token catalog records the same `walletAddress` and the same `creatorId` (577527) minting all four tokens 71.6 seconds apart. All four carry the same owner address, `0x476fff09a555c223e98c1e8571676fcca7af9849` (ACP API `ownerAddress`; filtering the agent list by that owner returns exactly these four and no others). All four are tagged to the same Virtuals cohort, `OPENCLAW`. All four sell a near-identical menu (ACP API `offerings`). All four report their last activity in the same second, around 2026-03-26 05:00 UTC, and have been quiet since.

We read every USDC transfer in or out of the four agent wallets across their active life, from a keyless archive RPC, re-derived the current balances from a public node, and pulled every buyer leaderboard the four posted in Virtuals' Revenue Network from Virtuals' public API. Here is what one operator's four agents did.

## The short answer

- **The money is real and it settled on Base.** Across the four wallets, **$255,560.94** of USDC came in over their active life, **$218,588.10** of it through Virtuals' own PaymentManager, the contract that releases ACP job payments. That figure equals each agent's reported buyer spend times 80%, to the cent (Virtuals keeps a 20% fee). What settled on-chain and what the leaderboards report are the same money.
- **These were not mid-size agents.** Sorted by lifetime revenue, the four rank #16, #17, #18 and #20 of every ACP agent with revenue above zero (2026-09-29 snapshot). In Virtuals' Revenue Network they placed 5th to 11th among the 444 to 546 agents Virtuals paid each week, and took 15.6% to 24.4% of the weekly prize pool.
- **About a seventh of the inflow is prize money, not buyer payments.** $36,972.84 (14.5%) came from Virtuals' Revenue Network prize distributor, and equals the four agents' epoch 3 to 5 seller prize shares to the cent.
- **One wallet collected the bulk.** **$200,864.85** (78.6% of all outflow) flowed from the four agents to the single owner address `0x476fff...9849`. The other 21.4% went back out as the four agents' own ACP job payments.
- **The 5,076 "unique buyers" are really about 1,150 wallets.** The four leaderboards list 4,552 buyer entries, but those are only **1,152 distinct wallets**, each counted about four times. **1,101 of them paid all four agents**, carrying 99.45% of all buyer spend, and in each epoch most paid the identical amount at all four. The dashboards' 5,076 is higher still, because Synapse's dashboard also counts about 900 buyers who appear on no leaderboard.
- **What the chain does not show:** we could not establish who funds that crowd, and the overlap by itself does not prove the crowd belongs to the owner (see "Whose crowd is it").

## One wallet, four agents

The four wallets are the standard Virtuals ACP smart account, an 81-byte proxy. Each agent has its own token, each an off-the-shelf Virtuals launch ("... by Virtuals", 1,000,000,000 supply, 18 decimals, unchanged, public-node `totalSupply` as of Base block ~53.23M, 2026-10-28). What is unusual is not any one token. It is that one wallet minted four of them in a minute and a quarter and attached a near-identical service to each.

The operator evidence is specific:

- the four share one `ownerAddress`, and that owner filter returns exactly these four,
- Virtuals' token catalog shows the same creating `walletAddress` and the same `creatorId` on all four tokens, 71.6 seconds apart,
- all four report their last activity inside the same 24-millisecond window on 2026-03-26,
- and the earnings of all four drain to one address.

The owner, `0x476fff...9849`, is a plain EOA (no contract code), with 402 outgoing transactions, holding **$16.32 USDC** and 0.0003 ETH today. It is a user wallet, not a Virtuals platform contract.

## How the money moved

Pull the ledger apart and every one of the four reads the same shape.

| Agent | USDC in | via PaymentManager | via prize drop `0xd4d1…8275` | to owner `0x476f…9849` | to ACP router `0xa6c9…9df0` |
|---|---|---|---|---|---|
| Synapse | $64,054.60 | $54,700.04 | $9,354.56 | $52,054.56 | $11,998.84 |
| AutoForge | $61,875.09 | $53,820.01 | $8,055.08 | $50,035.09 | $11,838.70 |
| MechaMind | $63,682.24 | $54,424.01 | $9,258.23 | $48,834.23 | $14,846.81 |
| RoboSphere | $65,949.01 | $55,644.04 | $10,304.97 | $49,940.97 | $16,006.64 |
| **Total** | **$255,560.94** | **$218,588.10** | **$36,972.84** | **$200,864.85** | **$54,690.99** |

Each wallet's inflow equals its outflow to the cent. The columns above are the two inbound legs and the two large outbound legs; a third, tiny outbound leg of $5.10 total (about $1.20 to $1.40 each) went back to PaymentManager, which closes the per-wallet balance to zero inside the window.

**The inflow is buyer payments plus prize money.** The large share, about $54K each, is Virtuals' PaymentManager releasing ACP job payments; a representative settlement is tx [`0x3296142323ef5fce90bec4533e8f0dc0f1a2df49385402d03034aedc0799a6a7`](https://basescan.org/tx/0x3296142323ef5fce90bec4533e8f0dc0f1a2df49385402d03034aedc0799a6a7) (block 42,950,811), a $25 job that paid Synapse $20.00 and the Virtuals treasury $5.00 in one transaction, the 80/20 split that explains the exact ratio above. The smaller share, about $9K each, is not buyer money at all: it comes from `0xd4d1e8f000bce71b2fe89d59989fcd2cd5128275`, Virtuals' Revenue Network USDC prize drop (see below).

**The outflow is a sweep plus the agents' own job payments.** The bulk, about $50K per agent, goes to the owner `0x476fff...9849`. The remainder, $11.8K to $16.0K per agent, goes to `0xa6C9BA866992cfD7fd6460ba912bfa405adA9df0`, the shared Virtuals ACP router that every v2 agent lists as its `contractAddress`. A transfer into that router is a buyer escrowing a job payment, so across their life the four agents were themselves buyers of about $54.7K of ACP jobs, from providers we did not trace.

An operator sweeping its agents' earnings to its own wallet is ordinary. What the chain shows here is that four "agents" are one such operation, run four times in parallel.

## The prize money

The $36,972.84 that arrived from `0xd4d1…8275` is the most easily misread leg, so it is worth being exact. That contract is Virtuals' Revenue Network USDC prize distributor, which ChainWard's earlier [Virtuals Revenue Network decode](/decodes/virtuals-top-dog) already identified and traced. The four agents' receipts from it equal their epoch 3, 4 and 5 seller prize shares to the cent. In the epoch rankings the four held ranks 8/9/10/11 (epoch 3), 5/6/9/11 (epoch 4) and 5/9/10/11 (epoch 5) among the 546, 463 and 444 agents Virtuals paid in those epochs, and together took 21.1%, 24.4% and 15.6% of the weekly pool. They were created mid-way through epoch 3, earned across epochs 3 to 5, and went quiet right after the last epoch closed.

So one wallet did not just run four agents. It ran four agents that each finished in the top 11 of the whole program, four times at once, and collected four prize shares.

## The buyers are one crowd, not four

The headline the dashboards offer is four agents with 2,053 / 1,007 / 999 / 1,017 "unique buyers," 5,076 in all. That total is what an ecosystem would read as its demand. It does not survive contact with the leaderboards that produced it.

Virtuals' Revenue Network publishes, per agent per epoch, the full list of paying buyer wallets and what each spent. We pulled all twelve lists (four agents, epochs 3 to 5). On every one, the buyers' spend sums to the agent's reported revenue to the cent, and per agent across the three epochs, 80% of that spend equals the PaymentManager USDC on-chain, so these are the complete, settled buyer lists. Pooled, the four lists' 4,552 entries are only **1,152 distinct wallets**.

- **1,101 of the 1,152 paid all four agents**, and account for **99.45%** of all buyer spend. Only two wallets paid just one of the four.
- Every pairwise overlap between the four is 97% to 98% (Jaccard). For each agent, 99.8% to 100% of its buyers also paid at least one sibling.
- Counting this one crowd once per agent gives 4,552 buyer entries for 1,152 wallets. The dashboards' 5,076 is higher because Synapse's dashboard adds about 900 buyers who sit on no leaderboard.

And the crowd does not behave like independent customers. In epoch 3, 682 of the 741 wallets that paid all four (92%) paid the identical amount, $25, at all four agents. In epoch 4, 493 of 594 (83%) paid identical $45. In epoch 5, 841 of 1,100 (76.5%) paid identical $10. For every wallet on all four boards in every epoch, Virtuals' own `buyerScore` is the same fraction of its spend at all four agents, one per-wallet weight applied at each. The spend is flat, not whale-driven: no single buyer is more than about 0.5% of an agent's take, and the top ten are under 2% over their lifetime. A crowd that pays four different "businesses" the same amount in the same week, and returns the next week to do it again (essentially every epoch-3 and epoch-4 buyer came back in epoch 5), is one crowd moving in lockstep across four agents.

## Whose crowd is it

The obvious next thought is that the owner runs the crowd. The data does not show that, and the controls mean the overlap alone cannot.

We checked the same wallets against the other top agents of epoch 5. The crowd is not unique to these four: 299 of the top 300 buyers of Capminal (the epoch's #1 agent) and 99 of the top 100 of Captain Dackie (#4) are the same wallets, and those two agents belong to a different owner. Eight other top-15 agents share none of this crowd (for several we checked only their top 100 buyers), and four of those, owned by four different owners, draw a separate shared crowd of about 200 wallets. A single lockstep crowd buying across agents of more than one owner is a recurring shape on the board, not a fingerprint of this operator.

None of the owner's known wallets, the prize-drop funder, the four agent wallets, or the platform contracts appears anywhere in the 1,152 buyers, so there is no direct self-purchase from those addresses. Whether the buyer wallets are themselves funded or controlled by the owner is untested here. What the leaderboards establish is that the demand behind these four dashboards is one crowd, shared with other operators, that pays in lockstep. Who funds or directs that crowd is not on these leaderboards. The one-owner fact rests on the shared owner address, which is enough on its own.

## What the chain shows that the dashboard does not

Read as four rows on a leaderboard, this is four separate top-20 agents with about 5,000 buyers between them. Read on-chain and on the leaderboards, it is one wallet that stood up four agents in 77 seconds, whose agents each finished in the top 11 of a prize program, swept about $200.9K into itself, and drew on one shared crowd of roughly 1,150 wallets that the four dashboards count about four times over. The directory counts agents. It does not count operators, and it does not dedupe buyers across an operator's agents. Here the agents-to-operator ratio is four to one, and the buyer count is inflated about four-fold.

For someone deciding whether to hire or trust a Virtuals agent on its numbers, that is the point. "This agent took in $68K from about a thousand buyers" reads very differently once you know it is one of four siblings from one wallet, that a seventh of the money was prize winnings, and that its thousand buyers are mostly the same wallets that paid its three siblings the identical amount the same week.

## What we could not verify

- **Who funds the crowd.** The 1,152 buyer wallets pay in lockstep, but we did not trace where their money comes from. That is the question that would separate a farmed crowd from an unusual but real one, and it needs a funding trace of the buyer wallets, not these leaderboards.
- **The extra Synapse buyers.** Synapse's dashboard reports 2,053 lifetime buyers against 1,139 on its epoch-5 leaderboard; roughly 900 buyers it counts left no PaymentManager payment and sit on no leaderboard. We do not know who they are.
- **What the agents actually do.** The service is off-chain. The chain shows the payments, not the product.
- **The buyer wallets' nature and the job content.** We did not determine whether the buyers are EOAs or contracts, when each job ran, or what was bought.

## Limits

- **Window.** All flow figures cover Base blocks 42,896,527 to 43,890,127 (2026-03-04 to 2026-03-27 UTC), which contains the four agents' entire active life per the ACP API's `lastActiveAt` (~2026-03-26). Inside the window each wallet's inflow equals its outflow to the cent. The four currently hold $39.74 / $8.94 / $8.71 / $10.47 (about $67.86 combined), which arrived outside this window from a source we did not trace; it does not affect the flow totals above.
- **Dashboard and leaderboard figures are the platform's.** Revenue, job counts, buyer counts, ranks and prize shares are Virtuals' own fields; we cross-checked revenue against PaymentManager inflow and buyer spend against both, and recomputed the overlap ourselves.
- **This is one owner's four agents, not a claim about OPENCLAW.** The cohort is large and mostly inactive; these four are one operator within it.
- **No accusation.** Running several agents from one wallet is common on Virtuals; the cohort holds other owners with 2, 4, 5, 9 and 19 agents. The finding is that the four present as separate and resolve, on-chain and on the leaderboards, to one operation drawing one shared crowd. Readers should weigh the metrics accordingly.

## Method and sources

- **Base flows:** every USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`) `Transfer` log with any of the four agent wallets as sender or recipient, blocks 42,896,527 to 43,890,127, read from a keyless archive gateway in 1,000-block pages; the prize distributor `0xd4d1e8f0…` was swept the same way (one funder, 227 payees, $217,324.20, of which the four agents took 17%). Totals reconcile: each wallet's inflow equals its outflow. The sweep logged no failed batches.
- **Buyers:** all twelve Revenue Network buyer leaderboards (`api.virtuals.io/.../agdp-leaderboard-epochs/{3,4,5}/estimated-rewards-distribution`, agents 18347 to 18350), every page, ranks contiguous, no duplicate wallets. On all twelve the buyer spend equals the ranking's reported revenue, and per agent across the three epochs, 80% of that spend equals the PaymentManager USDC on-chain. Overlap and lockstep figures were recomputed with an independent set-arithmetic script. Buyer wallet addresses are third-party data and are not published.
- **Current state:** `eth_getCode`, `eth_getBalance`, USDC `balanceOf`, token `totalSupply`/`symbol`, and `eth_getTransactionCount` from a public Base node, as of block ~53.23M (2026-10-28). The four wallets' live balances match the ACP API `walletBalance` field.
- **Agent and ranking metadata:** Virtuals ACP API `agents/{id}/details`, the cluster/owner filters, the March token catalog, and the Revenue Network epoch rankings and prize pools, cross-checked against ChainWard's saved September snapshot and its published [Virtuals Revenue Network decode](/decodes/virtuals-top-dog).
- **No ChainWard production RPC key was used.** Archive reads were paced; the Virtuals API was queried read-only at under two requests per second; the sentinel node was not relied on for these March flows.

> Disclosure: ChainWard operates its own agent on Virtuals' ACP and appears in Virtuals' ACP agent listings. It has no connection to these four agents or their owner, none of the ChainWard wallets we checked appears in the data above, and it sells wallet and counterparty checks on chainward.ai. Corrections are welcome at hello@chainward.ai.
