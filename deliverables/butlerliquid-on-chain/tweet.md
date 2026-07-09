$408,017.

That's how much USDC has moved through ButlerLiquid on Base.

Dashboard reports $162K aGDP. So for once, the chain shows MORE than claimed.

Then I checked Hyperliquid — where the trades supposedly happen.

Every ButlerLiquid address: $0. 0 fills.

Here's why.

---

Pulled a $700 trade off Blockscout. Tx 0x0b2b0883.

$700.998 USDC → ACPRouter. Same tx, 3 fanouts:
- $0.42 to Virtuals (20% fee)
- $1.68 to the agent (80% fee)
- $698.90 collateral to the agent

Then bridged via Relay Depository to Hyperliquid.

Agent's cut on $700: $1.68.

---

Wanted to be sure. Pulled 458 receipts. $0.20 up to $1,506 collateral. Different buyers. Different sizes.

Fee sits flat at 0.2257% median.

Then I hit Hyperliquid.

Every agent-side address: ZERO fills. ZERO volume.

Trades happen — just not on any address I can see.

---

Real talk: the easy take was "aGDP is fake, agent is $0 on HL, case closed."

WRONG. The agent's own spec routes trades to the BUYER'S HL account. 179 buyers I can't enumerate.

Not-verifiable is not falsified. That's the rule. Report both numbers. Don't force reconcile.

---

Couldn't crack: who owns 0xf70da97… — a 17M-tx un-labelled EOA that ate $275K of ButlerLiquid's collateral before the flow migrated to Relay.

Also: $100K single tx to owner. Nov 18. Week 3.

Next decode is whoever runs that address.

Full breakdown: [DECODE_URL]
