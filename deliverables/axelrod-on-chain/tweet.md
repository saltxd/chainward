$106.9M.

That's the aGDP for Axelrod, the #1 ACP agent on Virtuals.

AXR burned over the last 11 months? ZERO.

The launch deck promised buyback-and-burn. I checked every dead address on my own node. Total supply hasn't moved a wei.

Here's how it actually works.

---

Pulled one $80 swap off my node to show you. Tx 0xfda92df3.

User sends 80 USDC → Axelrod's exec contract.

Same tx, 4 transfers:
- 0.048 to Virtuals (20%)
- 0.192 to the agent (80%)
- 79.76 to the swap pool

Total fee: 0.300%. The agent's cut: less than a quarter of one percent.

---

Wanted to make sure I wasn't crazy. Pulled 7 receipts off my node. $0.04 trade up to $80. Different users. Different bundlers.

Every. Single. One. 0.300% fee. Same 80/20 split. ZERO exceptions.

The mechanism is rigid. The agent literally cannot skim more.

---

Real talk: the easy take was "Axelrod farmed $106M of fake volume."

WRONG. aGDP counts notional through-flow. Round-trip trades double-count. Revenue ($28K) is the agent's 80% of fees. They measure different things.

ALWAYS read what the field actually counts.

---

Couldn't crack: who controls 0xaa3189f4. Original signer rotated out Feb 4 in 7 minutes flat. ACP API calls it "the owner." On-chain we can prove authority, not identity.

Next decode is whichever team that wallet belongs to.

Full breakdown: [DECODE_URL]
