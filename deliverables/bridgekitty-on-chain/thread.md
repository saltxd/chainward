# BridgeKitty — Thread Draft

Brand voice: educational, not accusatory. The dashboard isn't lying — it's measuring a different thing than readers assume.

---

## Tweet 1 / Hook (273 chars)

BridgeKitty just ranked #3 on the Virtuals ACP scan today:

595 daily jobs. $56 aGDP. 100% success rate.

That's 31% of the entire ACP network's jobs from one agent.

We checked every wallet, every endpoint, every Blockscout counter.

The chain shows zero activity. Anywhere.

---

## Tweet 2 / Wallets (272 chars)

There are TWO BridgeKitty records (ids 39920 + 40009), same owner, registered the same day.

Their three relevant addresses on Base:

• Wallet A 0x4c30…Fad1c — 0 txs, 0 transfers, 0 USDC
• Wallet B 0xA40B…11BE — 0 txs, 0 transfers
• Owner 0x44e7…ecad — 0 txs, 0 transfers

---

## Tweet 3 / API surface (270 chars)

Every ACP API endpoint we queried agrees with the chain:

• /agents details → totalJobCount: 0
• /metrics/agent → grossAgenticAmount: 0
• /metrics/agent/daily-metrics → empty arrays
• /agents/engagements → empty
• /metrics/top-agents (31 days) → no entry

The "595 jobs" doesn't appear in any agent-level API.

---

## Tweet 4 / Likely explanation (272 chars)

$56 ÷ 595 = $0.094 per job. Below the gas cost of an ACP settlement.

The most likely read: BridgeKitty is an off-chain MCP service. "Jobs" = bridge route queries. Nothing settles on Base because nothing needs to.

That's reasonable. It's just not the same unit as "jobs" elsewhere on the leaderboard.

---

## Tweet 5 / The point + link (267 chars)

"aGDP" and "Jobs" on the Virtuals dashboard are sums of several things that don't share units. The column doesn't tell you which.

Ethy AI's million jobs settle on Base. BridgeKitty's 595 don't appear to settle anywhere we can see.

Full decode → chainward.ai/decodes/bridgekitty-on-chain

---

## Graphic notes

Optional 1200x675 cards (ChainWard design system: `#0a0a12` bg, `#12121f` cards, sharp corners, JetBrains Mono for numbers):

1. **The four-zero card**: 3 columns (Wallet A, Wallet B, Owner). Each shows 4 lines (txs, token transfers, ETH, USDC) all "0". Dashboard "595 jobs" caption underneath in red.
2. **Two leaderboard columns side by side**: Left = "What the dashboard shows" (BridgeKitty 595 jobs / $56). Right = "What every API + Blockscout shows" (all zeros). Use the OG card for tweet 1.
3. **Network share**: simple stacked bar showing today's 1,926 jobs with BridgeKitty as 31% slice. Caption: "31% of today's ACP jobs has no on-chain settlement record."

Pin tweet 1; card 1 attached to tweet 2, card 2 used as OG for tweet 1, card 3 attached to tweet 4.

---

## Verification sources for tweets

- Dashboard 595 jobs / $56 aGDP: screenshot of `app.virtuals.io/acp/scan/agents` (Agents tab, Daily view), captured 2026-05-16 ~13:42 UTC
- 31% network share: dashboard daily job total = 1,926; 595/1,926 = 30.89% (same screenshot)
- Two records: `https://acpx.virtuals.io/api/agents?filters[name][$containsi]=bridgekitty`
- Wallet A 0/0/0: `https://base.blockscout.com/api/v2/addresses/0x4c3006438Ef048e8A1E3AfA1B38113b7501FAd1c/counters`
- Wallet B 0/0: `https://base.blockscout.com/api/v2/addresses/0xA40B7f0FBcB428D21c6383f621ebC702c16411BE/counters`
- Owner 0/0: `https://base.blockscout.com/api/v2/addresses/0x44e7cb3f38abaf1a7448cf40bd7ee19e3678ecad/counters`
- ACP detail zeros: `https://acpx.virtuals.io/api/agents/40009/details`
- Daily-metrics empty: `https://acpx.virtuals.io/api/metrics/agent/40009/daily-metrics`
- Top-agents 31-day series: `https://acpx.virtuals.io/api/metrics/top-agents`
- Sentinel USDC balance: `ssh cw-sentinel` → `eth_call` to `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913.balanceOf(wallet)` → returns `0x0`

Tweets 1, 2, 3, 4, 5 character counts (target <280): 273, 272, 270, 272, 267.
