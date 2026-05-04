# Twitter Thread: ACP Leaderboard Audit

---

**Tweet 1/5** [graphic: table of top 10 with sentinel Y/N and chain activity]

We audited the top 50 agents on the Virtuals ACP leaderboard.

The "Last 7D" sparkline column shows N/A for many agents that ARE active on-chain.

Here's what it actually measures — and the three patterns hiding behind one column.

---

**Tweet 2/5** [graphic: daily-metrics endpoint response showing past7dVolume/past7dNumJobs]

The sparkline reads from a single API endpoint: /api/metrics/agent/{id}/daily-metrics

It plots the SLOPE of aGDP (notional trading volume) — not wallet transfers, not tx count.

An agent with 50+ on-chain transfers this week can still show N/A if its ACP pipeline has no daily snapshots.

---

**Tweet 3/5** [graphic: two-column table — "top-level lastActiveAt" vs "metrics.lastActiveAt"]

38% of the top 50 show lastActiveAt: "2999-12-31" — a date in the far future.

This is NOT a dormancy flag. It's a backend migration artifact.

Every one of those agents returns isOnline: true in the nested metrics field.

When an agent is online, metrics.lastActiveAt = current server timestamp. It advances in real time.

---

**Tweet 4/5** [graphic: Ethy AI card showing 1.1M transfers + "last active 21 days ago"]

The most striking individual case: Ethy AI (rank #1, $218M aGDP).

Chain: 1,138,715 total transfers. Active TODAY (2026-04-29T19:27 UTC per Blockscout).
Dashboard: lastActiveAt = April 8. isOnline = False. No sparkline data.

The #1 agent by leaderboard rank has a dashboard that reads three weeks stale.

Blockscout source: base.blockscout.com/api/v2/addresses/0xfc9f.../counters

---

**Tweet 5/5**

3 things we verified:

1. "Last 7D" = aGDP accumulation rate, sourced from daily-metrics endpoint
2. 22/50 chain-active agents have misleading top-level lastActiveAt dates  
3. totalJobs returns null for ALL 50 agents on the detail endpoint (field name bug)

Full decode: chainward.ai/decodes/acp-leaderboard-audit

---

**Graphic notes:**
- Tweet 1: 1200x675, dark bg, table with 10 rows: Name | aGDP | Sentinel? | Chain 7d active?
- Tweet 2: Screenshot of raw daily-metrics JSON response (Axelrod example), annotated
- Tweet 3: Side-by-side showing sentinel date vs metrics.lastActiveAt live timestamp
- Tweet 4: Single agent card layout, Ethy AI, chain stat vs ACP stat contrast
- Tweet 5: Text-only summary card with 3 bullet points, ChainWard shield
