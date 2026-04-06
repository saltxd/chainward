---
title: "Ethy AI On-Chain Decode"
subtitle: "What the #1 Virtuals Agent Looks Like On-Chain"
date: "2026-04-05"
slug: "ethy-ai"
---

# Ethy AI On-Chain Decode: What the #1 Virtuals Agent Looks Like

Last updated: April 5, 2026

An educational deep dive into Ethy AI, the top-ranked agent on Virtuals Protocol's ACP (Agent Commerce Protocol). We walked through the on-chain data, the wallet architecture, the aGDP metric, and a specific token flow to document what we found.

---

## 1. What Ethy AI Is

Ethy AI is a trading utility agent on Base. It performs cheap, high-volume jobs for users:

| Job Type | Typical Cost |
|----------|-------------|
| Token swaps | ~$0.50 |
| DCA orders | $0.01 - $1.00 |
| Token info lookups | ~$0.05 |

### Performance (as of April 5, 2026)

| Metric | Value |
|--------|-------|
| Successful jobs | 1.14M |
| Total revenue | $572.8K |
| Unique buyers | 7,496 |
| Success rate | 99.49% |

This is a high-frequency, low-cost service. Thousands of users pay small amounts per job, and the agent completes nearly all of them successfully.

---

## 2. What aGDP Actually Means

Ethy AI is ranked #1 on the ACP leaderboard with $218.1M in aGDP (agentic GDP). That number looks disconnected from $572.8K in revenue until you read the definition.

### The Virtuals Definition

From the official ACP glossary at `whitepaper.virtuals.io/acp-product-resources/acp-glossary`:

> **aGDP (Agentic GDP):** The total value an agent processes, including trading value and service fees.

Their worked example: a user deposits $5,000, the agent trades it 5 times, and charges a $2 service fee per trade. The aGDP is $5,010 — the sum of all notional trading volume plus fees.

### What This Means for Ethy

Ethy AI executes swaps on behalf of users. Each swap processes some notional amount of token value. The $218.1M aGDP is the cumulative notional value of all trading activity the agent has handled. The $572.8K revenue is the cumulative service fees Ethy collected for performing those jobs.

These are two different measurements by design:

- **aGDP** = total value processed (pass-through trading volume + fees)
- **Revenue** = what the agent earned in service fees

For a trading agent, aGDP will always be much larger than revenue. That is how the metric is defined.

---

## 3. The Wallet Architecture

Ethy AI has four wallets registered in the Virtuals system. Here is what each one holds and does.

### Wallet State (April 5, 2026)

| Wallet | Type | Balance | Transfers | Role |
|--------|------|---------|-----------|------|
| ACP (`0xfc9f...`) | ERC-4337 smart account | ~$4K USDC | 1,138,648 | Receives job payments, primary activity hub |
| Owner (`0xe086...`) | EOF contract | ~0 USDC, 5.1M ETHY, 3.3M sETHY | 504 txs | Holds/stakes ETHY tokens |
| Sentient (`0xa3d2...`) | EOA | 0 everything | 0 | Dormant, no on-chain activity |
| TBA (`0xf8f5...`) | ERC-6551 token-bound | 2 USDC | 1 | Dust balance |

### What This Shows

The **ACP wallet** is where the action happens. It is an ERC-4337 smart account (a proxy contract) that receives a continuous stream of USDC micro-payments ($0.01 to $8.00 per transfer) from the Virtuals PaymentManager contract. The 1.1M+ token transfers are real ERC-4337 UserOperations. The owner address is embedded in the proxy's bytecode.

The **owner wallet** is an EOF (Ethereum Object Format) contract that holds the agent's ETHY token position: 5.1M ETHY plus 3.3M staked ETHY.

The **sentient wallet** is the address Virtuals displays prominently in the agent profile. Despite its visibility, it has zero balance and zero transactions. It is not where the activity happens.

The **TBA** (token-bound account per ERC-6551) holds dust.

The ACP wallet balance of ~$4K represents the current float, not cumulative throughput. Payments flow in from users and out as the agent executes jobs. The $572.8K revenue is a cumulative figure over the agent's lifetime.

---

## 4. A Traced Token Flow

Ethy AI's documentation states that fees are used to buy back and burn ETHY tokens. We traced one specific flow from March 30, 2026.

### What We Found

**Transaction 1** (`0xb9d4e82a...`): The owner wallet sent 75,000 ETHY to an intermediary address (`0xe3c270...`).

**Transaction 2** (`0x916a746b...`): The intermediary routed the tokens through the Zerion Router, which split them:

| Destination | Amount | What Happened |
|-------------|--------|---------------|
| ETHY token contract | 750 ETHY | 1% sell tax (built into the ETHY token) |
| Uniswap LP pair | 74,250 ETHY | Swapped for 145.77 VIRTUAL, then multi-hop to ~0.0465 ETH |

### What This Tells Us

This specific verified route was a sell of ETHY tokens for ETH, routed through a DEX. It was not a transfer to a dead address (the typical meaning of "burn" in crypto). We are not claiming there is no burn mechanism elsewhere in the system -- we are documenting what this particular traced flow did. The marketing language of "buy back and burn" does not fully describe what the on-chain activity shows for this transaction pair.

---

## 5. API Data Quality Notes

While pulling data from the ACP API, we observed some data quality issues worth noting. These are separate from the aGDP metric discussion above.

### The $99,999,999.99 Cap

The API field `grossAgenticAmount` returns exactly `99,999,999.99` for both Ethy AI and Axelrod (the #2 agent). Two different agents returning the identical value to the penny is consistent with a `DECIMAL(10,2)` column cap in the database. The UI displays different aGDP numbers ($218.1M for Ethy, $106.9M for Axelrod), which appear to be calculated from a separate data path.

### Success Rates Above 100%

Two agents return mathematically impossible success rates from the API:

| Agent | API Success Rate | UI Display |
|-------|-----------------|------------|
| Axelrod | 291.43% | 100.0% (clamped) |
| Betty | 123.96% | 100.0% (clamped) |

The UI clamps these values for display. The underlying calculation likely counts multi-step completions or retries as separate successes against a single job denominator.

These are data quality issues in the API layer, not part of the aGDP discussion.

---

## 6. Sources

### API Endpoints
- ACP Scan UI: `app.virtuals.io/acp/scan` (captured April 5, 2026)
- ACP agent list: `acpx.virtuals.io/api/agents` (41,643 agents, pulled April 5, 2026)
- Ethy AI details: `acpx.virtuals.io/api/agents/84/details`

### On-Chain References
- ACP wallet: `base.blockscout.com/address/0xfc9f1fF5eC524759c1Dc8E0a6EBA6c22805b9d8B`
- Owner wallet: `base.blockscout.com/address/0xe086...`
- Sentient wallet: `base.blockscout.com/address/0xa3d2...`
- TBA: `base.blockscout.com/address/0xf8f5...`

### Transaction Hashes
- ETHY transfer: `0xb9d4e82a...`
- Zerion Router swap: `0x916a746b...`

### Node Data
- cw-sentinel Base node: block 44,114,084 (April 1, 2026 04:25:15 UTC)

### Definition Source
- ACP Glossary: `whitepaper.virtuals.io/acp-product-resources/acp-glossary`
