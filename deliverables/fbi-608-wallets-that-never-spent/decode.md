---
title: "The FBI Listed 628 Addresses. Not One of the 608 Ethereum Wallets Has Ever Spent."
subtitle: "All 608 carry nonce 0 at block 26,316,390. Nothing is derived from them yet, and the attacker's own account is not on the list."
plain: "The FBI published 628 addresses holding money stolen from Binance and asked node operators to block anything derived from them. We checked all 628. The Ethereum wallets have never sent anything, so nothing is derived from them yet. Blocking the list as written is cheap. The hard part starts the day one of them moves."
date: "2026-11-01"
slug: "fbi-608-wallets-that-never-spent"
seoTitle: "FBI TraderTraitor Binance Address List, 31 Oct 2026: All 608 Ethereum Wallets Have Nonce 0, What 'Derived From' Actually Reaches, and the 18,270 BTC Leg"
---

# The FBI Listed 628 Addresses. Not One of the 608 Ethereum Wallets Has Ever Spent.

**Everything here is MEASURED at Ethereum block 26,316,390, 2026-11-01 00:40:35 UTC**, unless labelled CLAIMED. Quantities, nonces and block numbers do not move. Dollar figures do: they are quotes at 2026-11-01 00:47 UTC, with ETH at $2,257.57, BTC at $77,554 and SOL at $95.57.

On 31 October 2026 the FBI published an alert attributing the theft of more than $6 billion from Binance, "on or about October 29, 2026", to actors it tracks as **TraderTraitor**. With the USSS and IRS-CI it asked a named list of private companies to do something specific:

> FBI, USSS, and IRS-CI are urging private sector entities including THORNode operators, RPC node operators, instant exchanges, DeFi services, blockchain analytics firms, and other virtual asset service providers to block transactions with or derived from addresses TraderTraitor actors are using to launder these stolen assets.

That is a named group with a dated obligation. "Derived from" is the hard part, and we could not find a published number for how far it reaches. So we measured it.

## The short answer

- **All 608 Ethereum addresses on the FBI's list have nonce 0.** Not one has ever originated a transaction. None has contract code, and none carries an EIP-7702 delegation. They are pure sinks. MEASURED at block 26,316,390.
- **So the forward closure is empty.** Nothing has been "derived from" any listed Ethereum address, because nothing has left one. An RPC operator who implements "derived from" literally, today, blocks exactly the 608 addresses and nothing further.
- **The list is a vault, not a trail.** It holds **551,659.0760 ETH**, about **$1.245B**, and six addresses hold 92% of it.
- **The attack infrastructure is not on the list.** The attacker's operating account, the delegate contract, both drained Binance wallets, the custody proxy that paid out $823M and the address that received about $2B in frozen stablecoins are all absent. We checked each by direct string search of the alert: zero occurrences.
- **Our independent measurement and the FBI's list overlap in exactly three addresses**, and all three are the terminal ETH wallets we had already identified as the places the money stops.
- **The Bitcoin leg resolves an open item in our own earlier decode.** The 19 listed BTC addresses hold **18,270.20078000 BTC**, matching the reported figure we had previously been unable to verify. Seventeen of them hold exactly 1,000 BTC. None has ever spent an output.
- **The dispersal was still running when the alert went out.** The 608 wallets were funded in 614 transfers between 2026-10-30 02:03:23 and 2026-10-31 18:22:59 UTC, at roughly 310 a day.
- **Half of the list's apparent counterparties never sent it any money.** Of 468 addresses appearing in the 608 wallets' inbound history, **241 sent less than 0.001 ETH**, and 72 of those are look-alikes of a genuine funder, matching on the first four and last four hex characters. Anyone building a blocklist by walking counterparties ingests them.
- **Follow contracts and the rule stops meaning anything.** Our forward walk reaches WETH at hop 2. WETH has **3,359,912 holders**. It also reaches the THORChain Router at hop 2, which is the contract THORNode operators were asked to police.
- **$6 billion does not reconcile against the published list, and should not be expected to.** The three legs on the list come to about **$2.755B**, roughly 46% of $6.0B. The rest is elsewhere, and some of it is on chains we did not measure.
- **Ethereum, Bitcoin and Solana only**, and the Bitcoin and Solana work is confined to the addresses the FBI published. We publish no cross-chain total of our own.

## Where we got the list, and how we know it is the real one

This matters more than usual, because working from a wrong list on a sanctions topic would be worse than publishing nothing.

**fbi.gov refuses automated requests.** Every scripted fetch we tried returned HTTP 403, including the alert itself, its `@@download/file` variant and the section's own `atom.xml` feed. That is a normal anti-bot posture and not a comment on the FBI.

The usual fallbacks were unavailable. **The Internet Archive was offline** during this work, serving a "Temporarily Offline" notice rather than snapshots. **archive.today returned 404**: no capture. And unlike the February 2025 Bybit alert, which was mirrored as IC3 PSA I-022625-PSA, **there is no IC3 mirror of this one**. The IC3 PSA index for 2026 is reachable and stops at PSA261023; direct probes for PSA261030, PSA261031 and PSA261101 all returned 404.

So we read it two independent ways:

| Channel | What it is | Result |
|---|---|---|
| 1 | `r.jina.ai` text extraction of the alert URL | 608 ETH, 19 BTC, 1 SOL |
| 2 | The page rendered directly in a normal desktop Chrome, text read from the DOM | 608 ETH, 19 BTC, 1 SOL |

We then hashed the two address sets rather than eyeballing them. Sorting the Ethereum addresses, lowercasing and joining them with newlines gives the same SHA-256 on both channels:

```
c73a1b0a07ec2f2a05dcd1a5fb296429782112625b11c5655d98db93a3077448
```

608 lines, 608 unique, no duplicates. Both reads were taken at **2026-11-01 00:33 UTC**, about seven minutes before the block everything else here is pinned to. That timestamp matters: the alert is a live page and the FBI can add addresses to it. Anything below describes the list as it stood at that minute, and the hash above is how you check whether the copy you are holding is the same one.

A third, fully independent check: an outlet that counted the alert itself reported 628 addresses split 608 ETH, 19 BTC, 1 SOL, which matches exactly.

**What this establishes and what it does not.** Two retrieval paths agreeing to a hash rules out transcription error and truncation on our side. It does not make us the authoritative copy. Anyone relying on this operationally should take the list from fbi.gov in a browser.

## The census: 608 wallets, zero spends

This is the central measurement, and it is cheap enough that anyone can repeat it.

An externally owned account can only move value by originating a transaction, and originating a transaction increments its nonce. **A nonce of 0 means the address has never sent anything.** We read `eth_getTransactionCount` and `eth_getCode` for all 608 at one pinned block:

```
block 26,316,390    2026-11-01 00:40:35 UTC

  listed Ethereum addresses            608
  with nonce != 0                        0
  with contract code                     0
  with an EIP-7702 delegation            0
  holding a zero balance                 0
```

Every one of them has received funds and none has moved them. The `eth_getCode` result does double duty here: a delegated wallet returns code beginning `0xef0100`, the mechanism at the centre of [our decode of the Binance incident itself](/decodes/binance-7702-delegation). None of the 608 is delegated.

**What they hold:**

| | ETH | Share of listed ETH |
|---|---:|---:|
| Largest single address | 197,460.0090 | 35.8% |
| Top 3 | 413,477.26 | 75.0% |
| Top 6 (all above 10,000 ETH) | 505,617.7352 | 91.7% |
| **All 608** | **551,659.0760** | **100%** |

Median holding is 55.0000 ETH, mean is 907.3340, smallest is 0.791020. The distribution is two populations: six large terminals, and a long tail of 568 wallets holding between 10 and 1,000 ETH that together hold 38,606.52 ETH.

The tail is structured rather than organic. **124 of the 608 hold a whole number of ETH exactly**, including 24 holding exactly 100.0000 ETH and 16 holding exactly 80.0000. On the Bitcoin side the pattern is starker still: 17 of 19 addresses hold exactly 1,000 BTC.

## So how far does "derived from" actually reach?

The rule determines the number, so here is ours, stated before the result.

> **Expansion rule.** An address B is *derived at hop n+1* from the hop-n set if some address A in hop n sent B value, by any of: an external transaction A to B with value above zero; an internal transaction A to B with value above zero; or an ERC-20 or ERC-721 transfer with `from` = A and `to` = B. Direction is **forward only**: receiving funds from a tainted address taints you, sending funds to one does not. Zero-value contract calls do not taint. We compute two variants at every hop. **Pruned** records a contract recipient but does not expand through it, so routers and pools end a branch. **Naive** follows everything.

Applied to the FBI's list, the answer is immediate and it is the whole finding:

**Hop 1 is empty. Zero addresses.**

Not because we bounded the search, but because the search has nothing to start from. Nothing has ever left any of the 608. The blast radius of "derived from" the published Ethereum list, measured at block 26,316,390, is **zero addresses**.

That is a real and useful answer, and it is the opposite of what we expected to find.

### The hop that does exist points backwards

"Block transactions **with** or derived from" has two clauses, and only the first currently bites. We pulled the complete inbound history of all 608 wallets: who sent to them.

| | Count |
|---|---:|
| Addresses appearing in the 608 wallets' inbound history | 468 |
| Sent 0.001 ETH or more at least once (genuine funders) | **227** |
| Sent only dust, above zero but under 0.001 ETH | 176 |
| Sent only exactly zero | 65 |
| **Sent effectively nothing** | **241 (51%)** |

**Half of the apparent counterparty set never sent these wallets any money.** The median "dust" transfer is 0.000000001 ETH, one gwei.

A large and verifiable share of them is address poisoning, carrying the signature we [measured on Base](/decodes/address-poisoning-base) and then watched fire on the Binance attacker inside seven minutes. **53 of the 65 zero-value senders, 82%, match a genuine funder on both the first four and last four hex characters**, which is how most wallets and explorers abbreviate an address. Nineteen of the dust senders do too: **72 look-alikes in total**.

We are deliberately not calling all 241 poisoning. Seventy-two are look-alikes of a real funder and that is hard to explain innocently. The rest sent dust without a matching twin, and dust has other sources: failed scripts, spam airdrop mechanics, gas top-ups. What is measured is that 241 of 468 sent effectively nothing, and that at least 72 were built to be mistaken for something else.

One worked example, verified end to end:

```
2026-10-31 11:23:47 UTC   100.0 ETH   0x09b177e2227c7f351488c182c9b935d7ef7cb194  (real funder)
2026-10-31 11:28:47 UTC   0 wei       0x09b1f2b8662adf1aa17581e119acf6265d21b194  (look-alike)

                 both into listed wallet 0x8df39ecc...456ce
                 abbreviated, the two senders are identical: 0x09b1...b194
```

The zero-value transaction is [`0xb8c47c38…9d103b23`](https://etherscan.io/tx/0xb8c47c38455c92cad28ba40569d0ff409c649cb1bc0d4e79168633989d103b23), block 26,312,447, value 0 wei, empty input, sent from an account at its own nonce 12. We confirmed it on an archive node independently of the explorer that surfaced it. **Five minutes** after the real 100 ETH landed.

The operational consequence is direct. **An analytics firm or node operator that builds a "derived" set by walking the counterparties of the FBI's list will ingest 241 addresses that never sent those wallets anything**, 72 of which exist purely to be confused with an address that did. None of that is the FBI's doing. It is a parasite that attaches itself to any address list made public.

### What it costs once the money does move

The 608 have not moved. The 227 addresses that fed them have. That set is the nearest thing to a live money graph, and it is squarely inside what the FBI asked operators to block: addresses "TraderTraitor actors are using to launder these stolen assets."

So we ran the forward expansion from the 468 inbound addresses, pruned at contracts, sampling because a full walk would breach our own rate limits:

| Hop | Expanded | of frontier | Recipients found | of which contracts | Histories truncated |
|---|---:|---:|---:|---:|---:|
| 1 | 40 | 468 | 218 | 55 | 1 |
| 2 | 37 | 218 | 113 | 23 | 2 |
| 3 | 34 | 113 | 946 | 298 | 12 |

Cumulative distinct addresses touched on that sampled walk: **1,612**, using 395 HTTP requests.

Read it carefully, because the shape matters more than the totals. Mean fanout is **5.45** at hop 1 and **3.05** at hop 2: narrow, which is what purpose-built dispersal wallets look like. Then it jumps to **27.8** at hop 3, and **12 of the 34 addresses we expanded at hop 3 had more history than we read**. Hop 3 is therefore a floor, not a count.

Scaling the measured hop-1 fanout to all 468 seeds implies roughly **2,500 addresses at hop 1** before deduplication. That is an extrapolation from an 8.5% sample, not a measurement, and we label it as such.

### The point where the rule stops meaning anything

Pruning at contracts is doing enormous work in that table. Drop it and the walk reaches shared infrastructure almost immediately:

| Contract | Label | First reached |
|---|---|---|
| `0xc02aaa39…756cc2` | WETH9 | **hop 2** |
| `0xd37bbe57…ad7146` | THORChain_Router | **hop 2** |
| `0x3fc91a3a…2b7fad` | Uniswap UniversalRouter | **hop 2** |
| `0x88e6a0c2…3f5640` | UniswapV3Pool | hop 2 |
| `0x00000000219ab540356cbb839cbe05303d7705fa` | Beacon Chain DepositContract | hop 3 |

**WETH has 3,359,912 holders.** If WETH is in your derived set at hop 2, then under a naive rule every one of those 3.36 million addresses is derived at hop 3. The set stops being a blocklist and becomes the chain.

The THORChain Router is the sharpest version of the problem. The FBI's alert names THORNode operators first. Our forward walk reaches the router those operators run **at hop 2**.

We are not suggesting anyone would actually block WETH. That is the point. **Every workable implementation of "derived from" has to prune somewhere, the pruning rule is doing all the real work, and the alert does not specify one.** Two firms applying the same instruction in good faith will produce different lists, and neither will be wrong by the text.

### One more contaminant, from inside the expansion

Of the 55 contracts the walk reached at hop 1, **30 are proxies whose implementation contract is named `Poisoner`**, all pointing at the same implementation, `0xe6B97aA1490c93c28A14D86C13C9dc9c950643ed`. Five more point at that same implementation without a resolved name: 35 of 55.

To be precise about attribution, because it is the kind of claim that gets repeated loosely: Blockscout does not label those addresses "Poisoner". Each is a verified minimal proxy, and the *implementation* behind it carries the name `Poisoner` on Blockscout. The label belongs to the implementation contract.

Two more of the 55 are proxies to `EIP7702StatelessDeleGator`, the delegation pattern at the centre of the original incident.

## What the list shares with what we measured independently

We published a block-level measurement of the same event on 30 October, before any attribution. It is an honest test of both: two parties looking at one event from different starting points.

We took every address named anywhere in that work, 63 distinct prefixes, and matched them against the 608. There were **no prefix collisions inside the FBI's list**, so the match is unambiguous.

**Exactly three are on the list:**

| Our label | Address | Holds now | On list |
|---|---|---:|---|
| Terminal ETH wallet 1 | `0x8532fa14…543d4` | 197,460.0090 ETH | **yes** |
| Terminal ETH wallet 2 | `0x54401f80…bc942` | 40,600.6718 ETH | **yes** |
| Terminal ETH wallet 3 | `0x03b0ee5d…020ea` | 17,260.1048 ETH | **yes** |

All three are the addresses our follow-up work had identified as where the converted ETH stops, each with nonce 0 and never a spend. Independent corroboration, by two different routes, of the same three endpoints.

**And these are not:**

| Our label | Address | On list |
|---|---|---|
| Attacker operating account | `0x7c8601d4…b5ca0` | no |
| Delegate contract used against Binance 14 | `0x63e842b0…9c6fae` | no |
| Binance 14, the delegated wallet | `0x28c6c062…21d60` | no |
| Binance 16, drained by a different method | `0xdfd5293d…43963d` | no |
| Main beneficiary, about $2B frozen there | `0x5227f603…b2f8c` | no |
| Custody proxy that paid out $823M | `0xee7ae85f…b4055` | no |
| The two swap wallets that did the ETH conversion | `0xa97bf783…e8d10`, `0xe7024ab8…87958d` | no |
| Rehearsal wallets and their funder | 4 addresses | no |
| Tornado Cash 0.1 ETH pool | `0x12d66f87…16b8fc` | no |
| Every intermediate hop, both GnosisSafeProxies | 10 addresses | no |

**This is not a gap in the FBI's work, and it would be a cheap misreading to call it one.** The alert says precisely what the list is: addresses "holding or have held assets from the theft". Every one of the 608 is holding. The list does what it says.

But the operational consequence is real, and it is the thing an RPC operator needs to know before acting: **the published list is a list of destinations, not of the operation.** An operator who blocks exactly the 608 does not block the account that signed the sweep, the contract that executed it, or either wallet that performed the ETH conversion. Those are the addresses that transact. The listed ones, so far, do not.

## The Bitcoin leg, and an open item we can now close

Our own decode said this about Bitcoin:

> The three largest cold wallets publicly attributed to Binance are untouched... That **neither supports nor refutes** the claim, since the reported amount could come from wallets we have not identified.

The reported figure was 18,270 BTC. The FBI published 19 Bitcoin addresses. We read all 19 on a public, keyless Bitcoin API:

```
total held across the 19 listed BTC addresses   18,270.20078000 BTC
addresses that have ever spent an output                      0
addresses holding exactly 1,000.0000 BTC                     17
the other two                             832.5000 and 437.7000
```

For every one of the 19, the lifetime received total equals the current balance to the satoshi. **Nothing has moved.** At $77,554 that is about **$1.417B**, and it makes the Bitcoin leg the largest single component of the published list.

We flagged the 18,270 BTC figure as unverified a day ago. It is now verified to eight decimal places, against a list we did not compile, using an API that has nothing to do with the party that reported it. We are recording that as plainly as we recorded the doubt.

**The Solana address needs a weaker claim.** `AffzFDKZ…gBEaU` holds **970,554.159803 SOL**, about $92.8M. Solana has no nonce, so we cannot make the "never spent" statement we can make on the other two chains. What we can say: in the most recent transaction referencing it, 2026-11-01 00:44:08 UTC, it was **not a required signer** and its balance changed by exactly **0.000000 SOL**. It is being referenced by other people's transactions, not spending.

## Does $6 billion reconcile?

Partly, and the honest answer requires saying which parts we can see.

**What is on the published list, MEASURED:**

| Leg | Amount | Value |
|---|---:|---:|
| 608 Ethereum addresses | 551,659.0760 ETH | $1,245,408,980 |
| 19 Bitcoin addresses | 18,270.20078 BTC | $1,416,927,151 |
| 1 Solana address | 970,554.1598 SOL | $92,755,861 |
| **Total** | | **$2,755,091,993** |

That is **about 46% of $6.0 billion**. The gap is not a discrepancy, and reading it as one would repeat a mistake we nearly published last week. Three reasons it should be expected:

1. **The list is holdings, not losses.** Assets frozen in place by an issuer are not sitting in a TraderTraitor wallet. We measured **$2,209,388,382.96** frozen on Ethereum in USDT and USDC at our earlier snapshot, at addresses that are **not on the FBI's list**. The two sets are disjoint: we checked. Add them and you are at roughly **$5.0B** before counting anything else.
2. **Conversion is in progress, by the FBI's own account.** The alert says the actors are "converting stolen assets primarily into Ethereum". Our figures support that with a number: the list holds 551,659 ETH, which is **3.196 times** the 172,624.4046 ETH that was actually swept out of Binance 14. The difference had to be bought with something, and the something was converted stablecoins and tokens.
3. **Other chains.** TRM reported movement across ten blockchains. We measured three, and two of those only at the addresses the FBI published.

**A single-chain measurement cannot test a multi-chain claim.** We put that sentence in the last decode after nearly publishing the opposite, and it applies again. We are not asserting that $6 billion is right or wrong. We are saying that $2.755B of it is sitting in 628 published addresses, that a further $2.2B is frozen elsewhere on Ethereum, and that we cannot see the rest.

## What an operator can actually do this week

The useful consequence of "all 608 have nonce 0" is that the expensive version of this problem has not started yet.

- **Exact-match blocking of the 628 is cheap and, today, sufficient.** There is no derived set. A hash-set lookup covers the entire published instruction.
- **The event worth watching is the first spend.** The moment any listed address reaches nonce 1, "derived from" becomes non-empty and every downstream question starts. That is 608 `eth_getTransactionCount` reads per poll, which is a few seconds of work on any node, and it is a far better use of effort than pre-computing a taint graph for a set that has never moved.
- **Whatever you build, write down your pruning rule.** Our hop-2 set contains WETH and the THORChain Router. Any rule that does not stop at shared contracts will reach 3.36 million addresses and stop being useful. The alert does not specify where to stop, so the choice is yours and it should be explicit.
- **Do not build the derived set from counterparty history.** Half the inbound counterparties of these wallets sent them nothing. Filter on value actually transferred, match tokens by contract address rather than ticker, and never match an address on its first and last four characters.

## Limits

- **One pinned block, three chains, one list.** Ethereum block 26,316,390, 2026-11-01 00:40:35 UTC. Bitcoin and Solana were read only at the addresses the FBI published, within about ten minutes of that block.
- **The list itself is a moving target.** We read it at 2026-11-01 00:33 UTC. It is a live page and the FBI can extend it; a later copy with more addresses would not contradict anything here, it would simply be a different list. The SHA-256 above identifies the exact set we measured.
- **Everything about the forward closure is time-bound.** "Nothing has been derived" is true at that block and could stop being true at the next one. This finding has a shelf life measured in blocks, and that is the most important caveat in the piece.
- **The expansion is sampled, and we say where.** 40 of 468 at hop 1, 37 of 218 at hop 2, 34 of 113 at hop 3, with at most 3 pages of 50 items per endpoint per address. **12 of 34 hop-3 expansions hit that page limit**, so the 946 figure is a floor. The 2,500 hop-1 extrapolation is arithmetic on a sample, not a count.
- **The inbound scan has two known gaps.** One listed wallet, `0xc7d220e1…1ccd6`, returned a request error and contributed no inbound records. Five wallets, all among the six largest, had more than 50 inbound transfers and were read only to the first page. So **227 genuine funders is a floor**, and the true figure is higher.
- **The poisoning classification is a heuristic.** We call a sender poisoning if it sent under 0.001 ETH and matches a genuine funder on first-four and last-four hex. That is strong evidence and not proof of intent; a sender could be both. The 100 ETH example is verified individually and is not a heuristic.
- **We did not test the attribution.** Whether DPRK actors are responsible is the FBI's assessment, published by the FBI. Nothing on chain tests it, we did not try, and we neither endorse nor dispute it. Everything in this piece is about what the published addresses do, not about who controls them.
- **We did not confirm the Solana address has never spent**, for the reason given above.
- **No individual is named here**, and none of these addresses is attributed to any person.
- **Labels are third party.** `WETH9`, `THORChain_Router`, `UniversalRouter`, `Poisoner` and `EIP7702StatelessDeleGator` are Blockscout's, read from its API. We did not independently establish what any of those contracts is.
- **This is observation, not accusation.** Where we draw an inference we say what it rests on and where it stops.

## Method and sources

- **The list** was retrieved twice by independent paths and reconciled by SHA-256 over the sorted lowercased Ethereum set. Provenance, failures and hash are in the section above. Read-only throughout.
- **Nonce, code and balance** for all 608: `eth_getTransactionCount`, `eth_getCode` and `eth_getBalance` against `mainnet.gateway.tenderly.co`, a keyless archive endpoint, in JSON-RPC batches of 5 at 2 requests per second, pinned to block 26,316,390. The census was then re-run at that pinned block rather than at `latest`, so the claim has a fixed "as of".
- **Inbound history and the expansion:** `eth.blockscout.com/api/v2`, external transactions, internal transactions and token transfers, `filter=to` and `filter=from`, 2 requests per second.
- **Bitcoin:** `mempool.space/api/address/{addr}`, public and keyless. "Never spent" is `funded_txo_sum` equal to the current balance.
- **Solana:** `api.mainnet-beta.solana.com`, `getBalance`, `getSignaturesForAddress` and `getTransaction`, public and keyless.
- **Prices:** CoinGecko spot at 2026-11-01 00:47 UTC, used only for the dollar columns.
- **The poisoning transaction** was read from Blockscout and then re-read from the archive endpoint by hash, and the `from`, `to`, `value` and `input` fields matched.
- **No ChainWard production RPC key was used**, no production credentials were touched, and nothing in this investigation wrote to any chain or contacted any party.

> Disclosure: ChainWard sells wallet and counterparty checks, including the address-poisoning check this piece demonstrates, and publishes a free rug check at chainward.ai. It has no relationship with Binance and none with any agency named here. This piece reports what the FBI published and what the chain shows; it takes no position on the attribution itself. Corrections are welcome at hello@chainward.ai.
