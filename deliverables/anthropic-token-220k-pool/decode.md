---
title: "A Token Named 'Anthropic' Showed $55.7M of Volume. One Wallet Was Behind 99.99% of It."
subtitle: "Trackers showed $10.3M of liquidity and $55.7M of volume. The real USDC was $220k, the operator's own, and it was withdrawn on Nov 1."
plain: "If you are about to buy a token because its chart shows millions in volume, read this first. On this Base token, one wallet was the trader on 99.99% of the volume, the real cashable USDC was about $220k and it belonged to the operator, and it was withdrawn on Nov 1. Outside buyers put in about $850."
date: "2026-11-01"
slug: "anthropic-token-220k-pool"
seoTitle: "Anthropic Token on Base, Nov 1 2026: $10.3M Quoted Liquidity, $220k Real, 99.99% Wash Volume, Pulled On-Chain"
---

# A Token Named "Anthropic" Showed $55.7M of Volume. One Wallet Was Behind 99.99% of It.

On Nov 1, 2026, a token called "Anthropic" was trending on Base. Price trackers showed it with $10.3M of liquidity and $55.7M of trading in a day. We read the pool and the wallets around it. At 11:56 UTC the liquidity was withdrawn.

This is what the chain shows. All times are UTC. The token is `0xf7b9cf4dab32ce42f1e08c05f561ccc0e7b44cea` ("Anthropic", 100,000,000,000 supply). It has no shown connection to the company of the same name; its only web presence is a Clanker launch page.

Short version:

- **The quoted liquidity was mostly the token priced against itself.** A tracker's "$10.3M" was about 99 billion of the token's own supply valued at its own price, plus roughly $220k of real USDC. The real, cashable asset in the pool was the $220k.
- **One wallet was the trader on 99.99% of the volume.** Of $56,976,749 of swaps we read across the pool's life, `0x969f5efc…77a9` was the counterparty on $56,972,290 of it. Outside wallets accounted for $1,543 (0.0027%).
- **The $220k that was withdrawn was the operator's own money.** The same wallet that pulled the USDC, `0x017c6044…2095d`, had deposited that same $220,000.01 as liquidity the day before. It was not taken from buyers.
- **Real outside buyers put in about $850.** Across the token's life, non-operator wallets paid a net of roughly $850 to $890 of USDC into the pool. They hold tokens that now have no pool behind them.
- **It is one of 20.** The same launch wallet created 20 Clanker tokens, reusing a few names: six called "Anthropic," three called "Claude," nine "Papertrade." At least five, including this one, ran the same pool-and-withdraw cycle; the rest sit dormant with the supply parked.

---

## How the pool was built

The token was launched on 2026-10-28 08:25:17 (block 53,193,285) through the Clanker v4 factory `0xe85a59c6…83a9`, by the wallet `0xa83b4fca…5f92` (tx [`0x6d5a76d1…a6a7a`](https://base.blockscout.com/tx/0x6d5a76d1e0e9ff1d39e84a8ac8365770290f6715a26daad4310c1fa7a03a6a7a)). Clanker put the 100,000,000,000 supply into a Uniswap v4 pool. Three minutes later, at 08:28:43 (block 53,193,388), the full supply was withdrawn from that v4 pool back to the launch wallet (the Uniswap v4 PoolManager `0x498581ff…2b2b` transferred all 100B to `0xa83b…5f92`). That is why the original launch pool shows no supply and no volume: the supply had been taken out of it.

The token then sat for three days. On 2026-10-31 12:42:35 (block 53,330,604) the launch wallet sent all 100B to `0x017c6044…2095d`. Two minutes later that wallet began building a **new** pool: an Aerodrome Slipstream (concentrated-liquidity) USDC/Anthropic pool, `0x95b81e69…8880`, first liquidity at 12:44:39 (block 53,330,666). Positions are held through the "Slipstream Position NFT v1" manager `0xe1f8cd9a…8b53`.

Two kinds of liquidity went in, from the two cluster wallets `0x017c6044` and `0x969f5efc` (the USDC entirely from `0x017c6044`):

| Side | What went in | Where (tick range) | Relative to market |
|---|---|---|---|
| Token | ~99B Anthropic | at and just below the trading tick (~368,230) | sell-side, at market |
| USDC | $220,000.01 in four deposits (30k + 100k + 80k + 10k) | ticks 529,621 to 552,648 | a bid far below market |

The USDC was not placed where buyers and sellers trade. In this pool, higher ticks mean a far lower price per token, so the $220k sat as a standing bid roughly seven orders of magnitude below the trading price. It props up a tracker's liquidity figure but is not support a seller can reach at market. The $220,000.01 of USDC itself reached `0x017c6044` the day before the pull, from `0xaa41f85e…36a1` (block 53,330,476, 2026-10-31 12:38 UTC), minutes before the first deposit.

> **Quoted vs real liquidity.** Trackers report a pool's "liquidity" as the dollar value of both sides at the current price. When one side is 99% of a token's own supply priced by itself, that figure is mostly circular. The number that matters to a seller is the real quote asset, here the USDC. Tracker: $10,292,746. Real USDC: ~$220,000.

## The volume was one wallet

At our check on 2026-11-01 05:38:57 (block 53,361,095), the pool held 98,999,852,217 Anthropic (98.9999% of supply) and $220,035.72 USDC, while GeckoTerminal showed $10,292,746 of liquidity, $55,740,915 of 24-hour volume and a $10.18M valuation.

We read every swap on the pool from its first block to the withdrawal: 3,704 swaps, $56,976,749 of gross volume (our window runs about 23 hours, slightly wider than the tracker's 24-hour snapshot, which is why it is a touch higher than $55.7M). Of that:

| Trader side | Gross USDC volume | Share |
|---|---:|---:|
| `0x969f5efc…77a9` (one wallet) | $56,972,290 | 99.99% |
| Other cluster wallet (`0x017c6044`) | $2,873 | 0.0050% |
| Outside wallets | $1,543 | 0.0027% |

`0x969f5efc` received 89B of the token supply directly from `0x017c6044` (block 53,330,620), deposited much of the token-side liquidity itself, and moved tokens and USDC back and forth with `0x017c6044` throughout the setup. It was the counterparty on essentially every swap: it bought and it sold, against liquidity its own cluster had provided. The pool's USDC balance barely moved the whole time (from $220,035.72 at 05:39 to $220,000.01 just before the withdrawal), which is what self-contained trading looks like: money going in one side comes back out the other, and the headline volume climbs without net capital arriving.

## Who actually put money in

Stripping out the cluster, outside wallets were on $1,543 of the $56.98M. Measured two ways, their net USDC into the pool was small:

- By end-user (transaction sender), excluding the shared router: net **$887** paid in.
- By recipient (treating routers as pass-through to the buyer): net **$849** paid in.

So on the order of **$850 to $900** of real outside money entered this pool over its life, from a few dozen wallets, most of it in buys under $50. Those buyers hold tokens that, after the withdrawal below, have no pool liquidity behind them.

## The withdrawal

At 11:56 UTC on 2026-11-01, three transactions, all sent by `0x017c6044`, emptied the pool:

| Time | Block | Removed | Tx |
|---|---|---|---|
| 11:56:29 | 53,372,421 | 89,999,941,629 Anthropic | [`0xabdab1f9…6179`](https://base.blockscout.com/tx/0xabdab1f958150afc18c5f2f917a9eb542fb7345083e442d1df49d37a2cbf6179) |
| 11:56:41 | 53,372,427 | 9,000,000,000 Anthropic | [`0xeb2018cb…13a0`](https://base.blockscout.com/tx/0xeb2018cb61953898e049f24d7439f95d58d92e759c4216a8da8e13b0f33d13a0) |
| 11:56:53 | 53,372,433 | $220,000.01 USDC | [`0xc733c04f…e2aa`](https://base.blockscout.com/tx/0xc733c04fe93866ad5a7aa8e7018a07aba11db9f1ee16387d61c7663c7778e2aa) |

The pool now holds about $0.0019 of USDC and no tokens. Thirty seconds later (block 53,372,451) the ~99B tokens were consolidated into `0x0efb3ae3…7793`, which holds 99,989,771,542 Anthropic today, 99.9898% of the supply. The $220,000.01 of USDC was sent onward from `0x017c6044`, mostly to `0xb0f8d3d5…c01e` (~$220k) and back and forth with `0x969f5efc` (~$281k).

## Whose money was it

This is worth stating plainly, because the natural headline ("$220k pulled") can overstate it. The $220,000.01 of USDC that was withdrawn is the same $220,000.01 that `0x017c6044` had added to the pool as liquidity the day before. On-chain, the same wallet put the USDC in and took it back out. It was not buyers' money sitting in the pool.

The money outside buyers lost is the ~$850 to $900 they paid for tokens, which they still hold and which now have no pool to sell into. The $55.7M of volume and the $10.3M of liquidity were the bait; before the withdrawal, very little real money had bitten.

## Not just this token

The launch wallet `0xa83b…5f92` created **20 Clanker tokens** (read from the factory's creation events). The names repeat:

| Name on the token | Count |
|---|---:|
| Anthropic | 6 |
| Papertrade / Paper | 9 |
| Claude | 3 |
| 小小徐 | 2 |

Fourteen of the 20 are dormant: the full supply still sits in the launch wallet, never pooled. The other six were activated. Five, including the token in this report, had their supply end up in the same consolidation wallet `0x0efb3ae3…7793` (99.99% to 100% today), the signature of liquidity having been added and then removed.

We traced a second one in full to confirm it is the same playbook. The other "Anthropic," `0xf2166d39…f7c9` (launched 2026-10-28, handed to `0x017c6044` on 2026-10-29 at block 53,242,281), was moved by the same `0x017c6044` into its own Aerodrome USDC pool `0x1d726fbde0…11c9`, traded by the same `0x969f5efc`, and consolidated into the same `0x0efb3ae3`. That pool holds $6.74 and 3 million dust tokens today: drained. The three "Claude" tokens were launched on Nov 1 but are still dormant.

## What to check before you buy a token like this

- **Compare quoted liquidity to the real quote asset.** If a pool's "liquidity" is mostly the token's own supply, the number you can actually sell into is the USDC or ETH on the other side. Here that was ~$220k against a quoted $10.3M.
- **Look at who is trading.** Volume made by one wallet buying and selling against its own liquidity is not demand. Here one wallet was the counterparty on 99.99% of it.
- **A concentrated-liquidity pool can park its stablecoins far from the price.** Deep "liquidity" that sits well away from the market is not support you can hit.
- **Check every character of any address.** Look-alike addresses were sending dust around these wallets during the event.

## Limits

- We did not determine who controls these wallets, and we do not name any person. "Operator" here means the set of wallets linked by direct transfers.
- The $220k seed reached `0x017c6044` from `0xaa41f85e…36a1`; we did not trace that source further, so we cannot say where that capital originally came from.
- Our volume window (pool creation to withdrawal, ~23h) is slightly wider than the tracker's 24-hour snapshot, so $56.98M and $55.7M are the same event measured over slightly different windows.
- The outside-buyer figure (~$850 to $900) counts net USDC into the pool from non-operator wallets. Some outside trades route through shared aggregators; we treated those routers as pass-through to the end buyer.
- "Pulled" and "withdrawn" describe on-chain transfers. We make no claim about intent.
- GeckoTerminal figures (liquidity, 24h volume, valuation) are that tracker's, read at our 05:39 check; every other number here is from a block or transaction on Base.

## How we checked, and a second pass on the big numbers

Everything was read from public Base RPC (`base-rpc.publicnode.com`): the pool's Mint, Burn and Swap logs, token transfers, and balances at specific blocks. Three headline numbers, each re-derived a second way:

- **$220k seeded equals $220k withdrawn.** The four USDC deposits sum to $220,000.01 (Mint logs). The withdrawal Burn returned $220,000.01 (Burn log, block 53,372,433). The wallet was funded with $220,000.01 beforehand (USDC transfer, block 53,330,476). And the pool's own USDC balance read $220,035.72 at 05:39 and $220,000.01 just before the pull (`balanceOf`). Four independent reads, one figure.
- **99.99% of volume, one wallet.** Summing swaps by recipient, `0x969f5efc` was on $56,972,290 of $56,976,749. Counting any swap that touched an operator-cluster wallet, the share is 99.9973%. Both land at ~99.99%.
- **Outside money ~$850 to $900.** By transaction sender (router excluded): $887 net in. By recipient (router as pass-through): $849 net in. Two methods, same order of magnitude; the outside gross volume of $1,543 caps it.
