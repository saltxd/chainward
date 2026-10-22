---
title: "A Look-Alike of Our Wallet Showed Up 104 Seconds After We Got Paid"
subtitle: "One Base wallet copied about 439,000 payments in a week with look-alike addresses, for $53 of gas. It copies plain sends, not x402 payments."
plain: "A bot on Base copies about 1 in 9 plain USDC payments within minutes, putting an address that starts and ends like the real one into both wallets' histories. Before you pay, refund or pay out, get the address from the payee or your own records, never from your history, and paste it here before you send."
date: "2026-10-22"
slug: "address-poisoning-base"
seoTitle: "Address Poisoning on Base, Measured: Look-Alike Addresses and Imitation USDC in Your Wallet History (Oct 2026)"
---

# A Look-Alike of Our Wallet Showed Up 104 Seconds After We Got Paid

On Oct 21 at 15:43 UTC, Would Pay Again, a newsletter about x402 payments, paid ChainWard's treasury two 10-cent bounties on Base, each a plain USDC transfer. At 15:45:01, 104 seconds after the second one, a single transaction wrote a new line into each wallet's history. Ours shows 0.1 "USDC" arriving from an address that starts and ends like Would Pay Again's payout wallet. Theirs shows 0.1 "USDC" sent to an address that starts and ends like our treasury.

No money moved. The token is an imitation and the two addresses are look-alikes. This is address poisoning: it works when someone copies one of those addresses from their history the next time they pay.

We measured the wallet that sent that transaction for one week, Oct 14 16:02:45 to Oct 21 16:02:45 UTC (Base blocks 52,602,209 to 52,904,609), and traced what it has caught since it started in April. Basescan labels [that wallet](https://basescan.org/address/0x43b2f01186fda9814c5f40770554ac68fd8304bd) "Fake_Phishing2822323"; we call it the operator wallet. Values are as of Base block 52,906,634 (Oct 21, 17:10 UTC) unless a row says otherwise. Dollar figures use the Oct 21 ETH price, $2,517.65.

Short version:

- **Cheap and fast.** In the week, the operator wallet planted 884,017 look-alike transfers in 5,446 transactions, copying about 439,000 real payments for 0.0209 ETH of gas (about $53). Half its USDC copies landed within 142 seconds.
- **It copies plain sends.** Every copy we classified copied a USDC transfer the paying wallet sent itself. In a 1% sample of the week it copied about 1 in 9 of those.
- **It copied no x402 payment.** An x402 payment is signed by the payer but sent to the chain by a facilitator, and none of the 183,951 token payments it copied was one. x402 sellers were copied only when they sent or received a plain transfer.
- **Its catch is small and slow.** This week we found one payment to a look-alike, 0.00003 WETH (about $0.08), and catches often come a day or more after the plant. Since April we traced six: 0.751 ETH, 134 USDC and 0.00003 WETH, about $2,025 at the Oct 21 ETH price. The biggest, 0.5 ETH, came 33 hours after its look-alike was planted.
- **In and out through ChangeNOW labels.** Its first 0.02 ETH came from a wallet Basescan labels "ChangeNOW: Hot Wallet"; its 258.97 USDC left on Sep 29 for one labeled "ChangeNOW: Hot Wallet 2".
- **What to do:** take the address from whoever you are paying, never from history; compare the middle characters; paste it into a check before you send.

---

## What landed in two wallets' histories

| Oct 21, UTC | What happened | Source |
|---|---|---|
| 15:43:13 | Would Pay Again's payout wallet sends our treasury 0.1 USDC (bounty #101), a plain USDC transfer | [tx](https://basescan.org/tx/0xcec19f99cfdaf19108dc7313855f2fe0eff23b9f0ec035fdf55047c6f40d0446), block 52,904,023 |
| 15:43:17 | The same again (bounty #105) | [tx](https://basescan.org/tx/0x49652a25ec3aadf5b4abe30fcb3c61777593989d50f76d2e44669903733817a4), block 52,904,025 |
| 15:45:01 | One transaction from the operator wallet writes 200 imitation "USDC" transfers, copying 100 payments made in the previous 44 to 136 seconds. One pair copies the payouts to us. Another copies a payout Would Pay Again made to another contributor | [tx](https://basescan.org/tx/0xfb329dcb45f3e01ef2d65ac9b5404dad3513c57e4bab5f89205baea8c970bb64), block 52,904,077 |

Two identical payouts got one copy. In the week, the bot copied almost every payer and payee pair only once, not every payment between them.

Here is what was planted, shortened. Cut to the first and last 4 characters, the way many wallets and explorers show an address, each look-alike is identical to the real one:

| Address | First 4 and last 4 | Longer view |
|---|---|---|
| Would Pay Again's payout wallet | 0x2284…4bfb | 0x228440f8…894bfb |
| Its look-alike | 0x2284…4bfb | 0x22848226…b94bfb |
| ChainWard's treasury | 0xf7ee…67cd | 0xf7ee6513…2667cd |
| Its look-alike | 0xf7ee…67cd | 0xf7eea0ba…1667cd |

Both look-alikes match the real address in the first 4 and the last 5 characters. So do 99.95% of the look-alikes in its USDC copies that week (182,050 of 182,140, on both sides). The difference is in the middle.

The "USDC" is contract 0x72846b6b…1a00, created by the operator wallet on Oct 20 at 14:02 UTC ([tx](https://basescan.org/tx/0xd317b0263ae08a0983e45bc8fe4f049f8d861f26feb6185ef4c0cf38c02c5660)). Its symbol reads USDC but is spelled with an Ethiopic ሀ, a Cyrillic Ѕ and С, one real D and six invisible characters. It has 6 decimals and no `balanceOf` function: it holds nothing, moves nothing, and exists to write transfer lines that wallets and explorers display. In its last 13,930 transactions the operator wallet created 414 contracts like it.

*Sources: the three transactions above (receipts and block times re-read on mainnet.base.org); Would Pay Again's bounty status API lists #101 and #105 as paid with those two hashes; `symbol()` and `decimals()` on the imitation contract.*

## How a copy works

Every copy is a pair of planted transfers in one transaction, same amount, same imitation token. Say wallet A really paid wallet B:

| Planted line | Shows up in | Looks like |
|---|---|---|
| look-alike of A pays B | B's history | another payment from A |
| A pays look-alike of B | A's history | another payment to B |

Then it waits. If A pays B again and copies B's address from its history, the money can go to B's look-alike. If B pays A back, or refunds A, and copies the sender from its history, it can go to A's look-alike. The six catches we traced below include both directions.

## One week of the operator wallet

| Oct 14 16:02:45 to Oct 21 16:02:45 UTC | |
|---|---|
| Transactions sent | 5,446: 5,410 batch calls to its imitation tokens and 36 new imitation tokens |
| Look-alike transfers planted | 884,017 |
| Payments copied (one pair each) | 439,209 |
| Distinct addresses in those transfers | 882,888, about half of them look-alikes it made (where we could tell them apart: 230,247 real wallets, 229,435 look-alikes) |
| Gas | 0.0209 ETH, about $53 |
| Gas per copied payment | about $0.00012 |
| Imitation tokens in use | 44 |

| Imitates | Transfers planted | Median time after the real payment |
|---|---:|---|
| ETH | 514,488 | about 90 s (32 checked pairs) |
| USDC | 365,889 | 142 s (182,140 copies) |
| WETH | 1,428 | 912 s |
| cbBTC | 1,098 | 912 s |
| EURC | 644 | 818 s |
| ZORA | 186 | 74 s |
| SOL | 180 | 42 s |
| B3 | 104 | 64 s |

For USDC, 10% of copies landed within 58 seconds, half within 142, 90% within 7.4 minutes and 99% within 22 minutes.

*Sources: operator wallet nonce 133,448 at block 52,602,209 and 138,894 at block 52,904,609; balance 0.199959649 ETH and 0.179052996 ETH at the same blocks, with no sign of a deposit in between (62 balance samples across the week, every step in line with fees); every Transfer log of the 44 contracts over the window.*

## Which payments it copies

We sampled 1% of the week: 60 evenly spaced 50-block windows holding 255,187 real USDC transfers. It copied 1,738 of them (0.68%).

- **Plain sends only.** All 1,656 copies we classified (those made with the 36 tokens created during the week) copied a `transfer` that the paying wallet sent straight to the USDC contract. 1,579 senders were ordinary wallets and 77 were ordinary wallets with smart-wallet code attached (EIP-7702). None was a contract, so none was a smart-contract wallet such as an ERC-4337 account.
- **About 1 in 9 of those.** Most transfers it skipped were sent from a contract (1,847 of a random 2,500). Only 130 of the 2,500 were plain sends by the paying wallet, which puts the share it copied at about 1 in 9 (roughly 1 in 7 to 1 in 10, allowing for the sample). We could not work out how it picks among them: amount, recipient type and repeat pairs do not explain it in our sample.
- **Once per payer and payee.** Its 182,140 USDC copies cover 182,137 distinct payer and payee pairs. Would Pay Again paid one contributor on Oct 16 and was copied 54 seconds later ([copy](https://basescan.org/tx/0xaab62106e03a4a6b5cd7cc0dfc8a76bcb35514aa2f806326599d3f4700283e4b)); it paid the same contributor again on Oct 21 ([tx](https://basescan.org/tx/0x5bf08d61e2504f9061a550af8d59a9446c584129bbcfbca038113cc7dba10c6a)) and that payment was not copied.
- **Any size.** The real USDC payments it copied ran from $0.000001 to $2.6 million, median $5.00: 33,149 were under $1 and 5,594 were $1,000 or more. Together they were worth $95.6 million. None of that money was at risk until someone copied a look-alike.

*Sources: the sample's transactions and the code at each sender and recipient address, read on mainnet.base.org; the copies matched to real transfers as described under Method.*

## Why it copied no x402 payment

x402 is a way for one program to pay another per request in USDC. In its usual form on Base, the payer signs an authorization (EIP-3009, `transferWithAuthorization`) and a facilitator, the service that carries the payment to the chain, sends the transaction. The paying wallet never sends a transaction itself, so a bot that copies only plain sends has nothing to copy.

That is what we saw:

- **Copies.** None of the 183,951 token payments it copied in the week was an EIP-3009 authorization.
- **Sample.** Of the 8,360 EIP-3009 transfers in the 1% sample, it copied none. Of the other 246,827 transfers, it copied 1,738.
- **Sellers.** We took the 613 Base addresses where x402 sellers in PayAI's catalog are paid (the `payTo` addresses, fetched Oct 12 to 13). From Oct 14 to Oct 20 (to block 52,866,183) they had 19,193 real USDC transfers, mostly x402 payments in. The bot copied 17 of them, 0.09%, against 0.68% for all USDC transfers. Over the whole week its copies touched 19 of the 613 addresses (18 leaving out our own treasury), 21 times, every time through a plain transfer.
- **One seller, both ways.** agent402.tools' payment address took 3,614 USDC payments in those six days, none copied (for example this [settlement](https://basescan.org/tx/0x37e06e9414f47c276689e03cac4c1fbf8358208016cd6b481545a3c14f2cf67c), sent by a facilitator). When it sent 20 USDC by plain transfer ([tx](https://basescan.org/tx/0xf66a2af625a26275632cd61ce58531802e306d3c75dcb6ef2f5e186e06e0af21)), a copy landed 80 seconds later ([copy](https://basescan.org/tx/0xe181e9466726e97c0d8515d2a26fb0cb8c9995d8f371fa1a06f8861fd19af9b4)).

So for agent businesses, the kind of payment this bot copies is one a wallet sends itself: bounty payouts (Would Pay Again's, three pairs this week), refunds, top-ups, moves between your own wallets. That includes plain payments made to a seller: agent-control.net's address received 80 USDC by plain transfer and was copied 90 seconds later. This is one bot's rule. Other bots may copy other things, and an x402 seller's or agent's wallet is copied like any other the moment it sends a plain transfer.

*Sources: AuthorizationUsed logs in each copied payment's transaction; the sample above; PayAI catalog dump; USDC logs to and from the 613 addresses on our own Base node.*

## What it has caught

We count a catch when a wallet that was shown a look-alike later paid it.

**This week: one catch we could find, $0.08.** A wallet sent 0.003 WETH to a contract at 11:42 UTC on Oct 21. At 11:47 the bot planted a look-alike of the contract in that wallet's history ([plant](https://basescan.org/tx/0xcbd4ce20181059d649a166b68d4152c62bdb355b3a7910d4610fb683f47333b8)). At 11:54 the wallet sent 0.00003 WETH to the look-alike ([tx](https://basescan.org/tx/0x5866df92aecf2a262742e36110632735a529e98f1842b7ceeea47f6a8ccb8f10)). It was still there at block 52,906,451.

We found no USDC sent to any of the 229,435 look-alikes planted by this week's token copies (scan to block 52,905,875). Native ETH sent to a look-alike leaves no log, so for ETH copies we checked a sample: 1,982 look-alikes from 1,000 copies, every one empty and never used. ETH catches this week are not ruled out. And catches take time: three of the six below came 25 to 33 hours after the plant, so this week's look-alikes can still catch payments.

**Since April: six catches traced from plant to payment.**

| Date | Sent to a look-alike | What happened | Plant to payment | Source |
|---|---|---|---|---|
| May 27 | 0.5 ETH | A wallet received 0.287 ETH. 450 s later the bot planted a look-alike of the sender in its history. The wallet later sent 0.5 ETH to the look-alike | 33.4 hours | [plant](https://basescan.org/tx/0x365cfe467f25fd6c46f34fa1dcae39e613a0b97569a62d67a699ed8338464445), [payment](https://basescan.org/tx/0x00045b02d01c66c6262b4fd355180bf9736c52ecf98993b75645bf04cbd95c76) |
| Jun 15 | 0.25 ETH | The bot copied a 0.00000001 ETH dust transfer from a wallet that Basescan shows as funded by "Fake_Phishing4592177", likely another operation's. The wallet that got the dust sent 0.25 ETH to this bot's look-alike | 30.4 hours | [plant](https://basescan.org/tx/0xe0a9e6e7e8758a63e5e694480f24e9b19ae787162069d3028c798b4a509e90e2), [payment](https://basescan.org/tx/0xda5eaccfd930f5533cdfa4e017e88727fedbf22329ee10e81fc967a19e0af759) |
| Jul 29 | 1 USDC | A wallet paid 1 USDC, then paid the same amount again, to the look-alike | 16 minutes | [plant](https://basescan.org/tx/0x4972c8308f3103c9c4f1fe68b47b74daa4d1cd0fde8d50e4d3373299373aa86d), [payment](https://basescan.org/tx/0xb8ce0d7d9563e21da826d10b14ccd7e079196f49319b9f0f13aaa4c168832dd7) |
| Sep 1 | 133 USDC | A wallet paid 0.5 USDC. 4.5 minutes later the look-alike was planted. The next day the wallet sent 133 USDC to it | 24.7 hours | [plant](https://basescan.org/tx/0xfc2d416d91198b7e8fde0c2a052a8ebc9372c208697a76024e728bf464bd9b99), [payment](https://basescan.org/tx/0x1762abd83b883d68a6d5feb9c2362f90d8ea6944abf6283fc1e76f8d5518bf33) |
| Sep 14 | 0.001 ETH | A contract received 0.001 ETH. Its own deployer later sent exactly 0.001 ETH to a look-alike of the payer, which is what a refund to the wrong address looks like | 40 minutes | [plant](https://basescan.org/tx/0x4660ae05016acc1e28bacad235c645cac831fde2663e03b36caab8d2ab651a9c), [payment](https://basescan.org/tx/0x9a5281d6792e06f010b5f827c16b5ca71bc8f06bf36f7dad2f9d38280e1af4d9) |
| Oct 21 | 0.00003 WETH | This week's, above | 7.6 minutes | above |
| **Total** | **0.751 ETH, 134 USDC, 0.00003 WETH** | **about $2,025 at the Oct 21 ETH price** | | |

**Where the catches go.** Five of the six reached the operator wallet: ETH straight from the look-alike ([0.5 ETH forwarded](https://basescan.org/tx/0x3d8adf8d9abbc822eee3dd5ca2bd2144211091c278f696685ef5258b3f91b94c)), USDC along a chain of look-alikes passing each other gas money ([133 USDC swept on Sep 7](https://basescan.org/tx/0xb29fc5f3a4b5bb485fcfc7de5eeaeb53bffce1c7d05ab004f95f2204a37ce701)), or swapped to ETH through MetaMask in a transaction a relayer sent, so the look-alike needed no gas of its own ([swap](https://basescan.org/tx/0xe594c7dff5130f39aa7f38d946df7fb735f9e5ef9dd39c65fe233428a8246e35); that look-alike is an EIP-7702 wallet delegated to the contract Basescan labels "MetaMask: EIP-7702 Delegator"). This week's WETH has not moved.

Since April the operator wallet has received at least 0.81 ETH and 258.97 USDC from 15 other wallets, most of them new and left with dust like its look-alikes. The six traced catches are 0.75 ETH and 133 USDC of that; the rest fits the same pattern, but we did not trace each plant.

## Where its money came from and went

| Date (UTC) | Event | Source |
|---|---|---|
| Apr 4, 10:11:45 | First transaction into the operator wallet: 0.02 ETH from [0x1b1d2149…26b53d](https://basescan.org/address/0x1b1d2149d656f8ca33fb633e6f642b5a2426b53d), which Basescan labels "ChangeNOW: Hot Wallet". The operator wallet had never been used | [tx](https://basescan.org/tx/0xd8a366b83fe08be62efec0a3ea548be75c68a07031b150d61419c81d98015fd1), block 44,254,079 |
| Apr to Oct | Every later ETH deposit we found came from small, new wallets left with dust, like its look-alikes, except one we could not place (a busy wallet that sent 87 USDC and 0.018 ETH on Sep 11) | balance history, sampled every 5,000 blocks |
| Sep 29, 11:34:13 | All 258.970759 USDC sent to a wallet that passed it on in full 8.6 minutes later to [0xf9a316b8…087338](https://basescan.org/address/0xf9a316b8044e757cf709f390583e671e0c087338), labeled "ChangeNOW: Hot Wallet 2" | [out](https://basescan.org/tx/0x3363ca1cd47afdc1a324572b214be13964e150d5ee3614703cc7864b21c0e382), [on](https://basescan.org/tx/0x4f6cc4efbb7d6dbf9bc0fb839e397d373361d75ff5071d796c1f5ddc5a677afd) |
| Oct 21, 17:10:15 | 0.179 ETH, no USDC, 138,930 transactions sent | block 52,906,634 |

ChangeNOW is an instant swap service, so what stands behind that first 0.02 ETH is not visible on Base. Since then, as far as we can see, the operator wallet has paid for about 139,000 transactions out of what came in. At about a cent per batch of 100 copies, a few copied addresses cover the bill: the single 0.5 ETH catch equals about 24 weeks of gas at this week's rate.

## Other bots work the same wallets

In the same week, Would Pay Again's payout wallet also got imitation "USDC" from three other contracts, with another look-alike symbol and different code, sent by three other wallets. We could not tell whether they are linked to this one. Bots also copy each other: on Sep 7, as this operator's look-alikes swept their catches to it, two contracts from other kits planted look-alikes of the operator wallet itself, and another kit copied the 133 USDC payment to the look-alike 21 minutes after it landed. The June catch began with dust that was likely another operation's.

## What to do before you pay

1. **Get the address from whoever you are paying:** their site, their invoice, or your own saved contacts. Not from your wallet history, and not from an explorer's list of recent transfers.
2. **Compare the middle, not the ends.** 99.95% of this bot's USDC look-alikes match the first 4 and last 5 characters, more than the 4 and 4 many wallets show.
3. **A small first payment does not protect the second one** if the address for the second comes from history. In the 133 USDC case, the look-alike was planted 4.5 minutes after a 0.5 USDC payment, and the 133 USDC went to it the next day.
4. **Check a token by its contract, not its name.** Circle issues one USDC on Base (0x8335…2913; Circle publishes the full address). A "USDC" from any other contract is not USDC, however it is spelled.
5. **If one of these lines is in your history, nothing was taken.** A planted transfer is a log entry written by a contract that holds nothing. There is nothing to undo; just never copy an address from it.
6. **Paste the address before you send.** Since Oct 21, ChainWard's free check answers Hold for a planted look-alike on Base: never used, holding no more than dust, its ETH or USDC (or WETH, EURC, cbBTC, DAI, USDbC) transfers all imitations, zero-value or dust, and its first and last 4 characters matching an address that the other wallet in those transfers really paid, or was paid by, in the previous 20 hours. It says: "This address was made to look like another one, and it has never been used. Get the full address from whoever you are paying." It never names an address to pay instead. The rug check answers Hold for a token whose name or symbol passes for USDC or another well-known token, and agents can ask the same through the wallet lookup and counterparty check APIs.

What the check does not catch yet: a look-alike that has already been paid, which reads as a used wallet; anything off Base.

## Limits

- **One wallet, one week.** The week's numbers describe this operator wallet's copies from block 52,602,209 to 52,904,609, plus its history since April. Other bots copy other payments.
- **Catches are a floor.** The scan covered seven real tokens (USDC, EURC, WETH, cbBTC, SOL, ZORA, B3) sent to the token look-alikes, to block 52,905,875; native ETH only by sample; other tokens and money forwarded anywhere but the operator wallet not at all. Deposits into the operator wallet come from balance samples every 5,000 blocks (USDC every 10,000), which can hide small or offsetting flows.
- **The 1 in 9 is a sample estimate**, from 60 windows covering 1% of the week.
- **x402:** what we measured is EIP-3009 settlements, the usual form on Base. Other ways of settling an x402 payment also go through a facilitator but were not counted separately.
- **Dollar values** use the Oct 21 price (Chainlink ETH/USD on Base, $2,517.65, updated 16:39:57 UTC), not the price on the day of each catch.
- **Labels** ("Fake_Phishing2822323", "Fake_Phishing4592177", "ChangeNOW: Hot Wallet", "ChangeNOW: Hot Wallet 2", MetaMask's delegator) are Basescan's name tags, quoted as labels, not our findings.
- **Wallets only.** Who runs the operator wallet is not on chain, and its trail on Base ends at ChangeNOW's labeled wallets.

## Method

- **Sources.** Public RPC (mainnet.base.org; base-mainnet.public.blastapi.io for archive state), Tenderly's public Base gateway for archive logs, and ChainWard's own Base node for logs to block 52,866,183. Basescan only for name tags.
- **Contracts.** A wallet's contract addresses follow from its nonces. For the operator wallet's nonces 125,000 to 138,949 we read the code at each: 414 imitation tokens, 44 of them used in the week. Their Transfer logs are the 884,017 planted transfers.
- **Matching.** For each planted pair we looked for a real transfer of the same amount between the two real addresses in the 999 blocks before it: 183,951 of 184,063 token pairs matched. Native ETH has no logs, so 32 ETH pairs were checked against the ETH transfers before them.
- **Catches.** Real-token transfers into each look-alike from its plant to block 52,905,875, with a positive control (three real addresses mixed in, three found). Before the window, the operator wallet's balances were sampled across its history and each increase traced back to its plant.
- **Re-check.** On Oct 21 we re-read every transaction cited here, the operator wallet's balance and nonce at both window bounds, and the ETH price on mainnet.base.org.

> Disclosure: ChainWard's treasury is one of the two wallets in the opening, and ChainWard was paid those bounties for facts it submitted to Would Pay Again. The treasury is also an x402 payment address, one of the 19 counted above. ChainWard sells wallet and counterparty checks. The decoy check described here went live on Oct 21, the day we measured this. The wallet report and the rug check on chainward.ai are free.
