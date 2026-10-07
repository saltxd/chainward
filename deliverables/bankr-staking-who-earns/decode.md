---
title: "Bankr Staking: Who Earns the $100K"
subtitle: "Bankr funded 246M BNKR ($99.8K) of staking rewards. Its 2/3 fee Safe is the largest staker and earns about 13% of them."
date: "2026-10-06"
slug: "bankr-staking-who-earns"
seoTitle: "Bankr BNKR Staking On-Chain: Who Earns the $100K, Where the 28.85% APY Comes From, and Who the Largest Stakers Are"
---

# Bankr Staking: Who Earns the $100K

On Oct 6 at 04:52 UTC, @0xDeployer [posted](https://x.com/0xDeployer/status/2107333069611131281): "$100,000 paid to $BNKR stakers in two weeks. / 28.85% APY / 30% of Bankr's launch revenue buys $BNKR and pays it to stakers."

We read [BnkrStakingV3](https://base.blockscout.com/address/0x88470240ff0663faefa68b1d7621b472ddd9584a), the staking contract [Bankr's docs](https://docs.bankr.bot/features/staking/) list, on Base, from its deployment on Sep 26 to the end of Oct 6 UTC (block 52,270,926). Every number below is as of that block unless it carries its own date.

Short version:

- **The $100K is two weekly fundings.** Bankr's 1/3 fee Safe paid in 124.97M BNKR on Sep 29 and 121.01M on Oct 6: **$99,762** at each day's price. Together they pay Sep 29 to Oct 13. By the end of Oct 6, **$53.5K** had streamed to stakers and **$15.2K** had been claimed.
- **28.85% checks out.** When the post went up, staked BNKR earned **25.42%** a year. Restaked weekly, the assumption Bankr's own agent uses for its APY, that is **28.857%**.
- **The largest staker is Bankr's 2/3 fee Safe.** It staked 2.76B BNKR on Sep 28, before rewards began, and 528.7M more on Sep 30: 3.29B in all, **13.3% of all stake**, on the same terms as everyone else. It has earned **13.1%** of the rewards streamed so far, 18.0M BNKR (about $7.0K), and claimed none of it.
- **861 addresses stake.** The top 10 hold 45.6%. None of stakers 2 to 20 received BNKR from Bankr's Safes, fee wallet or operator since Sep 1.
- **The 30% matches September.** In Sep 1 to 28, the 1/3 Safe received 29.7% of Bankr's liquid fee receipts. It has been buying BNKR and still held **1.30B BNKR (about $506K)** at the end of Oct 6, almost 11 weeks of rewards at the current size.

---

## Bankr's 2/3 Safe is a staker

Two Safes collect Bankr's share of the hook fee on its newer launch pools: SafeA ([`0x0424…9b13`](https://base.blockscout.com/address/0x042455f9990098e11592be1fbd72e6dc68419b13)) gets one third and SafeB ([`0x5f8d…e508`](https://base.blockscout.com/address/0x5f8da8f88ec81e27f2e22fcb9ca5d926c595e508)) two thirds. We call them Bankr's because Bankr's own API lists them as its fee claimants at 33.33% and 66.66% ([September decode](/decodes/bankr-on-chain)). The staking contract also names them as its only two notifiers, the addresses that can call `notifyRewardAmount` (anyone can add rewards through `donate`), and SafeB as its pending owner. Bankr hasn't confirmed this to us.

SafeB staked twice, each time through a Safe batch signed by both owners: approve BNKR, then `stake(amount)`.

| UTC | BNKR staked | Value then | Where the BNKR came from |
|---|---:|---:|---|
| [Sep 28 00:03](https://base.blockscout.com/tx/0x12eb364a5ad1ad6c29b56ba7ac26773994dfe143a4f51c91e2964241a4552ed7) | 2,762.5M | $1.26M | SafeB's entire balance |
| [Sep 30 17:46](https://base.blockscout.com/tx/0xe65c028634f1adf0e423fac67d63166624a8f24bca14239fa89b26f1797b1ac0) | 528.7M | $214K | 410.1M from Bankr's fee wallet plus 118.6M from another account, received minutes before |

The deployer started handing ownership to SafeB at deployment; SafeB hadn't accepted by Oct 6. The owner can name notifiers and the pauser, but can't move staked or reward BNKR or stop claims and withdrawals.

> **How the rewards are split.** Each funding streams per second over 7 days. Rewards follow **weight**: a staked BNKR counts 1x on its first day and grows to 2x after 365 days. Unstaking takes a 48-hour cooldown, and cooling BNKR earns nothing.

## $100,000: funded, streamed, claimed

Both came from SafeA:

| Funding | BNKR | Value then | Scheduled end (UTC) |
|---|---:|---:|---|
| [Sep 29 06:32](https://base.blockscout.com/tx/0xc4bb37ac3e1bb17907d4f1fc8734f7b1a9dd28c3ec5d94941220355e2775c167) | 124,969,995 | $50,588 | Oct 6 06:32 |
| [Oct 6 03:31](https://base.blockscout.com/tx/0x619b93c061a4bf937067841d4082f0c0f187db3e29afc1bc34d6b74abbca8d59) | 121,013,016 | $49,174 | Oct 13 03:31 |
| **Total** | **245,983,011** | **$99,762** | |

Funded BNKR can only leave the contract as rewards: its rescue function refuses BNKR, and the contract isn't upgradeable.

At the end of Oct 6, priced at $0.000388 (the 246M BNKR is $95.5K at this price):

| | BNKR | USD |
|---|---:|---:|
| Streamed to stakers | 137.7M | $53.5K |
| Claimed: paid out to 206 addresses | 9.5M | $3.7K |
| Claimed: restaked by 328 addresses | 29.6M | $11.5K |
| Earned, not yet claimed | 98.6M | $38.3K |
| Still to stream, until Oct 13 | 108.2M | $42.0K |

"Two weeks" fits: the fundings are 6 days 21 hours apart and pay two 7-day periods. On Oct 6, the first period had all but finished and the second had just begun.

## Where 28.85% comes from

Stake and reward are both BNKR, so price doesn't matter. The rate is reward rate × 365 days ÷ total staked.

| Block, UTC | Total staked | Simple APR | Compounded weekly | New stake (1x) |
|---|---:|---:|---:|---:|
| 51,937,105, Sep 29 06:32 (funding 1) | 21.61B | 30.16% | 35.08% | 29.96% |
| **52,236,491, Oct 6 04:52 (the post)** | 25.29B | **25.42%** | **28.857%** | 24.82% |
| 52,270,926, Oct 6 23:59 | 24.73B | 25.99% | 29.60% | 25.39% |

The post went up 80 minutes after funding 2. @bankrbot [describes](https://x.com/bankrbot/status/2105676960995348634) its own APY as a "weekly restake assumption", so 28.85% checks out by Bankr's own method. A new stake starts at 1x weight, so it earns slightly less than the average.

The rate moves with stake. Over Oct 6 the weekly figure ran from 28.72% to 29.78%. The high came at 15:38 UTC, when one address queued all 763.5M of its BNKR to unstake.

## Who stakes

**861 addresses** held stake at the end of Oct 6, out of 897 that have staked. The legacy vault, withdraw-only since April, isn't counted.

| # | Address | BNKR staked | Share |
|---:|---|---:|---:|
| 1 | [`0x5f8d…e508`](https://base.blockscout.com/address/0x5f8da8f88ec81e27f2e22fcb9ca5d926c595e508) **SafeB, Bankr's 2/3 fee Safe** | 3,291.2M | 13.31% |
| 2 | [`0xe854…09c5`](https://base.blockscout.com/address/0xe85458669e58c9440c0045a034edf6d3110609c5) | 1,410.8M | 5.71% |
| 3 | [`0x2aa0…ed09`](https://base.blockscout.com/address/0x2aa0ecc698278f4d46e4c2390e9dd9a57511ed09) | 1,273.4M | 5.15% |
| 4 | [`0xac61…df31`](https://base.blockscout.com/address/0xac619976d2a369eabd0e61021dec86fc8291df31) | 1,205.6M | 4.88% |
| 5 | [`0x99ff…542e`](https://base.blockscout.com/address/0x99ffe5f4093f51d30ed6e78d859e31058da2542e) | 1,009.2M | 4.08% |
| 6 to 10 | five addresses | 3,076.3M | 12.44% |
| | **Top 10** | | **45.56%** |

- **Bankr-linked stakes.** SafeB holds 13.31%. SafeA, the fee wallet and the deployer don't stake.
- **The rest.** None of stakers 2 to 20 received BNKR from SafeA, SafeB, the fee wallet, the deployer or SafeA's operator between Sep 1 and Oct 6. Nine received no BNKR at all in that time, so they held it from before.

## Where the BNKR comes from

For the 30%: in Sep 1 to 28, SafeA received **$539.5K, 29.7%** of the $1.82M in liquid fees that reached Bankr's three fee addresses, $448K of it on Robinhood Chain.

From Sep 20 to the first funding, SafeA went from 5.65M BNKR to **1.38B**:

| Route | BNKR in | What SafeA paid |
|---|---:|---|
| [Relay](https://base.blockscout.com/tx/0xb67ce169d4cd68da36f18c83100e295d7b0bb42f891a67f5e6be3cc2e3c94856) from Robinhood Chain, Sep 21 | 516.1M | 139,990 USDG |
| 17 swaps through a Safe module | 634.2M | 97.0 WETH (41.6 of it sent in by SafeA's operator, not traced to fees), 27,183 USDC and small amounts of other tokens |
| [Closing its own](https://base.blockscout.com/tx/0x6daf035ccd9fcdd5e88058adf9a31df034383f5d705b08fe6c7aaad035eb18b4) BNKR/WETH position, Sep 25 | 220.7M | (it also got back 33.9 WETH) |
| Other transfers in | 3.2M | |

It has paid 246M of that into staking. At the end of Oct 6 it held **1,304.4M BNKR, about $506K**, or 10.8 weeks at the size of the Oct 6 funding.

DefiLlama's Bankr adapter, which ChainWard wrote, shows **$745.8K** of Bankr revenue for Sep 22 to Oct 5, the week before each funding. The two fundings equal **13.4%** of it. They draw on a stock SafeA built mostly before staking opened, so a week's funding doesn't track that week's revenue.

## What a staker receives

- **From whom.** All rewards so far are BNKR from SafeA, acquired by the routes above. No other address has funded or donated.
- **How much.** A fresh 1M BNKR stake at the end of Oct 6 earns about 4,900 BNKR a week, 25.4% a year, if Bankr keeps funding at this size and total stake stays the same.
- **How much returns to Bankr.** SafeB earns about 13% of every funding. If its share holds until Oct 13, it will have earned about 32.4M BNKR, roughly **$13.1K of the $99.8K**. The rest goes to the other addresses with stake, 860 of them at the end of Oct 6.

A treasury staking its own token is common, and this stake is public on-chain. SafeB first staked before rewards began, as 692 of the 897 addresses did, and on the same terms: its multiplier is 1.021x, against a pool average of 1.024x. What it earns moves BNKR from one Bankr Safe to another. It takes nothing from other stakers beyond the dilution any stake brings. Bankr's docs describe a top-stakers leaderboard on its stake page.

## What we didn't check

- **Who controls the Safes.** Bankr hasn't confirmed the Safes are its.
- **Labels.** Blockscout's API was unreachable from our hosts on Oct 6, so no exchange or entity labels. Counts are addresses, not people.
- **Older history.** We didn't trace where top stakers or SafeB got BNKR before Sep 1, where SafeA's operator got the WETH it sent in, or what SafeA still holds on Robinhood Chain.

---

*Verified October 6 and 7, 2026. All 3,801 staking events from deployment (block 51,806,100) to block 52,270,926 come from Base's public RPC. The first 1,584, up to block 51,999,654 where ChainWard's own Base node stood, were also read from our node and matched one for one. Contract state, balances and positions at block 52,270,926, and SafeA's and SafeB's transfer scans, come from an Alchemy archive endpoint. Per-account stakes rebuilt from events, and SafeA's balance in every window, reconcile to the wei. Prices are DefiLlama's. The chain shows where BNKR moved, not why. This is not advice on BNKR.*

> Disclosure: ChainWard wrote DefiLlama's Bankr fee adapter (merged Oct 4), which produces the revenue figures quoted here. In September ChainWard offered Bankr paid reconciliation work, as our [September decode](/decodes/bankr-on-chain) disclosed, and on Oct 6 it replied publicly to the post with the funding figures. ChainWard's treasury holds no BNKR. Bankr has not paid for, reviewed or approved this article. Corrections are welcome at hello@chainward.ai.
