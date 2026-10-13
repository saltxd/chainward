# Publish checklist: x402-top-ten-self-funded

Every number in decode.md, where it came from. Evidence files are in the job tmp `sweep/` directory (ring.json, xpayscale.json, xpay.json, loophash.json, botpay_in30.json, seller_<payTo>.json, a402_lb_top10_2026-10-13.json, facts/*.json).

| Claim | Source |
|---|---|
| Leaderboard ranks, calls, USDC, buyers; 2,290 sellers (default `include=external`); asOf 2026-10-13 01:19 UTC | `agent402.tools/api/leaderboard?top=10` (saved as a402_lb_top10_default.json; the include=all view adds Agent402's own DNS lookup at #9) |
| keyring-agent marked `settlement_self_funded`; X Pay and BotPay `eligible` | `agent402.tools/api/index` rows (a402_index.json) |
| X Pay: 169 seeded wallets, 166 only ever from X Pay, 159 paid back, 45,873+ payments, $4,166.96 vs $4,266.01, median seed $20.55, first seed 2026-09-11 13:17:49 | xpayscale.json (alchemy_getAssetTransfers from/to 0x589a2314, 2,000-transfer page cap per wallet) |
| 0xf5c85318: 5 in $103.70, first 20 USDC 04:22:29 Oct 10 tx 0xabef61c5…, first payment 04:22:41, 750 out $103.70 by 14:32:15, nonce 0 | xpay.json + wallet.mjs run (only USDC inflows from X Pay) |
| 0xe5d93bb1 / 0x27db658d / 0x33cbc2ca: ~$110 in on Sep 29 / 28 / 30, $109.95 back in 2,000+ payments | xpay.json (first_usdc_time), xpayscale.json rows (paid_n capped at 2,000) |
| Coinbase catalog stats for X Pay: 140 payers / 45,429 calls in 30 days | a402_index.json `bazaar` field for www.api-xpay.com |
| Poisoning: token 0x6eda34d6 (6 decimals, homoglyph name), 424 transfers to 0x589a2911…cb3d8 from 56 wallets, first tx 0xc034588f… at 04:23:17 Oct 10, 41 spoofs of 0xf5c85318 (last 23:22), look-alike nonce 0, second fake 0xc7a53588 | poison.mjs run (alchemy_getAssetTransfers on the token contract; eth_call name/symbol/decimals) |
| keyring: payTo nonce 26,237; wallet 0x94064859 541 in / 541 out all 0.05, first tx 0xa7a57268… 02:01:59 Sep 15, last out 01:18 Oct 13, nonce 0; top-10 counterparty in/out table from first 15,000 transfers each way; ten most-funded wallets first USDC 02:00 to 05:08 Sep 15, paid back 468 to 547 times | seller_0x17cd53c0….json, facts/keyring-agent-pingpong.json (wallet2.mjs, seller2.mjs) |
| BotPay payTo → root 0x8736ae11: 13 tx $648.13 Aug 12 14:25 to Aug 20 12:49; tx 0xeae5d185… 53.12 USDC 15:31:55 Aug 16 (verified via eth_getTransactionReceipt) | loophash.json, facts/ultravioleta-botpay-loop.json |
| Root → 0x037b2f95 18.40 (tx 0xee134944…), 0xb2dfb659 18.25, 0x5467fc26 16.47 at 15:32; root in = out = $3,876.51; six funders ($686.52, $584.65, $544.78, $478.99, $442.05, $378.10) | ring.json funders, facts/ultravioleta-botpay-loop.json evidence |
| Eight buyers (nonce 0), first out 15:34:49 Aug 16; 11,838 payments $1,138.09 to 489 wallets, all nonce 0, none had USDC before; settlers 0x10304054 / 0x402feee0 (x402scan facilitator_id ultravioletadao); sample payment 0x430afd70… | ring.json buyers/sellers/settlers/sampleTx |
| 489 forwarded $700.16 to payTo, $416.60 to 0xcc1984e7, $5.33 to root; example forward tx 0x16c1315f… Oct 11 | ring.json collectors, forwardTx |
| 0xcc1984e7: 48 bytes of code; → root 107 tx $3,222.40 (first 0x96de2002… Aug 12 11:43, latest 0x20ed59ba… Oct 12 14:13); payTo → 0xcc1984e7 71 tx $2,162.85 (latest 0x8094fb79… Oct 12 14:12) | loophash.json, facts/ultravioleta-botpay-loop.json |
| x402scan 30 days: 347 payers, 10,386 settlements, $1,037.96; ring = 284 payers, 5,580 settlements, $558.00; window Sep 19 09:10 to Oct 11 18:46 | botpay_in30.json (public.transfers.list, recipients filter) ∩ ring.json sellers |
| Ultravioleta facilitator: 22,267 of 22,450 settlements Sep 15 to Oct 5 to looped sellers | deliverables/x402-on-base-two-weeks-later/data/x402_sellers_2026-09-15_to_10-05.csv (facilitators column × tier) |
| No loop for AX1, BlockRun, StableEnrich, surplusintelligence, Losbeto, CheapTokens; Storm Station not traced | seller_<payTo>.json runs (seller.mjs: outflow recipients never paid the seller back), surplus.json |

Pre-publish checks:
- [ ] `node scripts/build-decode-manifest.mjs` and commit `apps/api/src/data/decode-manifest.json`
- [ ] `pnpm decode:og-render x402-top-ten-self-funded` → `apps/web/public/decodes/x402-top-ten-self-funded/og.png` (1200×675)
- [ ] push to main; wait for Flux; `chainward.ai/decodes/x402-top-ten-self-funded` 200, og:image static
- [ ] one @chainwardai thread (intent URLs), no promo replies elsewhere
