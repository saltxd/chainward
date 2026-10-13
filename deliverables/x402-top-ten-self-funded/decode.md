---
title: "Three of the Top Ten x402 Sellers on Agent402's Board Pay Their Own Buyers"
subtitle: "On Oct 13, ranks 1, 5 and 7 on Agent402's 7-day x402 leaderboard were sellers whose buyers got their money from the seller. One of them runs a ring of 489 wallets through a facilitator."
plain: "Three of the ten biggest sellers on a public x402 leaderboard (ranks 1, 5 and 7) are paid mostly with their own money. They fund wallets that then buy from them, and the leaderboard counts it as sales. If you pick a seller by rank, check where its buyers' money came from first."
date: "2026-10-13"
slug: "x402-top-ten-self-funded"
seoTitle: "x402 Leaderboard Check: Three of Agent402's Top Ten Sellers Fund Their Own Buyers (X Pay, keyring-agent, BotPay), Oct 2026"
---

# Three of the Top Ten x402 Sellers on Agent402's Board Pay Their Own Buyers

x402 is a way for one program to pay another a few cents in USDC per request. A facilitator is the service that moves each payment. Leaderboards rank sellers by how much USDC reached them in the last 7 days, and one public one is [Agent402's](https://agent402.tools/api/leaderboard), which reads Base USDC settlements on-chain and ranked 2,290 outside sellers on Oct 13 (its default view leaves Agent402's own tools out). A leaderboard counts money in. It does not ask where the payers got that money.

We asked. For the top ten as of Oct 13, 01:19 UTC, we traced where each seller's USDC went after it arrived, and whether the wallets it went to came back as buyers.

Short version:

- **#1, X Pay, seeds its own buyers.** Since Sep 11 its payTo has sent USDC to 169 wallets whose first USDC ever came from X Pay. 159 of them paid it back: at least 45,873 payments, $4,167, against $4,266 sent. One wallet got $103.70 from X Pay on Oct 10 and paid all of it back in 750 payments over the next ten hours.
- **#5, keyring-agent, ping-pongs with itself.** One wallet has received exactly 541 USDC transfers, every one 0.05 USDC from the seller, and sent exactly 541 back, every one 0.05 USDC to the seller. The seller's ten largest counterparties all show the same in-equals-out counts.
- **#7, BotPay NFT Mint, funds a ring.** On Aug 16 its payTo sent 53.12 USDC to a wallet that split it three ways within a minute. Those three funded eight "buyer" wallets, which have since paid 489 fresh "seller" wallets 11,838 times through the Ultravioleta DAO facilitator. The 489 sent $700 back to BotPay's payTo. In the 30 days to Oct 11, 284 of BotPay's 347 payers were those wallets.
- **A scammer is following #1's buyers.** Within 36 seconds of that $103.70 wallet's first payment to X Pay, a fake token named with look-alike characters for "USDC" logged a transfer to an address that mimics X Pay's. It has done this 424 times, from 56 of X Pay's buyers.
- **Seven of the ten show no loop.** The wallets they send USDC to do not pay them. That is not a clearance; it is what we did not find.

Agent402's own router already refuses to spend buyer money on keyring-agent, which its index marks "settlement self-funded". X Pay and BotPay pass that gate. The leaderboard itself ranks by settled USDC, which is what it says it does.

---

## The board

Agent402's 7-day leaderboard, default view (`include=external`, 2,290 sellers), as of 2026-10-13 01:19 UTC. Calls, USDC and buyers are the board's own numbers.

| Rank | Seller | payTo | Calls | USDC | Buyers | What we found |
|---:|---|---|---:|---:|---:|---|
| 1 | X Pay | [0x589a2314](https://basescan.org/address/0x589a2314a2e05f45e40c4823da3ba58d421db3d8) | 13,418 | $2,904 | 155 | Seeds its buyers |
| 2 | api.surplusintelligence.ai | [0x0f99fc0c](https://basescan.org/address/0x0f99fc0cbd7a114b2da171fda5a0167858f7afc2) | 14,391 | $2,487 | 8 | No loop found; eight payers |
| 3 | AX1 Console | [0x7284d41b](https://basescan.org/address/0x7284d41b5b852f2bd4c99bdf95043d84452d299c) | 88,791 | $1,776 | 588 | No loop found |
| 4 | BlockRun.AI | [0xe9030014](https://basescan.org/address/0xe9030014f5dae217d0a152f02a043567b16c1abf) | 28,072 | $442 | 166 | No loop found |
| 5 | keyring-agent | [0x17cd53c0](https://basescan.org/address/0x17cd53c04d707ef0dd615ef56c633f02915a7905) | 6,516 | $326 | 53 | Ping-pong with its own wallets |
| 6 | StableEnrich | [0x325bdf6f](https://basescan.org/address/0x325bdf6f7efab24a2210c48c1b64cab2eae1d430) | 10,985 | $278 | 115 | No loop found |
| 7 | BotPay NFT Mint | [0x159be9e3](https://basescan.org/address/0x159be9e316bc5fac8ce05aec4eaae46e8f8a4908) | 2,183 | $218 | 347 | Funds a 489-wallet ring |
| 8 | Losbeto Market Intelligence | [0xd5ba9711](https://basescan.org/address/0xd5ba9711a3d052846a3695c70e7fcb8b3168fe7d) | 2,691 | $177 | 14 | Outflows are payouts, no loop |
| 9 | CheapTokens AI Inference | [0x213c8d74](https://basescan.org/address/0x213c8d7434e2ae7aa1c392767c5120778d413215) | 147 | $125 | 7 | Outflows are payouts, no loop |
| 10 | Storm Station 247 | [0x44adc7d3](https://basescan.org/address/0x44adc7d3199486730d6346f2dc2424de97124700) | 10,479 | $105 | 2 | Two payers; not traced |

## #1: X Pay seeds its buyers

X Pay (www.api-xpay.com) is paid at `0x589a2314`. Since Sep 11 that address has sent USDC to 169 wallets whose **first USDC ever** came from X Pay. 166 of them have never received USDC from anyone else. 159 paid X Pay: at least 45,873 payments, $4,166.96 in all, against $4,266.01 X Pay sent them. The median seed was $20.55.

One wallet shows the whole pattern in a day. [`0xf5c85318`](https://basescan.org/address/0xf5c85318e4818c64e3900a65a26666d61e6d0cf7) received its first USDC, 20 USDC from X Pay, at 04:22:29 UTC on Oct 10 ([tx](https://basescan.org/tx/0xabef61c5629d5bb709618759f09adc2a82e29bb1df6552c5ecc03eef4753fe08)). Twelve seconds later it made its first payment to X Pay. By 14:32:15 it had paid X Pay 750 times, $103.70, which is exactly what X Pay had sent it in five transfers. It has never sent a transaction of its own: every payment was an x402 authorization that a facilitator carried to the chain. Three other wallets, [`0xe5d93bb1`](https://basescan.org/address/0xe5d93bb133ff91869c36c23ecc8fd5b9f15825a6), [`0x27db658d`](https://basescan.org/address/0x27db658d7c1d7b0ced8fda96e2ea1dbd8a4ed0fe) and [`0x33cbc2ca`](https://basescan.org/address/0x33cbc2ca8a838f07779d70a0cb927177b0767e87), each got about $110 from X Pay on consecutive days (Sep 28, 29 and 30) and each paid back $109.95 in at least 2,000 payments.

Whether these are promotional credits, tests or something else is not visible on-chain. What is visible is that the money X Pay is ranked on came from X Pay. The board shows 155 buyers; Coinbase's catalog stats, which Agent402 also reads, show 140 payers in 30 days. By our count, 159 of X Pay's payers since Sep 11 were seeded by it.

### Someone is poisoning X Pay's buyers

Address poisoning is a scam where a wallet is shown a transfer to or from an address that looks like one it uses, so that a person copying an address from history picks the wrong one. 36 seconds after `0xf5c85318` first paid X Pay, a token contract at [`0x6eda34d6`](https://basescan.org/address/0x6eda34d6e08a96915799608b3eadcb0c9b1b3f48), named with look-alike characters for "USDC" and set to 6 decimals, logged a transfer "from" that wallet to [`0x589a2911…cb3d8`](https://basescan.org/address/0x589a2911c68932a396bf354fb130979ba89cb3d8), an address that starts and ends like X Pay's `0x589a2314…db3d8` ([tx](https://basescan.org/tx/0xc034588fb8257c4ae022abdef610de65037f8921bbb1625498bf5d1cb0f29e3c), 04:23:17 UTC). The fake token has logged 424 such transfers to the look-alike, "from" 56 different wallets; this one wallet alone was spoofed 41 times, the last at 23:22 UTC that day. The look-alike has never sent a transaction. A second fake, [`0xc7a53588`](https://basescan.org/address/0xc7a535883766f0d1de1dd5af0fbc8fd690559d78), also named like USDC, targets the same address.

An agent that pays by reading an address from its own transfer history is the target. X Pay's real payTo is in its 402 challenge, not in a buyer's history.

## #5: keyring-agent ping-pongs with itself

keyring-agent (keyring-agent.blockchhub.link) is paid at `0x17cd53c0`. Unlike most x402 sellers, this address sends its own transactions: 26,237 of them.

Wallet [`0x94064859`](https://basescan.org/address/0x940648591641027f025b37a33a5769261d344420) has received exactly 541 USDC transfers, every one 0.05 USDC from `0x17cd53c0`, the first at 02:01:59 UTC on Sep 15 ([tx](https://basescan.org/tx/0xa7a57268acc9c6cacb3effb38282ecf42782809403b55006723c0566f8fa1648)). It has sent exactly 541 USDC transfers, every one 0.05 USDC back to `0x17cd53c0`, the latest at 01:18 UTC on Oct 13. It has never sent a transaction of its own.

It is not alone. In the first 15,000 USDC transfers in and out of `0x17cd53c0`, its ten largest counterparties all show the same shape:

| Counterparty | In from seller | Out to seller |
|---|---:|---:|
| [0x993f7d66](https://basescan.org/address/0x993f7d661c394ea6b66be9017c09216120b15d3a) | 326 | 326 |
| 0x5c5f1b20 | 321 | 325 |
| 0x1f3c93cc | 320 | 321 |
| 0x2f61e6cf | 317 | 320 |
| 0xad50b86a | 317 | 318 |
| 0x74d24ece | 315 | 317 |
| 0x5bad97bc | 313 | 315 |
| 0x3adcfcde | 312 | 317 |
| 0x384bc42a | 312 | 315 |
| 0xc10dc8ce | 306 | 310 |

The ten wallets the seller has sent the most USDC to all received their first USDC from it between 02:00 and 05:08 UTC on Sep 15, and each has paid it back between 468 and 547 times.

Agent402's index already says this: its row for keyring-agent reads `settlement_self_funded`, and its router will not spend buyer money there. The leaderboard, which counts settled USDC, still ranks it fifth.

## #7: BotPay funds a ring through a facilitator

BotPay NFT Mint (api.botpay.network) is paid at `0x159be9e3`. The board shows 347 buyers, the most of any seller in the top ten after AX1 Console. 284 of them are wallets BotPay's own money created.

The chain of custody, every hop on Base:

1. **BotPay's payTo funds a root wallet.** From Aug 12 to Aug 20, `0x159be9e3` sent 13 transfers, $648.13, to [`0x8736ae11`](https://basescan.org/address/0x8736ae11c1f3c6eba0a023baa455b2372fca2aab). One of them: 53.12 USDC at 15:31:55 UTC on Aug 16 ([tx](https://basescan.org/tx/0xeae5d185bf3505fdf87d59b3e7dbbd856ef88b2a41c333df97b00ec4a354af27)).
2. **The root splits it.** One minute later, at 15:32, the root sent 18.40 USDC to [`0x037b2f95`](https://basescan.org/tx/0xee1349447c302401fe3a105f89c8492d84252217898405e4b3f86ba2dfc92652), 18.25 to `0xb2dfb659` and 16.47 to `0x5467fc26`. 18.40 + 18.25 + 16.47 = 53.12. The root has sent $3,876.51 to six such funders in all, and holds nothing: money in equals money out.
3. **The funders create buyers.** The three we traced funded eight wallets starting at 15:34 on Aug 16. The eight have never sent a transaction of their own.
4. **The buyers pay 489 fresh sellers.** Between Aug 16 and Oct 12 the eight made 11,838 payments, $1,138.09, almost all 0.10 USDC, to 489 wallets that had never received USDC before ([sample payment](https://basescan.org/tx/0x430afd700802d5acec07fb90375ddc59ebf83cddd62ea04d54b5caee5cc4655d)). The payments were carried to the chain by Ultravioleta DAO's facilitator addresses, [`0x10304054`](https://basescan.org/address/0x103040545ac5031a11e8c03dd11324c7333a13c7) and `0x402feee0`.
5. **The sellers send it back.** The 489 forwarded $700.16 to BotPay's payTo ([example](https://basescan.org/tx/0x16c1315f537d3c916d4a14edc95e4c1dbd773bef0c87dad069b94689473c7610), Oct 11) and $416.60 to a 48-byte contract at [`0xcc1984e7`](https://basescan.org/address/0xcc1984e79726e7a0ae2b9df2ac9e79fb4983930e). None of the 489 has ever sent a transaction of its own.
6. **The contract refills the root.** `0xcc1984e7` has sent the root $3,222.40 in 107 transfers, from Aug 12 ([first](https://basescan.org/tx/0x96de2002a13c8e2ef3444192a7cabb7b1eacfc5307c1ec352405a9d703a6f52f)) to Oct 12 ([latest](https://basescan.org/tx/0x20ed59ba16bb9d5600c68ba19b7deffe50eb92e40c72ad32d2eae657384ce1ea)). BotPay's payTo has sent the contract $2,162.85 in 71 transfers, the latest on Oct 12 ([tx](https://basescan.org/tx/0x8094fb79556bb4f20f8eccda6a4e1b11c51d7676e48e80c25e1f036c316c5e75)).

So: payTo, to contract, to root, to funders, to buyers, to 489 sellers, back to payTo. In x402scan's index of the 30 days to Oct 11, BotPay's payTo received 10,386 settlements, $1,037.96, from 347 payers. 5,580 of those settlements, $558.00, came from the 489 ring wallets, which are 284 of the 347 payers. The ring is at least this big: three of the root's six funders were not traced.

Ultravioleta DAO's facilitator is the rail. In our [Sep 15 to Oct 5 seller data](/decodes/x402-on-base-two-weeks-later), 22,267 of the 22,450 settlements that went through it, 99.2%, went to sellers whose buyers the seller had funded.

## The seven without a loop

For the other seven we ran the same trace: where the payTo's USDC went, and whether those wallets paid it back.

- **AX1 Console (#3), BlockRun.AI (#4), StableEnrich (#6):** their outgoing USDC goes to wallets that never pay them. We found no loop.
- **api.surplusintelligence.ai (#2):** $2,487 from eight payers is the most concentrated demand in the top ten, and its outgoing USDC goes to wallets that never pay it. Not a loop; a handful of payers.
- **Losbeto (#8), CheapTokens (#9):** their outflows look like payouts to people, not seeds. No loop.
- **Storm Station 247 (#10):** two payers; we did not trace it.

"No loop found" means the wallets this seller funded did not come back as buyers within the hops we walk. It does not mean the demand is real.

## What a rank is worth

Agent402's board does what it says: it counts USDC that settled to a payTo in 7 days. Coinbase's catalog stats count calls and payers. x402scan counts the same. None of them ask where the payer's money came from, and on Oct 13 that question changed the top ten: the first, fifth and seventh sellers are ranked on money that started with them.

If you are an agent picking a seller by rank, that is the check to run first. Our [seller check](https://api.chainward.ai/api/risk/seller-demand?address=0x589a2314a2e05f45e40c4823da3ba58d421db3d8) does it for $0.10, and the [free board](https://chainward.ai/x402) labels x402scan's top sellers every Monday.

## Limits

- **Who controls an address is not on-chain.** "Pays its own buyers" describes where the money moved, not who decided to move it. A seller could be funding promotional credits, test accounts or something else; the leaderboard counts it the same way.
- **Counts are floors.** Transfer reads were paged at 1,000 or 2,000 per query; wallets that hit the cap (X Pay's three $110 wallets, keyring's payTo at 15,000 each way) have more transfers than shown.
- **Four hops.** Funding trails were followed up to four hops back and stop at exchanges and busy hubs. A loop through an exchange account would not be visible.
- **One board, one day.** Ranks are as of 2026-10-13 01:19 UTC and move hourly.
- **x402scan's 30-day window** for BotPay ran from Sep 19 09:10 to Oct 11 18:46 UTC, the span of its index at read time.

## Method

Every USDC transfer in and out of each payTo was read from Base through Alchemy's `alchemy_getAssetTransfers`, ascending, with the page caps above. For each wallet a payTo sent USDC to, we read its first USDC transfer ever, its total transfers from and to the payTo, and its transaction count (`eth_getTransactionCount`; zero means the wallet has never sent a transaction and every payment was an x402 authorization relayed by a facilitator). For BotPay we repeated this one hop at a time from the payTo outward, then compared the ring's wallets with x402scan's list of payers (`public.transfers.list`, recipients filter, 30 days). The fake-token transfers were read with the same calls on the token contract. Rank, call and buyer figures are from `agent402.tools/api/leaderboard?top=10` at 01:19 UTC; the "settlement self-funded" label is from `agent402.tools/api/index`. Base USDC is [`0x833589fC`](https://basescan.org/token/0x833589fcd6edb6e08f4c7c32d4f71b54bda02913).

> Disclosure: ChainWard sells the $0.10 x402 seller check that automates this trace and runs the free board at chainward.ai/x402. ChainWard's own paid routes are listed in Agent402's index, where its router rates them "below the settlement floor"; on Oct 11 and 13 ChainWard emailed Agent402 about X Pay's demand and about its own index row. On Oct 13 ChainWard submitted the X Pay, BotPay and address-poisoning findings to the newsletter Would Pay Again's contributor bounty, which pays $0.10 per accepted fact. We did not ask X Pay, keyring-agent, BotPay, Ultravioleta DAO or Agent402 for comment before publishing.
