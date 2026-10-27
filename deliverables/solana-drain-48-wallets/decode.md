---
title: "48 Solana Wallets Emptied in 94 Seconds, Each With Its Own Key"
subtitle: "A script holding stolen private keys took 9,408 SOL (about $953,000) from nine owners on Oct 26. Revoking approvals would not have helped. What the chain shows, what Bloom says, and what neither can show yet."
plain: "Someone holding the private keys of 48 Solana wallets took 9,408 SOL from them in about a minute and a half on Oct 26, 2026. If a trading bot or app ever held your key, move what is left to a new wallet: revoking approvals does not stop a stolen key. Check every character of any address in this story; look-alikes are circling."
date: "2026-10-26"
slug: "solana-drain-48-wallets"
seoTitle: "Solana Mass Drain, Oct 26, 2026: 48 Wallets, 9,408 SOL, Stolen Keys, Measured On-Chain"
---

# 48 Solana Wallets Emptied in 94 Seconds, Each With Its Own Key

At 01:39 UTC on Oct 26, a post on X that passed 100,000 views within hours said "Mass drain happening. Groups saying it's BLOOM. unconfirmed. MOVE YOUR FUNDS OUT.", with a screenshot of one Solana address holding 9,408 SOL. Bloom is a trading bot that many Solana traders use through Telegram.

We read every transaction into that address, then followed the money. Times are UTC on Oct 26, 2026. Dollar figures use SOL at about $101.30, its price between 01:00 and 01:05 UTC.

Short version:

- **48 wallets, 9,408 SOL, about $953,000.** Almost all of it left between 01:03:07 and 01:04:41. The largest single loss was 1,636 SOL (about $166,000).
- **Stolen keys, not approvals.** In every one of the 59 transfers, the victim's own wallet is the only signer and pays the fee. Whoever did this held the private keys, so revoking approvals would have changed nothing.
- **Nine owners, many wallets each, not all of them.** The script tested one wallet per owner, then emptied that owner's wallets one after another, including wallets unused since 2025. Other wallets of the same owners were never touched: one owner's four top-up wallets still held 187 SOL at 10:41 UTC. The attacker had a list of wallets, not every key each owner had.
- **One script, SOL only.** Every theft carries the same fingerprint. Its attempt on 49,040 USDC failed, and the USDC was moved out minutes later, probably by its owner.
- **The SOL moved once.** At 04:30:56 the whole 9,408.21 SOL went to a fresh address, `6nYyCzJJzErbmfxvXqzbAqwoBzNvXUiwr15KCkcgmoe9`. At 10:41 UTC it had not moved again.

> **Update, Oct 27:** the stolen SOL started moving. At 06:40:55 and 11:42:44 UTC on Oct 27, `6nYyCzJJzErbmfxvXqzbAqwoBzNvXUiwr15KCkcgmoe9` sent 10 SOL each to two addresses with no earlier history, `GfHDgSHQwBw5ssuMRdfw9JLKWzQAvnwJ7ajk7SuzdeFr` and `HqCbwhMAJgf3EMabx3Kty8mCo9E2ZjqoHcNDbonPP9Am` ([tx](https://solscan.io/tx/2Q4ExGh3JVGLWwRKnwBfDNzUE8xbsc4JPBs9XBUY6V2KwobKAmyc7F9NkM49vvxfUfJpb6dueTFrkvomptTGWFvR), [tx](https://solscan.io/tx/rznhaTjon7mw1ZoKEPJEceYAbRV1H9RKLqTtrD2N9DVZAoG8sCAXgSpBxBp3cE2o5EnUVpCDmi9Wkp879xQHghi)), and both have sent it on. Within a minute of each send, look-alikes of those two addresses started sending the holder dust. At 12:27 UTC on Oct 27, 9,388.21 SOL was still at `6nYyCzJJzErbmfxvXqzbAqwoBzNvXUiwr15KCkcgmoe9`.
- **Bloom says it will pay the losses back.** Bloom said it will fully reimburse the "9 affected wallets" and is investigating, including whether a third-party provider was involved. Bloom trades show up in the histories of 3 of the 9 owners. The chain cannot show where the keys leaked.

---

## What happened, minute by minute

| Oct 26, UTC | What happened | Source |
|---|---|---|
| 00:59:34 | First move: 1 lamport, then 1,000 lamports, from the largest victim's wallet to itself, testing the stolen key | [tx](https://solscan.io/tx/3VizWsEPPMwWF7FEE7qRn4QQZ1orTuacyYwhJjymxbHY2vrBCALhCwv9aVedwSAtMKaRGSwU4UzSuyMLmMugtTGR) |
| 01:00:28 | 0.01 SOL creates the collecting address `7kY8qx8MqJ7Rz2vMhgHETdZLHcTp1oM78AA9dmE9p8BQ` | [tx](https://solscan.io/tx/4PzAaBNv86D1igC5VVb3JwCxXbb13W7MS6WmUmMq8SFtnZSm8ErhgygKHSsg5exfSCARAH4JLkm6GApRUTCXwZBM) |
| 01:02:08 to 01:02:27 | Nine test sends of 0.001 SOL, one from each owner | [first](https://solscan.io/tx/3N6CTtD8XMMchFL9fBqavot7qiQ6vB67n7DKFyoWepmTKUvPavJPum6kqCiPPnWPHfCfurtMJigJ8VQgSr8f9sUU), [last](https://solscan.io/tx/2b7h8tR2D3Fv5eWuGKqHkBFQzs11A7oJUswg9DFyG4TXLoghjJ2gqmw4peHyhz6or7MM4DBXThLK5iULbPnsqp1g) |
| 01:03:07 | First sweep: 6.36 SOL | [tx](https://solscan.io/tx/5qXWqiDfgQ8ixdVPXMA2w9NAymFu8KWeXDFi7NWJ7RDbZysyPXLWJrkz41dQFUQ5nNxJWeT3xBLZSsbsFrkfdSiR) |
| 01:03:50 to 01:04:41 | Main sweep: 47 wallets in 51 seconds, owner by owner in the test order, starting with the 1,636 SOL wallet. Each is left with exactly 0.001395 SOL | [first](https://solscan.io/tx/2LQ8nHstLcbUBs53QSqBSNLsihGGJo2EytGmVXuU7GJNrDHKwtF3YXeTGeha23shmx36cDe7g3zyz2QzPrihGfNo), [last](https://solscan.io/tx/25uyG7WYrC4p3UWGKKKjgNTDsQvoyjqPE5QoMzqqF77QrqpV1qH4GmFz952tzXN2yjWD4zabHPZbSDvHaYa4gYRM) |
| 01:08:01 to 01:28:43 | The script tests USDC on one wallet, then fails to take its 49,040 USDC: the wallet has no SOL left to pay the fee. At 01:28:43 the collector sends it 0.02 SOL for gas | [tx](https://solscan.io/tx/TwxZvzhX4Ztt94BuR8KvZLMD25wrDVGgXfwDVJdG4qm2ywt7x1AafbEgy2m958NWeeHcg6HCdY4vYZLkikhYMFT) |
| 01:28:53 to 01:30:19 | Probably the owner gets there first: 490 USDC is sold through Bloom for SOL, then 48,550 USDC moves to an older wallet (first used Jan 1, 2026), with the fee paid by a trading app's relayer | [tx](https://solscan.io/tx/4oTdDtKcTAVdjr3JGYD8jzfNuxZnHkRY9Fx5LsskxzGA1FPgkzHkT9mYJpqJeZM2iAmiddvdNLfCJiVWfESGMz1S) |
| 04:30:56 | The collector sends all 9,408.21 SOL to `6nYyCzJJzErbmfxvXqzbAqwoBzNvXUiwr15KCkcgmoe9`, a fresh address, in one plain transfer | [tx](https://solscan.io/tx/ADe8xTkY71BXz5ehqWhxqpgsGyFqzhw6dH1FNbURrj4G9hQMcQAWunKULWMGzimJQh47CPYJkpdL4xveMqK9Fvi) |

The move at 04:30:56 came 4 minutes 46 seconds after a widely shared alert from Onchain Lens named the collecting address (04:26:10 UTC). The address had been public on X since 01:39. That is timing only.

## Stolen keys, not approvals

On Solana, an app you approved can sometimes move your tokens without your key. That is not what happened here.

- **Every transfer is signed by the victim.** In all 59 transfers out of the 48 wallets, the victim's own wallet is the only signer and pays the fee. There is no delegate and no approval, and nothing was signed in advance: each transfer was signed at that moment.
- **One script did all of it.** Every one is an old-format transaction paying exactly 105,000 lamports in fees, and each of the 47 main sweeps sends the balance minus 0.0015 SOL. That fingerprint appears 67 times in the drain hour (the 59 transfers, 4 failed tries, 2 self-tests and 2 USDC tests) and in none of the 565 earlier transactions of these wallets that we read.
- **It took many wallets per owner, but not all.** The script tested one wallet per owner, then emptied that owner's listed wallets, near-empty ones too: one owner's five dormant wallets had last been used together on Aug 6, 2026. It never touched other wallets of the same owners. Four wallets that had moved SOL in one transaction with a drained wallet on Oct 11 still held 187 SOL at 10:41 UTC, and a wallet another owner has long traded with, probably its own, still held 3,499 SOL. Whatever leaked was a list of some of each owner's wallets, which fits one app's wallet list better than a dump of every key the owners had.

So revoking approvals, the usual advice after a drain, would not have helped anyone here. Only moving funds to a new wallet with a new key does.

## Nine owners

The attacker's own test sends split the 48 wallets into nine owners: one 0.001 SOL test per owner, then that owner's wallets in a row. Our own on-chain links (wallets signing the same transactions, sending SOL to each other, or trading in the same second) confirm three of those groups fully and three in part. One group has no solid link of its own, and two are single wallets. Nothing on chain contradicts the nine groups, and Bloom's own count is nine.

| Owner | Wallets | SOL taken |
|---|---|---|
| A | 5 | 1,864.48 |
| B | 4 | 1,145.66 |
| C | 6 | 1,308.75 |
| D | 1 | 1,039.71 |
| E | 1 | 1,021.72 |
| F | 5 | 865.16 |
| G | 7 | 771.10 |
| H | 12 | 649.50 |
| I | 7 | 742.16 |

21 wallets lost 100 SOL or more, 16 lost 10 to 100, 4 lost 1 to 10, and 7 lost less than 1 SOL.

## Was it Bloom?

The first posts named Bloom, and Bloom has since spoken. At 03:02 UTC it said its team was investigating, that all other wallets were safe, and that it was temporarily disabling some services. At 04:37 UTC it said it would fully reimburse the funds lost by the "9 affected wallets" into new wallets their owners choose, and that it was still investigating the root cause, including whether a third-party provider was involved. News sites report that Bloom later said the wallets belong to nine users; we could not see that post.

Here is what the chain adds. We looked at about 681 transactions the victims signed before the drain began, and compared them with wallets that were not drained: 30 users of trading bots and terminals holding at least 2 SOL, and 39 random traders holding at least 5 SOL, sampled from the hour before. Seven wallets fall in both samples, so the comparison covers 62 distinct wallets.

| Trading app seen | Victim owners (9) | Trading-app users (30) | Random traders (39) |
|---|---|---|---|
| Bloom | 3 | 0 | 0 |
| Axiom | 9 | 16 | 4 |

- **Bloom shows up for 3 owners and in none of the comparison wallets.** One owner traded through Bloom 36 minutes before the drain. All seven wallets of another owner made one Bloom trade together, in the same second, on Oct 14, so one Bloom account held all seven. A third owner made Bloom trades from two wallets in September. For the other owners we found no Bloom use in our samples (one owner's recent history was all spam from other accounts, so we could not tell).
- **On its own, that is a weak test.** The victims' histories were read deeper than the comparison wallets'. Counting the same recent window only, it is 1 owner of 9 against 0 of 62, which chance alone could produce. Bloom's own statement is the stronger link.
- **Axiom shows up for all 9, and for about half of the comparison app users.** It is widely used, so on its own it says little.
- **The chain cannot show where a key was created or how it left.** A wallet made in one app and imported into another looks the same on chain.

| Question | Our confidence |
|---|---|
| Keys were stolen, not approvals abused | High |
| One attacker, one script, one collecting address | High |
| The nine owners are Bloom users | High: Bloom counts nine affected wallets and will reimburse them |
| How the keys leaked (Bloom's systems, a third-party provider, or something else) | Not shown by chain data; Bloom is investigating |

## Where the money is

- 01:00 to 01:32: 9,408.23 SOL from the 48 wallets into `7kY8qx8MqJ7Rz2vMhgHETdZLHcTp1oM78AA9dmE9p8BQ`.
- 04:30:56: 9,408.21 SOL from there to `6nYyCzJJzErbmfxvXqzbAqwoBzNvXUiwr15KCkcgmoe9`, an address with no history before that transfer.
- At 10:41 UTC that address still held it, with no bridge, exchange deposit, mixer or split. Its only other activity is dust from look-alike addresses.
- Oct 27, 06:40:55 and 11:42:44 UTC: 10 SOL each to `GfHDgSHQwBw5ssuMRdfw9JLKWzQAvnwJ7ajk7SuzdeFr` and `HqCbwhMAJgf3EMabx3Kty8mCo9E2ZjqoHcNDbonPP9Am`, both fresh, which have sent it on (not yet traced further). 9,388.21 SOL was still at the holder at 12:27 UTC.

Not every move after the sweep was theft. One owner moved its remaining token value out 22 seconds after its sweep, through a fresh wallet, and that trail points back to the owner's own wallets. Another drained wallet unwrapped 16 wrapped SOL 26 seconds after its sweep, and that SOL still sat in the compromised wallet at 10:50 UTC. If you own a drained wallet, assume anything that lands in it can be taken.

Look-alike addresses (the same first and last characters, different middle) started sending dust to the victims and to the new holder within minutes. Five of the senders to the collecting address are such look-alikes, not victims. Reports quoting Bloom give 49 wallets; we found 48 that sent SOL to the collecting address.

## What to do

- If a trading bot, terminal or app ever held your private key, move what is left to a brand-new wallet with a new key, and do not import that key anywhere again.
- Revoking approvals does not protect a wallet whose key is out.
- Before you send to any address from this story, compare every character, not just the start and end.

## Limits

- The chain shows which keys signed, not how they left the owners' hands.
- Wallets that held nothing had nothing to take and do not show up, so the attacker may hold more keys than these 48.
- The owner groups rest on the attacker's own test order; our on-chain links confirm most but not all of them.
- The Bloom comparison rests on samples of each wallet's history, not every transaction, and is weak on its own.
- Dollar figures depend on the SOL price used ($101.19 to $101.54 between 01:00 and 01:05 UTC).

## Method

Every transaction into the collecting address, and every transaction touching the 48 wallets from 00:50 to 01:50 UTC (373 in all), plus 565 earlier transactions of the same wallets, read from public Solana RPC and checked twice: once by the investigation and once by an independent check that re-read the transactions itself. Trading-app fingerprints (program and fee-wallet addresses) come from the open-source parser solana-dex-parser-go v1.3.0. Bloom's statements were read from its posts on X at 03:02 and 04:37 UTC. We show victims' addresses only in shortened form.
