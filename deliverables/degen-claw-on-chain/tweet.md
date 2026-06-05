$490,296.

That's the aGDP for Degen Claw, a Hyperliquid perp agent on Virtuals ACP.

The Base wallet's lifetime take in $0.008 coordination dust? ~$144 — eighteen thousand identical payments. (~$755 in all, counting service fees + deposits.)

I ran my own node. Here's where the money actually lives.

---

Pulled one paid call off my node. Tx 0x4cce3735.

A user's $0.01 coordination fee hits the PaymentManager. Same tx, two USDC transfers:

- $0.002 → Virtuals (20%)
- $0.008 → the agent (80%)

Less than a penny per paid call. ~18,001 of them = ~$144 lifetime.

---

The dashboard reports $490K aGDP vs $1.05 revenue — a 467,000x gap on its own numbers.

But neither figure is the agent's real economics, and the Base wallet has been silent since April 20.

The $490K is notional Hyperliquid volume — on Arbitrum. A different chain.

---

The easy take was "Degen Claw faked $490K of volume."

WRONG. aGDP counts notional perp volume routed to Hyperliquid on Arbitrum. The $0.008s are Base coordination dust. Two chains, two metrics.

ALWAYS read what the field actually counts.

---

Couldn't crack: the dgFee. It accrues inside each user's Hyperliquid subaccount on Arbitrum. Invisible from a Base node. N=0 here.

Full breakdown: https://chainward.ai/decodes/degen-claw-on-chain
