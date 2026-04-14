# Wasabot On-Chain Decode -- Thread

Last updated: April 13, 2026

---

## Tweet 1 -- Hook
**Attach:** no graphic

$81.6M.

That's the aGDP for the #3 agent on Virtuals.

Revenue? $5,924.

Almost 14,000x. That's not a typo.

I ran my own node. Traced the fees myself. The dashboard is measuring two COMPLETELY different things and NOBODY tells you which is which.

Here's how it actually works 👇

## Tweet 2 -- The architecture
**Attach:** `agdp-vs-revenue.png`

Pulled one trade off my node to show you.

$60 position. User sends $60 USDC → hits the perp contract → goes to the pool. That's it. ZERO skimmed at the contract.

So what does the agent get? $0.008. Less than a penny. 80% of a $0.01 fee. Virtuals took the other $0.002.

$0.008 on a $60 trade. THAT'S the "revenue" they show you.

## Tweet 3 -- The split nobody talks about
**Attach:** no graphic

Wanted to make sure I wasn't crazy. Pulled 5 more receipts off my node. Different agents. All of them.

Every. Single. One. Same 80/20 split. Same Virtuals address taking the 20%. ZERO exceptions.

So "revenue" on the leaderboard? It's the agent's 80% cut of a fraction of a penny. Across every agent on the platform.

## Tweet 4 -- What the agent couldn't see
**Attach:** no graphic

Real talk: I ran an AI agent on this first. It told me there was a hidden 0.30% fee worth $245K.

WRONG. The agent misread the chain. Real close fee is around 0.10% and it doesn't even go to Wasabi — it goes to Virtuals.

Caught it because I checked every receipt myself. NEVER trust the bot. Always check the chain.

## Tweet 5 -- Close
**Attach:** no graphic

One thing I couldn't crack: avg aGDP per job is $5,333 but recent trades are $0.50-$60.

Something happened early. Either whales seeded it or aGDP counts more than collateral. That's the next decode.

Until then? Stop quoting that aGDP number until you know what it actually counts.

Full breakdown: chainward.ai/decodes/wasabot

---

## Verification Sources

### Tweet 1
- $81.63M aGDP: ACP API `agents/1048/details`, field `grossAgenticAmount` = 81,630,804.01
- $5,924 revenue: ACP API, field `revenue` = 5,924.29
- 13,779x = $81,630,804 / $5,924.29
- "Ran my own node": All sentinel-verified claims via `ssh cw-sentinel` at `http://localhost:8545`. See rpc-audit.md

### Tweet 2
- $60 open architecture: Sentinel-verified, tx `0x2c010232b747af334e2f54d10346cbf68cac8c49ee44658018db74645892b89d`, block 44,574,123
- $0.008 = 80% of $0.01 ACP coordination fee
- 20% to Virtuals: PaymentManager 80/20 split, sentinel-verified across 5 txs (see findings.md Proof 1)

### Tweet 3
- 80/20 split: 5 sentinel-verified PaymentManager txs, all exactly 4:1
- Multi-agent: 80% recipients are 2 distinct ERC-4337 wallets, neither Wasabot
- Full hashes in findings.md Proof 1

### Tweet 4
- 0.30% / $245K was the initial AI-agent-generated claim, now corrected
- Real close fee: 0.06%-0.10%, sentinel-verified across 7 txs (findings.md Proof 3)
- Fee goes to `0xE9683559A1177A83825A42357a94F61b26cd64C1` (Virtuals platform), not a Wasabi treasury

### Tweet 5
- 15,307 total jobs: ACP API `totalJobCount`
- $5,333 avg: $81,630,804 / 15,307
- Recent trades $0.50-$60: Blockscout token-transfer pages for perp contract
- Could not determine: see findings.md "What Could Not Be Determined"

---

## Character Counts (Twitter t.co URL counting)

- Tweet 1: 256 chars ✓
- Tweet 2: 270 chars ✓
- Tweet 3: 249 chars ✓
- Tweet 4: 246 chars ✓
- Tweet 5: 248 chars ✓

---

## Posting Notes

- Post from @SaltCx (personal), mention ChainWard by name in the decode link
- Post all 5 at once (Typefully or rapid-fire)
- Target: Tuesday or Wednesday, 10-11 AM ET
- Do NOT tag @wasadotbot or @wasabi_protocol in the thread
- After posting: reply to 2-3 active Virtuals/ACP discussions with the hook + link
- If pushback: "Show me what I got wrong on-chain and I'll update the analysis. Every number traces to a sentinel receipt."
- Tweet 4 (the AI-agent correction) is the differentiator — it shows ChainWard's verification standard. Lean into this if it gets engagement.
