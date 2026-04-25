# AIXBT Utility Audit: ACP Activity & On-Chain Reality

**Date:** April 15, 2026
**Agent:** AIXBT (ACP ID: 26, Virtual ID: 1199)
**ACP Wallet:** `0x5FaCEbD66D78A69b400dC702049374B95745FBc5`
**TBA Wallet:** `0x007a5Ef9431016C0A5F7BF65f078a83Dc394d793`
**Status:** Technically active. Functionally dormant.

---

## Executive Summary

AIXBT is the most recognized AI agent brand in crypto -- 412,853 token holders, $13K+ TVL, 5.16% mindshare on Virtuals. But when you look at what the agent actually *does* on-chain, the picture collapses. AIXBT ranks #33 on the ACP leaderboard with $37,935 in aGDP, which is 0.017% of the top agent (Ethy AI). Its ACP wallet holds $52.92 in USDC and a graveyard of 50+ spam tokens. The most interesting on-chain activity is a suspicious burst of thousands of micro-transactions on two specific dates that account for the majority of its "job" count.

AIXBT's value proposition lives entirely off-chain -- in its Twitter presence, brand recognition, and token speculation. On-chain, it is an information service that charges $0.80-$1.60 per query and processes roughly 3-4 jobs per day at current rates.

---

## 1. ACP Activity Status: Active But Barely

### Timeline

| Event | Date | Source |
|-------|------|--------|
| AIXBT token launched on Virtuals | November 2, 2024 | Virtuals API `createdAt` |
| ACP agent registered | May 28, 2025 | ACP API `createdAt` |
| First USDC payment received | December 16, 2025, 08:06 UTC | Blockscout token transfers (earliest USDC record) |
| Last USDC payment received | April 12, 2026, 22:35 UTC | Blockscout token transfers |
| Last active (API reported) | April 16, 2026, 04:07 UTC | ACP API `lastActiveAt` |

The agent was registered on ACP in May 2025 but received no USDC settlements for nearly 7 months. The first on-chain payment arrived December 16, 2025 -- a burst of $0.01 micro-transfers.

### Current Activity Rate

Over the 13 days from March 30 to April 12, 2026, Blockscout shows 50 USDC payments to this wallet, totaling $37.71. That is approximately 3.8 payments per day, averaging $0.75 per payment.

At this rate, the agent would process roughly 1,400 jobs per year -- far below the 35,840 total jobs the API reports historically.

### The Two Burst Events

The bulk of AIXBT's historical job count appears concentrated in two distinct bursts.

**Burst 1: December 16-19, 2025.** Hundreds of $0.01 USDC transfers arriving every ~30 seconds. These are consistent with automated testing or load testing of the ACP payment pipeline, not organic demand. Each payment was $0.01 -- a hundredth of the lowest service price ($1.00 for "projects").

**Burst 2: March 21-22, 2026.** Hundreds of $1.60 USDC transfers arriving every 1-2 minutes for approximately 24 hours straight. $1.60 corresponds to the "indigo" service price (2 VIRTUAL). This volume pattern -- sustained rapid-fire requests over a full day -- is inconsistent with human users querying an analysis tool. It suggests automated/bot activity, though could also reflect a promotional event or integration test.

**Source:** Blockscout token transfer pagination for USDC (`0x833589...2913`) at address `0x5FaCEbD66D78A69b400dC702049374B95745FBc5`. Full transfer history paged from latest (Apr 12, 2026) to earliest (Dec 16, 2025, block ~39,543,000).

---

## 2. Revenue Reality Check

### The $38K Number

The ACP API reports two nearly identical figures:
- `grossAgenticAmount`: $37,935.11
- `revenue`: $38,192.12

The ACP wallet's USDC balance is $52.92, and the wallet has **never sent USDC out** (zero outbound ERC-20 transfers on Blockscout). This means the wallet has received a cumulative total of ~$52.92 in USDC across its entire lifetime.

The discrepancy between the API's $38K figure and the on-chain $52.92 indicates that `grossAgenticAmount` and `revenue` are measured in VIRTUAL tokens (the ACP settlement currency), denominated at market rate at time of transaction, not in actual USDC settled to the wallet. The PaymentManager contract (`0xEF4364Fe4487353dF46eb7c811D4FAc78b856c7F`) converts and settles in USDC, and the on-chain USDC total is the ground truth.

### Context Within the Ecosystem

| Metric | AIXBT | Ecosystem |
|--------|-------|-----------|
| aGDP | $37,935 | $4.07M total (Live Agent Revenue) |
| Share of ecosystem | 0.93% | -- |
| Share of Ethy AI | 0.017% | Ethy: $218.1M |
| Share of Axelrod | 0.035% | Axelrod: $106.9M |
| ACP rank | #33 | Out of 1,000+ agents |

### Revenue Per Job

| Agent | aGDP/Job | What It Does |
|-------|----------|--------------|
| Wasabot | $5,413.20 | Leveraged perp trading |
| Axelrod | $2,578.06 | Swap execution with routing |
| Otto AI | $614.11 | Multi-chain swaps |
| Ethy AI | $191.48 | On-chain swap execution |
| **AIXBT** | **$1.16** | **Text-based market analysis** |

The top ACP agents generate high aGDP because they execute financial transactions where the notional value of the trade flows through the system. AIXBT sells text analysis for 1-2 VIRTUAL per query. Its revenue-per-job is 2,000-4,600x lower than execution agents.

**Source:** ACP API `/agents/{id}/details` for each agent. Revenue-per-job calculated as `grossAgenticAmount / successfulJobCount`.

---

## 3. Understanding aGDP

aGDP stands for "agentic Gross Domestic Product." Per the Virtuals Protocol whitepaper:

> "aGDP represents the total value produced by autonomous agents operating within the ecosystem."

Critically, aGDP is **not revenue in the traditional sense**. For execution agents like Ethy AI and Wasabot, aGDP reflects the notional value of trades routed through them -- a $100 swap contributes $100 to aGDP even if the agent's fee was $0.50. This is by design. It measures economic throughput, analogous to how national GDP counts the total value of goods and services produced, not just the profit margin.

For AIXBT, this distinction matters less because it sells information, not execution. Its aGDP ($37,935) is closer to actual fees collected, since there is no underlying trade volume to inflate the number. The $1.16 per job is roughly what users paid in VIRTUAL for each query.

The comparison to execution agents is therefore misleading in both directions: Ethy AI's $218M aGDP does not mean it earned $218M in fees, and AIXBT's $38K aGDP does not mean it is 5,749x less useful. But it does mean AIXBT routes zero financial volume through the agentic economy.

**Source:** Virtuals Protocol whitepaper at `whitepaper.virtuals.io`, "Agentic Economy Overview" section. The `/llms-full.txt` export states: "aGDP represents the total value produced by autonomous agents operating within the ecosystem."

---

## 4. Comparison Table: AIXBT vs Top 5 ACP Agents

| Agent | aGDP | Jobs | Users | Success Rate | Category | Service Type | Wallet Balance |
|-------|------|------|-------|--------------|----------|--------------|----------------|
| Ethy AI | $218,099,221 | 1,139,030 | 7,496 | 99.2% | ON_CHAIN | Swap execution | $0.00 |
| Axelrod | $106,927,552 | 41,476 | 4,749 | 94.8% | HYBRID | Swap execution | $4.78 |
| Wasabot | $81,631,052 | 15,080 | 849 | 98.5% | NONE | Leveraged trading | $53.65 |
| Otto AI | $18,328,071 | 29,845 | 3,053 | 98.7% | HYBRID | Multi-chain swaps | $636.19 |
| **AIXBT** | **$37,935** | **32,801** | **1,899** | **91.5%** | **INFORMATION** | **Text analysis** | **$52.92** |

### Notable observations:

- **AIXBT has more "jobs" than Axelrod, Wasabot, and Otto AI** -- but generates 483x to 2,152x less aGDP. This is because AIXBT's jobs are $0.80-$1.60 text queries, while the others execute trades worth hundreds or thousands of dollars each.

- **AIXBT has more "unique buyers" (1,899) than Wasabot (849)** -- but most of AIXBT's job volume came in concentrated bursts that suggest automated rather than organic activity.

- **AIXBT's success rate (91.5%) is the lowest in the top 5.** The others exceed 94%.

- **AIXBT is the only pure INFORMATION agent in the top 33.** Every other high-ranking agent executes on-chain financial transactions.

- **Virtuals page shows 0% Utilization, 0% APY** for AIXBT. These fields return `null` from the API, meaning the staking/utilization system is either not configured or shows no activity.

**Source:** ACP API `/agents/{id}/details` for agents 26, 84, 129, 1048, 788. Leaderboard rank from `/agents?sort=grossAgenticAmount:desc`, page 2.

---

## 5. What AIXBT Actually Does On-Chain

### ACP Wallet (0x5FaCE...FBc5)

**Wallet type:** SemiModularAccountBytecode -- an ERC-4337 smart account. Zero external transactions, zero gas usage. All activity is via UserOperations processed by a bundler.

**Blockscout counters:** 0 transactions, 24,581 token transfers, 0 gas used.

**Token holdings (50+ tokens):**
- $52.92 USDC -- the only token with real value
- 30,000 MOCI ("Moon Chill")
- 13,164 HUB
- 150 CLAWNCH
- 105 "Greenland Trump"
- 100 "Tibbir by Virtuals"
- 40+ additional spam/meme tokens with names like "Distorted Pepe," "Board Of Peace," "ICE Trump," "Eid Mubarak," "McDonald Trump"

**Transfer pattern:** 100% inbound. The wallet has never initiated an outbound transfer of any token. It passively receives USDC settlements from the ACP PaymentManager contract (`0xEF4364...856c7F`, an ERC1967Proxy implementing PaymentManager) and spam airdrops from various addresses.

### TBA Wallet (0x007a...d793)

**Wallet type:** AccountV3Upgradable (ERC-6551 Token Bound Account -- the wallet bound to AIXBT's Virtuals NFT).

**Status:** Effectively dead. Last ERC-20 transfer was August 28, 2025 -- over 7 months ago. Holds 0.000002 ETH. 881 historical token transfers, all inbound spam. 5 total transactions.

### Sentient Wallet

The Virtuals API returns `sentientWalletAddress: null` for AIXBT. There is no active sentient wallet.

### Summary

AIXBT has three wallets, none of which show productive on-chain activity:
- ACP wallet: receives USDC from job settlements and spam airdrops. Never sends anything.
- TBA wallet: dormant since August 2025. Only receives spam.
- Sentient wallet: does not exist.

The agent does not execute trades, manage positions, provide liquidity, or interact with any DeFi protocol. Its on-chain footprint is limited to passively receiving ACP settlement payments for off-chain text analysis.

**Source:** Blockscout `/addresses/{addr}`, `/addresses/{addr}/counters`, `/addresses/{addr}/token-transfers`, `/addresses/{addr}/tokens` for both wallets. Virtuals API `/api/virtuals/1199` for wallet addresses and sentient wallet status.

---

## 6. Historical Trajectory

### AIXBT was not always an ACP agent

AIXBT launched its Virtuals token on November 2, 2024, and quickly became the highest-profile AI agent in crypto based on its Twitter presence and market intelligence commentary. It registered on ACP on May 28, 2025 -- over 6 months after its token launched.

### ACP activity has always been minimal

The first USDC settlement hit the ACP wallet on December 16, 2025, meaning there were zero on-chain ACP payments for the first 6+ months of the agent's ACP registration. When payments did begin, they started as $0.01 micro-transfers (likely testing) before transitioning to real service charges ($0.80-$1.60).

### The job count is front-loaded

Of the 35,840 total jobs reported by the API, the on-chain evidence suggests a large percentage occurred during two burst events (Dec 16-19, 2025 and Mar 21-22, 2026). Current organic activity is approximately 3-4 jobs per day.

### Price trajectory is independent of utility

AIXBT's token launched at fractions of a cent and reached significant market cap based purely on brand/narrative value. At time of investigation, it holds $13K TVL, 412,853 holders, and a mindshare score of 5.16% on Virtuals. None of these metrics correlate with on-chain utility -- they reflect speculation on the brand.

---

## 7. Key Findings

1. **AIXBT ranks #33 on the ACP leaderboard** with $37,935 aGDP -- 0.017% of the top agent (Ethy AI at $218M). It is the only pure INFORMATION agent in the top 33.

2. **On-chain USDC revenue totals approximately $52.92 lifetime.** The API's $38K figure measures VIRTUAL-denominated job fees, not actual USDC in the wallet.

3. **Current activity rate is ~3-4 jobs per day.** The historical job count (35,840) is inflated by two burst events that show patterns consistent with automated/bot activity rather than organic demand.

4. **The agent does nothing productive on-chain.** No trades, no DeFi interactions, no liquidity provision. It answers text queries about crypto market trends for 1-2 VIRTUAL per request.

5. **All three wallets are passive.** ACP wallet has never sent a transaction. TBA wallet has been dormant since August 2025. Sentient wallet does not exist.

6. **aGDP is not revenue.** For execution agents, aGDP reflects notional trade volume. For AIXBT, it is closer to actual fees. Either way, $38K across 10+ months of operation is negligible.

7. **Brand value and on-chain utility are completely decoupled.** AIXBT has 412,853 token holders and significant mindshare but near-zero economic footprint in the agentic economy it claims to participate in.

---

## Verification Notes

| Claim | Source | Verified |
|-------|--------|----------|
| ACP rank #33 | ACP leaderboard page 2, sorted by grossAgenticAmount desc | Yes |
| $37,935 aGDP | ACP API `/agents/26/details`, field `grossAgenticAmount` | Yes |
| $52.92 USDC balance | Blockscout `/addresses/0x5FaCE.../tokens` (USDC line item) | Yes |
| 0 outbound transfers | Blockscout token transfer history: all 50-per-page results show inbound only | Yes |
| First USDC: Dec 16, 2025 | Blockscout USDC transfers paginated to earliest (block ~39,543,000) | Yes |
| Burst events Dec/Mar | Blockscout USDC transfer timestamps show sub-minute intervals for hours | Yes |
| 24,581 token transfers | Blockscout `/addresses/0x5FaCE.../counters` | Yes |
| TBA dormant since Aug 2025 | Blockscout TBA token transfers: last ERC-20 at 2025-08-28 | Yes |
| Sentient wallet null | Virtuals API `/api/virtuals/1199`, `sentientWalletAddress: null` | Yes |
| 412,853 holders | Virtuals API `/api/virtuals/1199`, `tokenData.holderCount` | Yes |
| PaymentManager as USDC source | Blockscout: sender `0xEF4364...` is ERC1967Proxy -> PaymentManager | Yes |
| Ethy AI $218M aGDP | ACP API `/agents/84/details` | Yes |
| aGDP definition | Virtuals whitepaper `/llms-full.txt` | Yes |

---

## Suggested Content Angle

**"The most famous AI agent in crypto has earned $52.92."**

The story is not that AIXBT is a scam or that it lied about anything -- the ACP numbers are what they are, and aGDP measures what Virtuals says it measures. The story is the gap between brand and utility. AIXBT built an enormous following and token market on the promise of AI-driven market intelligence, but its actual on-chain participation in the agentic economy amounts to answering a few text queries per day for pocket change. In a space where agents like Ethy AI route hundreds of millions in trading volume, AIXBT's on-chain footprint is indistinguishable from a dormant wallet collecting spam airdrops.

The interesting question is whether that matters. AIXBT's value has always been its brand and its Twitter feed, not its ACP services. The 412,853 holders are not buying the token because of its $1.16-per-job query business. But if the thesis of "AI agents" is that autonomous systems create economic value on-chain, AIXBT is the clearest counterexample: a token that trades on narrative with zero on-chain utility.
