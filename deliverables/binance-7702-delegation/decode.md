---
title: "Binance's Hot Wallet Was Signed Over to the Attacker for 3 Hours, 49 Minutes and 36 Seconds"
subtitle: "An EIP-7702 delegation installed 3 minutes 24 seconds before the sweep, on 50 authorizations signed minutes earlier. Closed 00:10:35 UTC."
plain: "Binance's hot wallet was not just emptied. Its key had signed control of the wallet over to the attacker's contract, so anything landing in it could be taken without Binance signing again. That stayed true for 3 hours and 50 minutes, until Binance closed it at 00:10:35 UTC. We checked the Ethereum side only."
date: "2026-10-30"
slug: "binance-7702-delegation"
seoTitle: "Binance Hot Wallet Incident, 29 Oct 2026: the EIP-7702 Delegation, Its 3h49m Window, the 50 Pre-Signed Authorizations and the $2.2B Ethereum Freeze"
---

# Binance's Hot Wallet Was Signed Over to the Attacker for 3 Hours, 49 Minutes and 36 Seconds

> **Correction, 2026-10-30 19:40 UTC.** This piece first reported four sweeps totalling 169,662.4938 ETH and said the account "closes cleanly" with "nothing came for it" after 23:38. That was wrong. A **fifth sweep** took **2,961.910821 ETH** at 23:56:47 UTC, sixty seconds after that amount arrived in the wallet, while the delegation was still live. The total is **172,624.4046 ETH**. We found this by reading the operator's account to the end; our first two passes both stopped at nonce 21. The sweep is confirmed by both transactions and by balance deltas on an independent archive endpoint agreeing to six decimals. The corrected figures are in the table below.

**Figures here are as of Ethereum block 26,301,944, 2026-10-30 00:20 UTC.** Quantities, hashes and block numbers do not move. Dollar figures do: they are quotes at that point, with ETH at $2,256.74.

The window this piece is about is closed. It opened at 20:20:59 UTC on 2026-10-29, when an EIP-7702 delegation pointed Binance's hot wallet at a contract the attacker had deployed four hours earlier. It closed at 00:10:35 UTC on 2026-10-30, when Binance signed a new authorization naming the zero address. **3 hours, 49 minutes and 36 seconds.** For all of it, anything that landed in that wallet could be taken out of it without Binance signing anything further.

The coverage says Binance was hacked and funds moved to unknown wallets. That is right, and it is not the useful part. What the chain shows is a specific mechanism, with a specific start and a specific end, both datable to the second.

## The short answer

- **The sweep did not exploit a contract. It used a delegation on an ordinary wallet.** Under EIP-7702, Binance 14's own key signed a message making the attacker's contract the code that runs when that address is called. That is why one transaction could take ETH and 63 token types atomically.
- **The window was open 3 hours, 49 minutes and 36 seconds, and we watched both ends.** `eth_getCode` on Binance 14 returned the attacker's contract at block 26,301,895 and `0x` at block 26,301,896. The revocation is a single transaction, timestamped 00:10:35 UTC.
- **The enabling transaction carried 50 authorizations over 50 consecutive future nonces, and they were signed about three minutes before they were used.** The window's floor is the wallet's live nonce at 20:17:47. That dates the signing to within minutes of the attack and rules out a stale pre-signed batch.
- **Whoever did this could sign at will with that key.** Fifty authorizations are fifty distinct signatures over fifty distinct payloads. The chain cannot tell you how that capability was obtained, and we do not guess.
- **A second Binance wallet was drained 24 seconds later by a completely different method,** with no delegation at all: Binance 16's own key signed an ordinary ERC-20 transfer. Two Binance keys, two mechanisms, 24 seconds apart.
- **The delegation also walked $823M of USDC out of a separate custody contract.** A stolen key spends what the key holds. A delegation spends what the key is trusted for.
- **Binance was the first victim. The three earlier wallets were the operator's own rehearsal.** The same account and the same function selector hit them hours before, but all three held **nothing** when they were delegated; the operator funded them with about $13.54 and took it back 14 to 17 minutes later, to test the contract it then pointed at Binance. A thief delegates a wallet that already holds something.
- **The withdrawal pause is datable on-chain to the minute.** Binance 14's transaction rate fell about 96% at 20:24 UTC and had not recovered 4 hours later.
- **The reported freeze figures hold up.** On Ethereum we can account for $2.21B frozen to the dollar. Four of the nine Tether-blacklisted Ethereum addresses hold zero, but the money had moved on and the freezes followed it down the hops: at least $175M of it sits frozen one address further along.
- **Both stablecoin issuers froze Binance's own hot wallet before Binance revoked the delegation.** Tether at 22:06:23, Circle at 23:53:35, Circle on the custody contract at 23:54:59, revocation at 00:10:35. We offer no theory about why. The order is the finding.
- **195,460 ETH, about $441M, is sitting completely still** at an address that has never sent a transaction. ETH cannot be frozen by an issuer. That is where the recovery conversation actually is.
- **Poisoning bots were spoofing the attacker's own outbound transfers inside the first seven minutes.** Four independent proofs below. The lesson: match a token by its contract address, never by its ticker, and never copy a counterparty address out of transaction history.
- **Ethereum only,** except where we say otherwise. We do not publish a cross-chain total.

## Before you go looking at Binance balances

This story invites a specific error, so take this before anything else.

**A drained-looking hot wallet is the normal state of a hot wallet.** Exchange hot wallets sweep down to near zero many times a day. Anyone eyeballing balances today will produce false positives, and some of them will be posted as news.

Binance 15, `0x21a31Ee1…5549`, fell from 19,680 ETH to 0.049 ETH in 24 hours. It is fine. At 23:37 UTC it was still sending routine transfers every 12 seconds. On Tron, the address labelled "Binance-Hot 1" holds 17.82 USDT and has been dormant since 2023, which is a labelling artefact, not an event.

A low balance is not evidence of theft. What identified the actual victim was not its balance. It was a delegation on an address that should not have one, a single transaction that took **100% of the balance minus exactly 1.0 ETH**, and a brand new beneficiary address.

## The sweep

| | |
|---|---|
| Transaction | [`0x53bd38b8…e88e2f3`](https://etherscan.io/tx/0x53bd38b816c23e74134786c29a8c18d792777998a3b9326047b583100e88e2f3) |
| Block and time | 26,300,770, **2026-10-29 20:24:23 UTC** |
| Sender | `0x7C8601d4645b93cea45F71e118A729332e6B5CA0`, the attacker EOA, nonce 11 |
| Target | `0x28C6c06298d514Db089934071355E5743bf21d60`, **Binance 14** |
| Call | selector `0x8a179be4`, 4,362 characters of calldata, 2,455,349 gas used against a 3,391,450 limit |
| Logs | 64, of which **63 are ERC-20 `Transfer` events** |
| Moved | **167,464.2479 ETH** plus those 63 token transfers |
| Beneficiary | `0x5227f603C1eE34CE3C06eFe6477003BDfCCB2f8c`, an EOA, not a contract |

The wallet labels are Etherscan's, read from one page fetch: `0x28C6c062…1d60` is tagged Binance 14, and `0x7C8601d4…5CA0` carries Etherscan's tag "Binance Hot Wallet Exploiter." That label is the only attribution in this piece, and it is a label, not an established fact. None of the identity speculation circulating is supported by anything we read, and we repeat none of it.

Archive balances either side of that block show Binance 14 going from 167,465.247917 ETH to exactly 1.0 ETH in one block. The headline ETH figure is correct to the whole ETH.

The largest token legs inside that one transaction: USDT 1,615,409,498.97 (about $1.614B), RLUSD 62,597,239.68 (about $62.6M), XAUT 11,372.47 (about $45.7M), USD1 27,760,801.82 (about $27.7M), LINK 2,263,172.08 (about $24.8M), AAVE 127,853.36 (about $16.0M), and 57 more. One transaction, roughly $2.5B.

## It was not a contract call. It was a delegation.

Binance 14 is an ordinary externally owned account. It has no code of its own. But from 20:20:59 UTC until 00:10:35 UTC, this is what the network returned for it:

```
eth_getCode("0x28C6c06298d514Db089934071355E5743bf21d60")
  -> 0xef010063e842b054bd624a465454d533c33f573e9c6fae
```

`0xef0100` is the EIP-7702 delegation designator. The remaining 20 bytes are a contract address: `0x63e842B054Bd624a465454D533C33F573e9c6fAe`, 1,674 bytes, unverified source, deployed by the attacker EOA itself as a plain contract creation at its own nonce 5, block 26,299,449, **15:59:11 UTC** the same day.

In plain words: EIP-7702 lets the owner of a normal wallet sign a message that says "for the purposes of this chain, run this contract's code when my address is called." The key still belongs to the owner. The behaviour belongs to whoever wrote the contract. Binance 14's key signed that message. The contract it named was the attacker's.

## The window, and the minute it closed

The delegation was installed at 20:20:59 UTC. It was revoked at **00:10:35 UTC**, in transaction [`0xafbf94c9…8dac7209`](https://etherscan.io/tx/0xafbf94c92a8d749988411669fa14d4f8866d9b4420b4ebd299f28e958dac7209), block 26,301,896. That is a type-4 transaction sent from Binance 14 to itself at nonce 18,914,903, carrying one authorization naming `0x0000000000000000000000000000000000000000`, with Binance 14 as the authority. Pointing a delegation at the zero address is how you remove one.

The boundary is exact:

```
eth_getCode(0x28C6c06298d514Db089934071355E5743bf21d60)
  block 26,301,895  ->  0xef010063e842b054bd624a465454d533c33f573e9c6fae
  block 26,301,896  ->  0x
```

**3 hours, 49 minutes and 36 seconds.** For all of it, the wallet behaved as the attacker's contract told it to, and anything arriving in it could be removed without Binance signing again.

The attacker used the window four times. Archive balances immediately before and after each `0x8a179be4` call:

| Call, UTC | Block | Before | After | Taken |
|---|---|---:|---:|---:|
| 20:24:23 | 26,300,770 | 167,465.2479 | 1.0000 | **167,464.2479** |
| 21:04:23 | 26,300,968 | 1,700.9229 | 1.0000 | **1,699.9229** |
| 21:44:11 | 26,301,167 | 370.8319 | 1.0000 | **369.8319** |
| 22:39:35 | 26,301,444 | 129.4911 | 1.0000 | **128.4911** |
| 23:36:47 to 23:38:23 (4 calls) | | 0.9199 | 0.9199 | 0 |
| 23:56:47 | 26,301,828 | 2,962.9108 | 1.0000 | **2,961.9108** |
| | | | | **172,624.4046 total** |

Three things that total says that the quoted 167,464 does not. The theft was **five sweeps, not one**, and the ETH figure in circulation is the first of them. The attacker left **exactly 1.0 ETH** every time, which is a signature, not a rounding accident. And the last of the five is the one that shows what a live delegation actually means: at 23:55:47, 2,961.990882 ETH arrived in Binance 14 from an unlabelled address, and **sixty seconds later** it was swept, leaving the same 1.0 ETH behind.

The total is still final rather than a floor, because the delegation was revoked at 00:10:35 and nothing could be taken after that. But it is final for that reason alone, not because the attacker had finished.

**The check, for anyone who wants it.** `eth_getCode` on `0x28C6c06298d514Db089934071355E5743bf21d60` against any Ethereum node or explorer. It now returns `0x`, which means no delegation. Anything beginning `0xef0100` means the address is delegated, and the 20 bytes after it tell you to what. It costs one call, it works on any address, and for three hours and fifty minutes it would have told you something about this wallet that no announcement did.

Binance closed its window. The three wallets hit earlier the same day had not closed theirs at our snapshot, which is the section after next.

## Fifty authorizations, signed about three minutes before use

The delegation was installed by a type-4 set-code transaction, [`0xad99264d…051298b`](https://etherscan.io/tx/0xad99264d5532ae0dd04b2004eebda05f25657e70dacb764f7ac8d4ccd051298b), in block 26,300,753 at 20:20:59 UTC. That is **3 minutes and 24 seconds** before the sweep.

It carries **50 EIP-7702 authorizations**. All 50 are for chain ID 1. All 50 name the same delegate contract. All 50 have Binance 14 as the authority. And they cover **50 strictly consecutive nonces, 18,914,775 through 18,914,824**.

An authorization is bound to one exact account nonce. It is valid at that nonce and worthless at every other. Binance 14's nonce climbs constantly, so fifty consecutive nonces buy a short window. How short is not a thing we have to estimate, because the wallet's own traffic measures it:

```
nonce 18,914,775   block 26,300,737   20:17:47 UTC   window opens
nonce 18,914,809   block 26,300,753   20:20:59 UTC   the set-code tx spends this one
nonce 18,914,824   block 26,300,769   20:24:11 UTC   window closes
```

**Fifty authorizations bought 6 minutes and 24 seconds of that wallet's real traffic**, and the one actually spent was **the 35th of the 50**, used 3 minutes and 12 seconds in, with 34 below it and 15 above. That is why there are fifty and not one.

Here is the arithmetic inside the set-code block itself:

```
end of block 26,300,752                      nonce 18,914,808
block 26,300,753, index 133: B14's own tx    nonce 18,914,808 -> 18,914,809
block 26,300,753, index 138: the setcode tx  consumes auth    18,914,809
end of block 26,300,753                      nonce 18,914,810
```

Now the part that matters most. The floor of that range is not a number chosen in advance. It is the nonce Binance 14 was standing on three minutes beforehand. The attacker read the wallet's live nonce, signed fifty authorizations starting from it, and spent one of them about three minutes later.

That single fact closes off the comfortable explanations:

- **It is not one leaked signature.** Fifty valid authorizations are fifty distinct ECDSA signatures over fifty distinct payloads. None can be derived from another.
- **It is not an old pre-signed batch that was stolen.** The delegate contract address is inside the signed payload, and that contract did not exist until 15:59:11 that day, at an address derived from the attacker's own account and nonce. No authorization naming it can predate it. Separately, a stale batch would name stale nonces, and these name nonces the wallet reached minutes later.

What is left is that whoever did this could produce a signature from Binance 14's key, on content of their choosing, at a moment of their choosing, fifty times over, minutes before using it.

**We stop there, and the stopping point is deliberate.** Stolen key material, malware on a signing host, a compromised signing service, a supply chain compromise of signing software, and an insider all produce a byte-identical artifact on chain. Nothing in these transactions distinguishes between them. We can show the capability. We cannot show how it was obtained, and anyone telling you otherwise from on-chain data alone is guessing.

The capability reading does not rest on this transaction alone, which is the next section.

## The second wallet, 24 seconds later, by a different route

`0xDFd5293D8e347dFe59E90eFd55b2956a1343963d`, **Binance 16**, sent PEPE, LINK, ENA, XAUT, UNI, WBTC, RLUSD and **55,739,800.50 USDT** to the same attacker address at **20:24:47 UTC**, 24 seconds after the Binance 14 sweep. Separate transactions, not part of the batch.

Binance 16 has no delegation. `eth_getCode` returns `0x`. Its USDT transfer, [`0xd4e08d3e…08fd6c49c`](https://etherscan.io/tx/0xd4e08d3ef0cb02a75922913c61984fbf7fe4bbc4b95324735ef27f908fd6c49c) in block 26,300,772, is:

- **type 0x2**, a plain EOA transaction
- `from` Binance 16 itself, nonce 15,703,483
- `to` the real USDT contract, selector `0xa9059cbb`, which is `transfer`
- no `authorizationList`

That is not the delegate contract acting, and it is not a `transferFrom` against a stale approval. **Binance 16's own key signed an ordinary transfer to the attacker.** The wallet now holds 0.20 USDT and 0.0477 ETH.

Two separate Binance hot wallet keys produced attacker-directed signatures within half a minute of each other, by two entirely different mechanisms. A single leaked key does not produce that. One compromised system with access to several hot wallets would, and that is close to what Binance went on to describe.

## What Binance said, and why it fits most of the chain

At 02:25 UTC on 30 October, two hours after our snapshot and two hours after the revocation, Binance published its first preliminary finding. Two sentences matter here, and they are usually quoted one at a time:

> "Binance's initial investigation suggests that the security incident may involve a compromised DevOps engineer's laptop, which allowed an attacker to gain access to a service container and submit unauthorized withdrawal transactions. We have found no evidence of any wallet private key leak."

Read together, those are not in conflict with fifty authorizations signed by Binance 14's key. They are close to the reading several security firms reached independently from the chain.

What the chain establishes is capability: the ability to produce a signature from Binance 14's key, over content of the signer's choosing, at a moment of the signer's choosing, fifty times, minutes before use. What it does not establish is how that capability was obtained, for the reasons set out in the section above, and we do not revisit them.

The denial is a claim about key material moving. A compromised signing path would produce every signature in this piece without a key file ever leaving the building, and an organisation inspecting its key storage could truthfully report nothing missing. So nothing on chain contradicts it. We take no view on how the sentence was meant, only on what the chain can test.

The sentence the chain can test is the other one, and it fits one of the two wallets better than the other.

Binance 16 matches the description exactly. Its transfer was type 0x2, sent by Binance 16's own key, to the real USDT contract, on selector `0xa9059cbb`. That is a withdrawal, and "submit unauthorized withdrawal transactions" describes it precisely.

Binance 14 needed more than that. An EIP-7702 authorization is not a withdrawal. It is a signature over a chain id, a delegate address and a nonce, and it changes what code runs at the address. A service that submits withdrawals has no reason to be able to produce one.

We put that carefully, because it is suggestive and not decisive. Plenty of signing services sign whatever digest they are handed rather than parsing the transaction, and such a service produces both artifacts without anything extra being true. Binance itself said "may involve" and "initial investigation", and has promised a technical post-mortem. The gap between the two wallets is the thing we would want that post-mortem to close, and it is the question we would ask rather than answer.

## The third pot: $823M out of a custody contract

`0xEe7aE85f2Fe2239E27D9c1E23fFFe168D63b4055` is a verified ERC1967Proxy, implementation slot `0xd206ac7f…d9ec8`. Twice in the hour after the sweep, it paid out USDC:

| Time, UTC | Amount | Transaction | From | To |
|---|---:|---|---|---|
| 20:41:23 | 780,000,000 USDC | `0xdc102dd89dded5a8…` | the proxy | `0x5227f603…2f8c` |
| 20:59:47 | 43,000,000 USDC | `0x3b9625b33788daeb…` | the proxy | `0x5227f603…2f8c` |

Both payouts went **straight to the attacker's collection address**, on selector `0x043ff9d2`. Binance 14 was the instruction path, never the destination: the attacker sent the transaction to Binance 14, the delegated code running at Binance 14 called the proxy, and the proxy paid the attacker directly. The proxy's USDC balance is now 2,956,093.65, down from roughly $826M.

This is the half the coverage misses, and it is why a delegation reaches further than a stolen key.

A stolen key lets you spend **what the key holds**. The sweep did that: it emptied a hot wallet. A delegation lets you spend **what the key is trusted for**. Here, a separate contract paid out because the address instructing it was Binance 14, and the delegation meant the attacker could present as Binance 14 to anything on chain that extends that address credit. Those are different blast radii, and the second one produced the $823M.

The innocent reading, that these were scheduled settlements that happened to land mid-incident, does not survive the detail: the attacker's EOA initiated both transactions, and the money went to the address Circle blacklisted shortly afterwards.

**What we do not claim:** the proxy carries no public label. Circle has since blacklisted it, which is worth reporting and still is not ownership. We can show that Binance 14 can make it pay out, and that it did. We do not assert who operates it.

## Binance was the first victim. The other three were the rehearsal.

The same calling account, using the same `0x8a179be4` selector, hit three other delegated wallets earlier the same day. **This piece originally called them victims and called Binance the fourth. That was wrong**, and the correction matters more than the arithmetic one above.

Here is the fact that settles it. ETH held by each wallet at the exact block it was delegated:

| Wallet | Delegated, UTC | Held at that block | Delegate contract |
|---|---|---:|---|
| `0x837810E3…FBc3` | 13:51:35 | **0.000000** | `0x19beE294…70f2bf` |
| `0x9C29BA2D…bB6B` | 13:51:59 | **0.000000** | `0x19beE294…70f2bf` |
| `0x43AEdb9B…04BD` | 16:20:47 | **0.000000** | `0x63e842B0…9c6fAe` |
| Binance 14 | 20:20:59 | **167,445.438154** | `0x63e842B0…9c6fAe` |

All three were empty when they were delegated. The money arrived afterwards, and it arrived from the operator. A single wallet, `0xFD41dA53…58f408`, funded all three: 0.001 and 0.002 ETH at 13:57, then 6.0 USDT, 3.0 USDT, 1.0 USDC, 1.0 USDC and 2.541994 USDT across the next twenty minutes. Each wallet was then drained **14, 17 and 16 minutes** after its funding. That funder's entire life is nine transactions on 2026-10-29; it bought the stablecoins itself on MetaMask Swap, and its only ETH came out of Tornado Cash's 0.1 ETH pool.

**You cannot steal from an empty wallet you then fund yourself.** What the chain shows is an operator deploying a contract, pointing it at wallets it controlled, putting about $13.54 of its own money in, and taking it back out to confirm the contract worked. Wallet three received the second contract, `0x63e842B0…9c6fAe`, which is the one pointed at Binance 14 four hours later. Two generations, tested twice and once.

So the sequence is not four victims. It is a build, a test, a revision, another test, and then the only theft of the day. A thief points a delegation at a wallet that already holds something, which is precisely what happened at 20:20:59.

None of the three has revoked. We read `eth_getCode` on all three at block 26,301,944 and every one still returns its delegation, which is unsurprising for wallets whose owner has no reason to clean them up.

One consequence for the earlier reading. We described **exactly 1.0 ETH** moving out of wallet three at 16:47:23 into `0xe4F9070e…cC74cd`, and then onward to the operator, as that wallet's stolen ETH reaching the attacker. It is the operator's own float completing a circuit: the same source put the ETH in and the same contract's hardcoded 1.0 floor handed it back. A round trip, not a theft, and it is worth saying because we got it wrong the first time.

What does survive from the original reading is the funding, which predates the day entirely. The operator's account was funded directly from Tornado Cash's 0.1 ETH pool (`0x12D66f87…16B8Fc`) as internal transfers: 0.09826 ETH at **2026-10-28 07:39:47 UTC**, 0.09789 ETH at 08:53:59, and 0.09794 ETH at 2026-10-29 08:23:11. The first is **36 hours and 44 minutes** before the sweep. Pre-positioned, not arranged on the day.

## The withdrawal pause, datable to the minute

Binance 14 is a busy wallet, and its nonce is a public clock.

```
block 26,300,000   2026-10-29 17:49:23 UTC   nonce 18,913,220   about 622 tx/hour
block 26,300,768   2026-10-29 20:23:59 UTC   nonce 18,914,823
block 26,301,802   2026-10-29 23:51:35 UTC   nonce 18,914,902   about  22 tx/hour
block 26,301,944   2026-10-30 00:20    UTC   nonce 18,914,905   about   8 tx/hour
```

**Binance 14's own transaction rate fell about 96% at 20:24 UTC**, and four hours later it had not recovered. Whatever was announced and when, the operational stop is visible on chain, datable to the minute, without taking anyone's word for the timing.

The same wallet gives the baseline that makes the theft measurable rather than merely large. Over the 24 hours before, sampled every 300 blocks, Binance 14 operated in a band of 138,505 to 181,490 ETH. The strongest number is not the ratio, it is the shape: the sweep took **100% of the balance minus exactly 1.0 ETH**, and then did the same thing three more times. A working hot wallet oscillates. It does not go to a round 1.0 ETH and hand the remainder to an address four hours old.

For scale, the sweep was 11.7 times the largest hourly net move in that baseline, 14,341 ETH. Treat that as indicative rather than exact: with 25 samples at 300-block intervals, it is the largest *sampled net* move, and a wallet that sent and received 20,000 ETH inside one hour would read near zero.

## The freeze, with the arithmetic

Both headline blacklistings confirmed by direct `eth_call`: `isBlackListed(0x5227f603…)` on USDT returns true, and `isBlacklisted(0x5227f603…)` on USDC returns true. We then pulled every blacklist event on both contracts from the theft block forward. Balances are `balanceOf` at snapshot.

**Tether, nine Ethereum addresses:**

| Address | Block | Held |
|---|---|---:|
| `0x5227f603…2f8c` main beneficiary | 26,300,954 | **1,175,464,711.08** |
| `0xaa246bf6…54a0` | 26,301,021 | 174,999,872.33 |
| `0xb171ca86…c8c3` | 26,301,041 | 30,000,000.00 |
| `0x28C6c062…1d60` **Binance 14** | 26,301,278 | 1,351,530.01 |
| `0x9749292d…c762` | 26,300,954 | 0.00 |
| `0x0ddf0480…697e` | 26,300,955 | 0.00 |
| `0x8d539036…639a` | 26,300,960 | 0.00 |
| `0x7aa4d302…bfd1` | 26,301,009 | 0.00 |
| `0xccbef956…a263` | 26,301,030 | 0.00 |
| | | **1,381,816,113.41 USDT** |

**Circle, four Ethereum addresses:**

| Address | Block | Held |
|---|---|---:|
| `0x5227f603…2f8c` main beneficiary | 26,300,971 | **823,000,000.00** |
| `0xc39e690b…9824` | 26,301,705 | 1,563,812.78 |
| `0x28C6c062…1d60` **Binance 14** | 26,301,812 | 52,363.12 |
| `0xEe7aE85f…4055` the custody proxy | 26,301,819 | 2,956,093.65 |
| | | **827,572,269.55 USDC** |

**Verified frozen on Ethereum: $2,209,388,382.96.** Against a reported $2.38B across all chains, Ethereum alone accounts for most of it, and the remainder is not missing: Tether blacklisted three further addresses on Tron inside the same hour, holding **$378,719,468** between them, which we come to below.

Tether's first Ethereum blacklist landed at block 26,300,954, about **37 minutes** after the theft block. Circle's first landed at 26,300,971, about **40 minutes**.

### Both issuers froze the victim's own wallet before Binance closed the door

We are not going to speculate about why any of these three organizations acted when it did. The order they acted in is a fact, and it is the more interesting thing anyway:

```
22:06:23   Tether blacklists Binance 14             block 26,301,278
23:53:35   Circle blacklists Binance 14             block 26,301,812
23:54:59   Circle blacklists the custody contract   block 26,301,819
00:10:35   Binance revokes the delegation           block 26,301,896
```

By 23:54:59 the victim's own hot wallet could no longer move either major stablecoin, and neither could the custody contract. The delegation that made it worth freezing came off 16 minutes after that.

### Four addresses hold zero, and most of that money is frozen one hop down

Four of the nine Tether-blacklisted Ethereum addresses hold nothing. `0x9749292d…c762` received 500,000,000 USDT at 20:30:11 and was blacklisted **31 minutes 24 seconds later**. `0x0ddf0480…697e` received 200,000,000 USDT at 20:33:23 and was blacklisted **28 minutes 24 seconds later**, one block behind it. Both were already empty.

It is tempting to read that as $700M escaping. The hops say otherwise:

```
0x9749292d  (500M in)    175M -> 0x811f1585…e84C  then on to 0xaa246bf6…54a0: FROZEN, 174,999,872.33
                         145M -> 0xBEEf0296…c555  in four tranches
                         100M -> 0x0000000000be226aFdE21672A5E4AdC45692e69D
                          50M -> 0x74edC79F…Bdd9
                        28.6M -> 0x9b1303EB…

0x0Ddf0480  (200M in)    190M -> 0x8d539036…639a  BLACKLISTED at block 26,300,960
                         ~9.5M -> Uniswap and Curve pools
```

A blacklisted address holding zero means the money moved, not that it got away. At least **$175M of that $700M sits frozen one hop further down**, and the $190M hop was blacklisted in its own right. The freezes kept landing on addresses further along the chain, one and two hops past the ones that read as empty.

That is the accurate version of a finding we nearly got wrong in the other direction, and we explain how in the Limits.

## Where the money that matters is sitting

- **195,460.0032 ETH, about $441M, is sitting completely still** at `0x8532FA14ACAf483729C449b8458aedDb900543D4`, sent there at 20:38:47 UTC. The address is an EOA with a **transaction count of zero**: it has never sent anything, re-confirmed at 00:20 UTC. It is not frozen, and ETH cannot be frozen by an issuer the way USDT and USDC can. That is where the recovery conversation actually is, and none of it is visible in a freeze announcement.
- **At the main beneficiary `0x5227f603…2f8c`**, the two frozen stablecoin balances above come to about $2.0B, inside a token portfolio an explorer valued at $2,175,689,528 plus 2,072.92 ETH at block 26,301,802.
- **About $1,084,344,540 of tokens had moved on** by that block and was still moving, most recent outbound at 23:28:47 UTC, into Uniswap v2, v3 and v4 pools, two GnosisSafeProxy contracts (`0x84A917f5…D87D` and `0xEb311711…7769`), and `0xBEEf0296…c555`. The hop trace above shows a substantial part of that was caught downstream rather than gone.
- **984,249,380 BEAM, about $3.3M, went to the zero address** at 21:21:59. Burned, not laundered.

## Within minutes, bots were spoofing the thief

This is the section that matters most to readers who will never hold a billion dollars, because it is the attack that reaches ordinary wallets.

The sweep landed at 20:24:23. The first spoof landed at **20:30:47 UTC**, six and a half minutes behind it, and three more followed over the next three minutes.

The real moves out of the main beneficiary:

| Time, UTC | Amount | To |
|---|---:|---|
| 20:29:11 | 0.5 ETH | `0x9749292D…C762` |
| 20:30:11 | 500,000,000 USDT | `0x9749292D…C762` |
| 20:31:35 | 0.5 ETH | `0x0Ddf0480…697e` |
| 20:33:23 | 200,000,000 USDT | `0x0Ddf0480…697e` |

And what the bots planted. Three of the four copy an amount and a counterparty. The fourth copies no amount at all:

| Time, UTC | "Amount" | Token | To | Copies |
|---|---:|---|---|---|
| 20:30:47 | 0.50 | fake ETH, `0xE71A494D…B1DFAD` | `0x9749110a…0c762` | the 20:29:11 move, 96s later |
| 20:31:47 | 500,000,000.00 | fake USDT, `0x31635438…3Bbd73` | `0x9749110a…0c762` | the 20:30:11 move, 96s later |
| 20:32:11 | 0.00 | **real** USDT, `0xdAC17F95…831ec7` | `0x9749110a…0c762` | no amount, see below |
| 20:33:59 | 0.50 | fake ETH, `0xE71A494D…B1DFAD` | `0x0dDF2795…1697E` | the 20:31:35 move, 144s later |

The coverage is uneven, which is worth noticing. Both of the attacker's transfers to `0x9749292D…C762` were copied, and the look-alike of that address was then planted a third time by the zero-value row. Only one of the two transfers to `0x0Ddf0480…697e` was copied: **the 200,000,000 USDT leg at 20:33:23 drew no imitation at all.** A bot picking off whatever its cycle happens to catch produces exactly that pattern. Deliberate targeting of the largest theft of the year would not leave the second-largest leg alone.

Four independent proofs that these are poisoning and not movement:

**1. Wrong token contracts.** The 500,000,000 "USDT" is contract `0x31635438E2Aa090A6e40aFE91bd1c0452f3Bbd73`. Real USDT is `0xdAC17F958D2ee523a2206206994597C13D831ec7`. Same number on the screen, entirely different asset, worth nothing.

**2. Homoglyph tickers with invisible characters.** We read `symbol()` off both imitation contracts. The tickers are not spelled with the letters you think they are:

```
fake "USDT":  U+0055  U+206F  U+0053  U+206F  U+0044  U+03A4
              Latin U  invis  Latin S  invis  Latin D  Greek Tau

fake "ETH":   U+0415  U+206F  U+03A4  U+041D  U+206F
              Cyril Е  invis  Greek Τ  Cyril Н  invis
```

U+206F is an invisible format character. Nothing legitimate needs an invisible character in its ticker symbol. That alone is a tell, and it is machine-checkable.

**3. Look-alike destinations matching on the first and last four hex characters.** Written out in full:

```
real  0x9749292d74fd460982d0912ea9515ea24736c762
fake  0x9749110a86941480dbefca1efdc0ceb528a0c762

real  0x0ddf0480016e6bcb2c1f5d190d221fba1320697e
fake  0x0ddf2795c768e21415fe758f7962a6cbf111697e
```

Truncated the way most wallets and explorers display an address, each pair is identical. This is exactly the signature we [measured on Base](/decodes/address-poisoning-base) last week, down to the method.

**4. Decisively: the attacker did not broadcast them.** The three fake-token transfers were sent by `0x1584a8ee…a3c7dd` through a dispatcher contract, and the zero-value real-USDT transfer by `0xd6434d15…206908` through a different one. Neither is the attacker EOA, and neither is the beneficiary. Third parties forged `Transfer` logs carrying the attacker's address in the `from` field, so that the look-alike destination would surface in the attacker's own transaction history, ready to be copy-pasted on the next hop.

One detail makes this worse rather than better. **Each of those spoof transactions is a batch sweep.** Every one forges `Transfer` logs for a dozen or more unrelated victims at a time, and the largest theft of the year is simply one row inside it. Nobody targeted the attacker. An automated poisoner was running its ordinary cycle, picked the transfers up off the mempool like any other, and wrote them in alongside everyone else's.

### The zero-value row, explained

That third row is the mechanism most people have never heard of, and it breaks an assumption nearly everyone holds.

**A wallet can appear in your transaction history without ever having touched you.** On USDT and most ERC-20s, anyone can call `transferFrom(yourAddress, someTarget, 0)`. The amount is zero, so the allowance check passes without you ever having approved anything, and no balance changes. But the contract still emits a `Transfer` event with your address in the `from` field. Explorers and wallets read those events to build history. So a stranger can write a line into your history, from you, to an address of their choosing, for the price of gas.

That is why "it is in my history, so I must have sent to it" is not safe reasoning, and it is why a look-alike of an address you really did pay can sit one row away from the real one.

**The lesson, which is the one we sell:**

- **Match a token by its contract address, never by its ticker.** Tickers are strings chosen by whoever deployed the contract. Two of them here contained invisible characters.
- **Never copy a counterparty address out of transaction history.** Take it from the counterparty, or from your own records, and compare the middle characters, not just the first four and last four.

The poisoning fired on a thief moving billions, inside the first seven minutes, as a side effect of a routine batch. It will fire on a $200 payment just as readily, and the $200 payment has no issuer who will freeze it.

## What we could not verify

- **The Tron leg, reported at about $630M.** We can see that Tether blacklisted three Tron addresses between 21:09 and 21:21 UTC, holding $312,729,468, $65,990,000 and zero, and that the previous blacklist event on that contract was at 18:24 UTC, two hours before the theft. Those three are large, round, and inside the same window as the Ethereum freezes. **We have not proved they belong to this incident**, because we never had a claimed Binance Tron address to test against. So we count them when asking whether the reported freeze total is covered, and we do not count them as a verified Binance loss.
- **The Bitcoin leg, reported at 18,270 BTC.** The three largest cold wallets publicly attributed to Binance are untouched: `34xp4vRo…` holds 248,597.59 BTC with no activity since 2026-10-25, `3M219KR5…` holds 173,984.86 BTC, and `bc1qjasf9z…` holds 96,932.41 BTC, about 519,500 BTC between them. That **neither supports nor refutes** the claim, since the reported amount could come from wallets we have not identified.
- **Any cross-chain total.** Two of the three legs are unverified as Binance losses, so **we do not publish a cross-chain aggregate** and would not repeat one.
- **Who the attacker is.** Etherscan tags the EOA "Binance Hot Wallet Exploiter," and that rests on a single explorer page. It is a label, not an identification. Nothing beyond it is supported by what we read.
- **How the signing capability was obtained.** See the section above. The chain shows capability and is silent on its source.
- **Who operates `0xEe7aE85f…4055`.** Behaviour only, no label, and Circle blacklisting it does not change that.
- **About 26,000 ETH of reconciliation** between what entered and what left the main beneficiary address. This is genuinely open. Our own working notes attributed most of it to a 28,005.60 ETH payment out of the custody proxy. That payment does not exist: the transaction in question moved two USDC amounts totalling about $10,540 and no ETH at all, the proxy's ETH balance has not changed all day, and the transaction looks like Binance's own routine operations rather than the attacker's. So the gap is unexplained.

## Limits

- **One snapshot, one chain.** Block 26,301,944, 2026-10-30 00:20 UTC, Ethereum mainnet, except the Tron blacklist figures, which are labelled where they appear.
- **A single-chain measurement cannot test a multi-chain claim, and we nearly published that mistake.** On Ethereum alone, the USDT freeze comes to $1,381,816,113 against $1.56B reported, which reads as $178M missing. It is not missing. The Tron blacklists in the same hour add $378,719,468, taking USDT to about $1.76B, roughly $200M **above** the reported figure. We had measured one chain and were about to call the difference a shortfall in two companies' public numbers during a live crisis. The Ethereum total in this piece is stated as an Ethereum total for that reason.
- **The ETH figure is final, not a floor,** because the delegation was revoked at 00:10:35 and nothing could be taken after that. It is final for that reason alone. The four calls at 23:36:47 to 23:38:23 took nothing, but the sweep after them took 2,961.9108 ETH, so the attacker had not finished; the window closing is what ended it. Any figure published while the window was open was a floor.
- **Dollar values move; quantities do not.** Totals are priced at our snapshot. Our Ethereum-only picture runs higher than some reported ones partly for that reason and partly because it counts five sweeps rather than one.
- **The 11.7x baseline ratio is indicative.** It rests on 25 balance samples at 300-block intervals, so it measures the largest sampled net move, not the largest true hourly flow.
- **Labels are third-party.** "Binance 14", "Binance 15", "Binance 16" and "Binance Hot Wallet Exploiter" are Etherscan's; the Tron labels are Tronscan's. We did not independently establish wallet ownership for any of them.
- **No private individual is named here,** and none of the addresses above is attributed to a person.
- **This is observation, not accusation.** Where we draw an inference, such as signing capability from 50 forward-dated authorizations, we say so, we say what it rests on, and we say where it stops.

## Method and sources

- **Two independent passes, and a thing they both missed.** An investigation pass and an adversarial re-verification pass, the second working from its own queries rather than the first's data, which is what caught the revocation, the fourth sweep, the 35th-of-50 nonce, the Tron freezes and the non-existent ETH payment. Both passes nevertheless stopped reading the operator's account at nonce 21 and missed the fifth sweep at nonce 22, which a third pass on 2026-10-30 found. We published a total and called it final without reading to the end of a 23-transaction account. Figures here are the re-verified ones, corrected.
- **Archive reads:** `mainnet.gateway.tenderly.co`, a keyless archive endpoint, for `eth_getCode`, `eth_getBalance` at historical blocks, `eth_getTransactionByHash`, `eth_getTransactionReceipt`, `eth_getBlockByNumber`, `eth_getTransactionCount` and `eth_call`. Read-only, paced at two requests a second or under.
- **Transaction and transfer history:** `eth.blockscout.com` for address transaction lists, token transfer lists, internal transactions and token balances, and for the portfolio valuations explicitly labelled as such.
- **Tron:** `api.trongrid.io`, public and keyless, for `AddedBlackList` events on the USDT contract `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` and for the resulting account balances.
- **Labels:** one Etherscan page fetch.
- **The 50 authorizations** were read from the `authorizationList` of the type-4 transaction itself, not from a summary, and chain ID, delegate address, authority and nonce were checked on every one. The consumed nonce was established by reading `eth_getTransactionCount` either side of the block and walking the transactions inside it in index order.
- **The sweep totals** are archive `eth_getBalance` immediately before and after each of the attacker's calls, not a sum of transfer logs.
- **Every elapsed time in this piece** (3h49m36s, 3 minutes 24 seconds, 3 minutes 12 seconds, 24 seconds, 6 minutes 24 seconds, 96 to 144 seconds) was computed from block timestamps rather than carried over from a summary.
- **No ChainWard production RPC key was used, and no production credentials were touched.** Nothing in this investigation wrote to any chain.

> Disclosure: ChainWard sells wallet and counterparty checks, including the address-poisoning check this incident demonstrates, and publishes a free rug check at chainward.ai. It has no relationship with Binance. Corrections are welcome at hello@chainward.ai.
