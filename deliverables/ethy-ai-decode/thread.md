# Ethy AI On-Chain Decode — Thread (Final)

Last updated: April 5, 2026

---

## Tweet 1 — Hook
**Attach:** no graphic

Ethy AI's $218M aGDP makes it the #1 agent on Virtuals. We ran our own Base node and traced the wallet. The real revenue is $572K. That's a 380x gap. Here's the full breakdown.

## Tweet 2 — Burn route (the "wait, what?" moment)
**Attach:** `wallet-proof.png`

Ethy's marketing: "fees are used to buyback and burn $ETHY." We traced one route from the owner wallet. 75,000 ETHY went through Zerion Router, split via sell tax, swapped ETHY to VIRTUAL to ETH. This route was a DEX sell, not a burn to a dead address.

## Tweet 3 — Wallet data (the proof)
**Attach:** no graphic

Ethy's ACP wallet is an ERC-4337 smart account. 1.14M jobs. 99.49% success rate. 7,496 unique buyers. Average job: $0.50. Current balance: ~$4K USDC. Zero ETH — gas fully abstracted via bundler infra. The wallet is real. The work is real.

## Tweet 4 — aGDP explainer (the context)
**Attach:** `agdp-vs-revenue.png`

aGDP ≠ revenue. Virtuals' own glossary: one $5K deposit traded 5x at $2/trade = $5,010 aGDP but only $10 in fees. Ethy's $218.1M aGDP vs $572.8K revenue is the metric working as designed. Most people citing that number have no idea.

## Tweet 5 — CTA
**Attach:** no graphic

No accusations — just chain data from our own node. This is what ChainWard does: verified on-chain facts about AI agents so you can make your own call.

Which agent should we decode next? Drop it below.

---

## Verification Sources

### Tweet 1
- $218.1M aGDP: ACP Scan UI (app.virtuals.io/acp/scan), April 5
- $572.8K revenue: ACP API (acpx.virtuals.io/api/agents/84/details), field: revenue
- 380x = $218,100,000 / $572,787 = 380.7x

### Tweet 2
- Tx 1 (0xb9d4e82a...): Verified via cw-sentinel. Block 44,050,651. Owner → 75,000 ETHY → 0xe3c270
- Tx 2 (0x916a746b...): Verified via cw-sentinel. Block 44,051,001. Zerion Router split:
  - 750 ETHY → token contract (1% sell tax, verified to the wei)
  - 74,250 ETHY → LP pair → 145.77 VIRTUAL → multi-hop → ~0.0465 ETH
- Marketing claim: Ethy AI public site / docs

### Tweet 3
- Wallet type: Blockscout (SemiModularAccountBytecode, ERC-4337)
- Job count / success / buyers: ACP API agent details (verified April 5, zero drift)
- USDC balance: ~$4K (Blockscout + ACP API cross-validated)
- Zero ETH: Blockscout coin_balance = 0

### Tweet 4
- aGDP definition: Virtuals ACP Glossary (whitepaper.virtuals.io/acp-product-resources/acp-glossary)
- Worked example: from the same glossary, exact quote verified
- $218.1M vs $572.8K: ACP Scan UI + ACP API

### Tweet 5
- No specific claim to verify

---

## Posting Notes

- Post from @SaltCx (personal), mention ChainWard by name in Tweet 5
- Post all 5 at once (Typefully or rapid-fire)
- Target: Tuesday or Wednesday, 10-11 AM ET
- Do NOT tag @EthyAI or @virtaborz in the thread
- After posting: reply to 2-3 active Virtuals/AI agent discussions with the hook + link
- If pushback comes: "Happy to be corrected — show us the burn tx and we'll update the analysis"
