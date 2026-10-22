# Thread draft: address-poisoning-base (NOT POSTED)

Rules: one @chainwardai post that day, original post only, no replies with links under other accounts' posts, never resend. Numbers as of Base block 52,906,634 (Oct 21 2026, 17:10 UTC); ETH at $2,517.65 (Chainlink, Oct 21 16:39:57 UTC). Counts below use X's rule that any link is 23 characters.

## The post (use alone)

```text
104 seconds after we were paid two 10-cent bounties on Base, a bot put a look-alike of each wallet in the other's history. One wallet did this to ~439,000 payments in a week for $53 of gas. It copies plain sends, not x402. Paste an address before you pay: chainward.ai/decodes/address-poisoning-base
```

The post leaves out Would Pay Again's name on purpose: the decode names it with context, a 280-character post cannot.

## Optional thread (3 follow-ups; then the opener drops its link and the link goes in the last post)

Opener without the link:

```text
104 seconds after we were paid two 10-cent bounties on Base, a bot planted a look-alike of each wallet in the other's history. One wallet did this to about 439,000 payments in a week, for $53 of gas. It copies plain sends, not x402 payments.
```

2.

```text
How a copy works: A pays B. Minutes later (median 142 s for USDC) the bot logs an imitation "USDC" from a look-alike of A to B, and from A to a look-alike of B. 99.95% of its USDC look-alikes match the first 4 and last 5 characters. Nothing moves until someone copies one.
```

3.

```text
Why x402 isn't copied: the payer signs, a facilitator sends the transaction. This bot copies only transfers the payer sends itself. None of the 183,951 token payments it copied that week was an x402 payment. Payouts, refunds and top-ups are plain sends, and those get copied.
```

4.

```text
What it caught: one $0.08 payment we found this week, and catches often come a day later. Since April, six traced: 0.751 ETH and 134 USDC, about $2,025 at the Oct 21 ETH price. Get the address from the payee, never from history, or paste it first: chainward.ai/decodes/address-poisoning-base
```

## Sources per post

- Post / opener: payouts tx 0xcec19f99…0446 (15:43:13 UTC) and 0x49652a25…17a4 (15:43:17); copy tx 0xfb329dcb…bb64 (15:45:01, block 52,904,077); 439,209 copy pairs and 0.020906653 ETH gas for blocks 52,602,209 to 52,904,609 (finding.md, summary.json, balances re-read on mainnet.base.org); plain sends only: 1,656 of 1,656 classified copies (targeting_rows.json); x402: 0 of 183,951 matched copies were EIP-3009.
- 2: USDC lag median 142 s (n = 182,140); 182,050 of 182,140 share at least 4 leading and 5 trailing hex characters (recount of match_USDC + matchpre_USDC).
- 3: EIP-3009 settlements are sent by the facilitator (example 0x37e06e94…f67c, sent by Coinbase's facilitator 0x68a96f41…7863 per x402scan's list); 0 of 183,951; payouts copied: Would Pay Again three pairs (payto_echo_pairs.json).
- 4: WETH catch 0x5866df92…8f10; six traced catches in catches.json; $2,025 = 0.751 x 2,517.65 + 134 + 0.00003 x 2,517.65.

## Graphic (optional)

None required. If made: one stat card in the ChainWard style (1200x675 @2x): "884,017 look-alike transfers / 1 wallet / 7 days / $53 of gas / 0 x402 payments copied", source line "Base blocks 52,602,209 to 52,904,609". No full addresses on the card, real or look-alike.
