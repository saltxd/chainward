# Publish checklist: solana-drain-48-wallets

Every claim in `decode.md` and `thread.md`, mapped to its source and to how it was checked. Window: Oct 26, 2026, 00:50 to 01:50 UTC for the drain; holder balance read at 10:41:47 UTC (slot 461,633,878).

**Privacy rule for this file** (it lands in the public repo): transaction hashes in full; full addresses only for the collecting address, the holding address and public programs. Victim wallets appear shortened only. The full victim list (`victims.csv`), the investigation report and both skeptic passes stay in the private ops folder (`ops/tracing/solana-drain-oct26/`).

Shorthand:
- `RPC` = api.mainnet-beta.solana.com (public, keyless), paced at 2 requests a second.
- `INV` = the investigation report (`ops/tracing/solana-drain-oct26/report.md`, sections 1 to 10), Oct 26.
- `SK1` = independent skeptic, phase 1 (re-pulled all 73 collector transactions and the holder's history), 7 of 7 PASS.
- `SK2` = the same skeptic, phase 2 (all 373 transactions in 00:50 to 01:50, 565 earlier transactions, 7 comparison wallets, current balances at 10:41 UTC): verdict SEND WITH EDITS; every required edit (1 to 8) is applied in this version.

## Headline numbers

| Claim | Source | Checked by |
|---|---|---|
| 48 wallets drained; 5 more senders are look-alike dust senders, not victims | 53 distinct senders to `7kY8qx8MqJ7Rz2vMhgHETdZLHcTp1oM78AA9dmE9p8BQ`; the 5 sent 0.000001 to 0.0001 SOL from look-alike addresses at ordinary fees | INV, SK1 claim 1 |
| 9,408 SOL in 59 transfers (48 sweeps of record + 9 tests + creation + 1) | 9,408.229795593 SOL | SK1 claim 2, SK2 row 15 |
| About $953,000 | SOL at $101.19 to $101.54 (Coinbase SOL-USD 1-minute candles, 01:00 to 01:05 UTC; Kraken $101.20 to $101.49) | SK1 claim 3 |
| Almost all between 01:03:07 and 01:04:41 (94 seconds) | 99.9998% of the SOL; outside the window only 0.019 SOL before and 0.001 at 01:32 | SK1 claim 4 |
| Largest single loss 1,636 SOL | first main sweep, 2LQ8nHst… | INV, SK2 row 17 |
| Size buckets 21 / 16 / 4 / 7 | victims.csv | SK2 row 17 |

## Timeline

| Claim | Source | Checked by |
|---|---|---|
| 00:59:34 self-tests, 1 then 1,000 lamports | 3VizWsEPPMwWF7FEE7qRn4QQZ1orTuacyYwhJjymxbHY2vrBCALhCwv9aVedwSAtMKaRGSwU4UzSuyMLmMugtTGR, 2HKtznj7… | SK2 row 1 |
| 01:00:28 collector created with 0.01 SOL | 4PzAaBNv86D1igC5VVb3JwCxXbb13W7MS6WmUmMq8SFtnZSm8ErhgygKHSsg5exfSCARAH4JLkm6GApRUTCXwZBM | SK2 row 3 |
| Nine 0.001 SOL tests, one per owner, 01:02:08 to 01:02:27 | 3N6CTtD8… (first), 2b7h8tR2… (last) | SK2 row 4 |
| 01:03:07 first sweep, 6.36 SOL | 5qXWqiDf… | SK2 row 5 |
| 47 main sweeps 01:03:50 to 01:04:41, each leaves 0.001395 SOL | 2LQ8nHst… (first), 25uyG7WY… (last) | SK2 row 6 |
| USDC test, then a failed USDC sweep for lack of SOL; 0.02 SOL for gas at 01:28:43 | TwxZvzhX… | SK2 rows 7, 8 |
| Probably the owner: 490 USDC sold through Bloom at 01:28:53, then 48,550.117346 USDC to an older wallet (first tx 2026-01-01) at 01:30:19, fee paid by a trading app's relayer | 4oTdDtKc…; "the owner" is an inference | SK2 rows 9, 11 |
| 04:30:56, 9,408.209917593 SOL to `6nYyCzJJzErbmfxvXqzbAqwoBzNvXUiwr15KCkcgmoe9` | ADe8xTkY71BXz5ehqWhxqpgsGyFqzhw6dH1FNbURrj4G9hQMcQAWunKULWMGzimJQh47CPYJkpdL4xveMqK9Fvi | SK1 claim 6, SK2 row 13 |
| Move came 4 min 46 s after Onchain Lens's alert (04:26:10 UTC); address public since 01:39 | X status 2114574282282160371; @KayTheDoc 2114532284447781094 | SK2 row 42 |

## Stolen keys

| Claim | Source | Checked by |
|---|---|---|
| Victim is the only signer and fee payer in all 59; no delegate, no approval, no durable nonce | each transaction's signer list and instructions (System transfer + 2 ComputeBudget) | SK1 claim 5, SK2 row 19 |
| Legacy transactions, 105,000 lamports in fees | CU limit 100,000 x 1,000,000 micro-lamports + 5,000 base | SK2 row 20 |
| The 47 main sweeps send the balance minus 0.0015 SOL | 47 of 47 | SK2 rows 6, 21 |
| Fingerprint 67 times in the drain hour, 0 in 565 earlier transactions read | scoped to what we sampled | SK2 row 22 |
| One owner's five dormant wallets last used together on Aug 6, 2026 | same-second activity 19:03:25 to 19:03:40 | SK2 row 24 |
| Four top-up wallets of one owner untouched, 187 SOL at 10:41 UTC; they co-signed a transfer with a drained wallet on Oct 11 | 51.13 + 47.45 + 41.72 + 46.97 = 187.27 SOL; Fo5gAWru… (2026-10-11 22:04:31) | SK2 row 23 |
| A wallet another owner has long traded with, probably its own, untouched with 3,499 SOL | 44.3 SOL payment 2025-08-22 | SK2 row 23 |

## Owners and Bloom

| Claim | Source | Checked by |
|---|---|---|
| Nine groups from the attacker's test order; on-chain links confirm A, H, I fully and C, F, G in part; B no solid link; D, E single wallets | INV owner grouping | SK2 row 18 (wording corrected) |
| Bloom statements at 03:02 and 04:37 UTC, "9 affected wallets", reimbursement, third-party provider question | X statuses 2114553258337574985 and 2114577183834280267, read through the public embed endpoint | SK2 edit 1 |
| News report Bloom said the wallets belong to nine users | GNcrypto, BlockchainReporter (marked as reported) | SK2 edit 1 |
| 681 earlier victim transactions sampled; comparison 30 + 39 wallets, 62 distinct | INV, SK2 row 30 | SK2 rows 30, 31 |
| Bloom for 3 owners: one 36 minutes before the drain (00:23:08); all seven wallets of one owner in the same second on Oct 14 (04:42:18); two wallets of a third owner on Sep 18 and Sep 21 | Bloom program b1oomGGqPKGD6errbyfbVMBuzSC8WtAAYo8MwNafWW1 and fee wallet 7HeD6sLLqAnKVRuSfc1Ko3BSPMNKWgGTiWLKXJF31vKM (solana-dex-parser-go v1.3.0) | SK2 rows 25 to 28 |
| No Bloom for the other owners in our samples; one owner not determinable (spam-only recent history) | | SK2 row 29 |
| Same-window comparison 1 of 9 vs 0 of 62 could be chance | p about 0.13 | SK2 row 32 |
| Axiom for all 9 owners, 16 of 30 app users, 4 of 39 random traders | | SK2 row 33 |

## Where the money is

| Claim | Source | Checked by |
|---|---|---|
| Holder had no history before 04:30:56; at 10:41 UTC still 9,408.21 SOL, no outflows, only look-alike dust | balance 9,408.210018593 SOL at 10:41:47 UTC, slot 461,633,878 | SK1 claim 6, SK2 row 40 |
| One owner's token value left 22 s after its sweep through a fresh wallet, trail back to its own wallets | 496.14 CASH to a fresh wallet, forwarded at 01:26:21 to the wallet that funded its earlier sells | SK2 edit 7 |
| A drained wallet unwrapped 16 wrapped SOL 26 s after its sweep; 16.016 SOL still there at 10:50 UTC | 4KmGqqt5… (01:04:24) | SK2 edit 7 |
| Reports quoting Bloom give 49 wallets; 48 sent SOL to the collector | | SK1 claim 1, SK2 edit 1 |

## Not claimed

- How the keys leaked (Bloom's systems, a third-party provider or anything else): not shown by chain data.
- Who the owners are: wallets only, no people named.
