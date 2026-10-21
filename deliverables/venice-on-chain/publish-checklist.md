# Publish checklist: Venice on-chain

Every claim, its source, and its check. Investigation: job tmp venice/finding.md (inv-venice); independent re-derivation: venice/skeptic/verdicts.md (skeptic-venice, 2026-10-21): claims 1-6 confirmed.

| Claim | Source | Verified by |
|---|---|---|
| First $5.07 swap tx 0x4d6550…9298, block 48,768,778, 22:21:43 UTC Jul 17; none earlier | wallet history from Apr 19 | skeptic, Tenderly + node |
| 90 $5.0375 swaps 21:41 to 22:21 Jul 17 (normal about 3/h) | swap logs | skeptic |
| 1,192.7/day Jul 18-24 (8,349); 2,804.4/day Oct 14-20 (19,631) | USDC Transfer logs from the wallet | skeptic, Tenderly; node and Alchemy agree Oct 14-19 |
| June subscription-size swaps 36,164 (1,205.5/day); Oct 14-20 3,198/day | logs | finding + skeptic (June) |
| All 2,751 $5.07 swaps on Oct 14 burn; all 5,518 burns that day trace to the wallet | logs | skeptic |
| Safe 0x35fb (2-of-6) and staking owner/treasury Safe 0x2d8c (4-of-6) share six owners; $567K from 0x35fb | getOwners, owner(), treasury() | skeptic |
| $1.13M from two hot-wallet contracts, third-party-looking, not evidence of control | transfers | skeptic |
| DIEM totalStaked 28,982.62 (Jul 1) and 28,369.47 (Oct 21) | eth_call at blocks | skeptic, two RPCs |
| x402 Sep $2,832.52 (top payer $2,005), Oct 1-20 $707.37, no outflows since Apr 1, balance $5,658.79 | logs + balances | skeptic |
| Monthly table rows | finding data/build_tables.py | finding; spot checks above |
| Venice's rule ($5 per $100 credits; $2/$5/$10 per new subscription) | Venice blog Jul 17, Apr 15 | finding (attributed to Venice in copy) |
| Burn page monthly VVV equals on-chain burns (Jun 14,579.44 ... Sep 36,417.98) | outerface.venice.ai burn history | finding |

Before publishing: user OK; draft: true removed; OG card (pnpm decode:og-render venice-on-chain); manifest rebuild; one post (thread.md), no link replies to strangers.
