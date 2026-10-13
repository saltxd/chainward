# Launch thread (@chainwardai), one post per line block, each under 280 chars

1.
We checked where the money came from for the top 10 x402 sellers on Agent402's leaderboard. Ranks 1, 5 and 7 are paid mostly with their own money.

2.
#1 X Pay: since Sep 11 it sent USDC to 169 wallets whose first USDC ever came from X Pay. 159 paid it back, 45,873+ payments, $4,167 of the $4,266 it sent. One wallet got $103.70 on Oct 10 and paid it all back in 750 payments by that afternoon.

3.
#5 keyring-agent: one wallet received exactly 541 transfers of 0.05 USDC from the seller and sent exactly 541 back. Its ten largest counterparties all match in and out. Agent402's own router already refuses it; the leaderboard still ranks it fifth.

4.
#7 BotPay: its payTo funded a root wallet, which split 53.12 USDC three ways in a minute, which funded 8 buyers, which paid 489 fresh wallets 11,838 times through a facilitator, which sent $700 back to BotPay. 284 of its 347 "buyers" are that ring.

5.
A scammer is poisoning X Pay's buyers: 36 seconds after one wallet's first payment, a fake "USDC" token logged a transfer to a look-alike of X Pay's address. 424 times so far. Full trace, every hop on Basescan: chainward.ai/decodes/x402-top-ten-self-funded
