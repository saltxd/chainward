# Post draft: solana-drain-48-wallets (NOT POSTED)

Rules: one @chainwardai post per UTC day, original post only, no link replies under other accounts' posts, never resend. Oct 26 UTC is used by our no-link reply under @KayTheDoc (2114598373332582553, 06:01:54 UTC); Oct 27 UTC is the scheduled x402 post. The ref tag follows the posting day (`?ref=cwMMDD`); change it if the day changes. X counts any link as 23 characters: the post below is 263.

## The post (use alone)

```text
On Oct 26 a script emptied 48 Solana wallets of 9,408 SOL (~$953k), almost all of it in 94 seconds. Every transfer was signed with the owner's own key, so revoking approvals would not have helped. What the chain shows, and what Bloom says: chainward.ai/decodes/solana-drain-48-wallets?ref=cw1028
```

## Sources

- 48 wallets, 9,408.229795593 SOL in 59 transfers: decode "Short version"; skeptic phase 1 claims 1-2 and phase 2 row 15 (all 73 collector transactions re-pulled from api.mainnet-beta.solana.com).
- ~$953k: Coinbase SOL-USD 1-minute candles $101.19 to $101.54 (01:00 to 01:05 UTC), total $952.0k to $955.0k; Kraken agrees (skeptic phase 1 claim 3).
- 94 seconds: 01:03:07 to 01:04:41 UTC, 99.9998% of the SOL (skeptic phase 1 claim 4).
- Signed with the owner's own key: victim is the only signer and fee payer in all 59, no durable nonce (skeptic phase 1 claim 5, phase 2 row 19).
- "what Bloom says": Bloom's posts 2114553258337574985 (03:02:37 UTC) and 2114577183834280267 (04:37:42 UTC), read through X's public embed endpoint (skeptic phase 2, edit 1).
