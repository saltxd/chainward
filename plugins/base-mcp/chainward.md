# ChainWard Plugin

> [!IMPORTANT]
> ## STOP — COMPLETE ONBOARDING BEFORE USING THIS PLUGIN
>
> Before calling any ChainWard endpoint, you MUST complete the Base MCP onboarding flow:
> 1. Call `get_wallets` (Detection)
> 2. Present wallet status and disclaimer (Onboarding)
>
> The user's wallet address — used to default `lookup` calls when no address is supplied — is only confirmed during Detection.

ChainWard is the read-side intelligence layer for the AI-agent economy on Base. It labels agent wallets (Virtuals, ACP, eliza, Bankr, custom frameworks), tracks their on-chain activity in real time, and publishes investigative "Decodes" that verify or refute agent claims. This plugin is **read-only** — it never asks the user to sign anything.

**Fetching data:** the ChainWard API is not yet on the Base MCP `web_request` allowlist. Construct each request as a GET with all parameters in the path. If `web_request` rejects the host, fall back to whatever HTTP capability the harness exposes, or ask the user to paste the response into the chat.

> **Alternative:** for shell-capable harnesses (Cursor, Claude Code, Codex, Claude Desktop), users can install `chainward-mcp-server` as a sidecar MCP. That bypasses the `web_request` allowlist entirely and exposes the same tools natively. See `Pair with the standalone server` below.

**Supported chain:** Base mainnet (`8453` / `0x2105`). Agents on other chains are out of scope for v0.

**No `send_calls` mapping.** ChainWard does not produce unsigned calldata; it returns labeled context. Use the returned data to inform the user before they invoke any other plugin's prepare endpoint.

---

## When to call this plugin

Reach for ChainWard **before** the user transacts with an unfamiliar address or token, or when they ask any of:

- "Is `0x…` an AI agent? Who runs it?"
- "What's this wallet been doing?"
- "Has ChainWard written about this address?"
- "Is this token launched by a known agent?"
- "Should I trust the deployer of `0x…`?"

Pair naturally with **Bankr** (vet a fresh launch's deployer before buying), **Virtuals** (evaluate the agent ecosystem you're entering), and **Uniswap / Aerodrome** swap flows into agent tokens.

---

## Read endpoints

### 1. Quick lookup — "is this a known agent?"

```
GET https://api.chainward.ai/api/observatory/lookup/{wallet}
```

Cheapest call. Returns yes/no + label + decode pointers. Use this first.

Response:

```json
{
  "success": true,
  "data": {
    "walletAddress": "0x...",
    "isKnownAgent": true,
    "sources": {
      "chainward": { "name": "Aixbt", "framework": "virtuals", "chain": "base" },
      "acp": { "name": "AIXBT", "symbol": "AIXBT", "role": "agent", "twitterHandle": "aixbt_agent", "hasGraduated": true }
    },
    "decodes": [ { "slug": "aixbt-on-chain", "title": "...", "url": "https://chainward.ai/decodes/aixbt-on-chain", "date": "2026-04-25" } ]
  }
}
```

If `isKnownAgent` is `false`, the address is not tracked. Tell the user "ChainWard does not label this address" — not an error.

### 2. Full agent profile

```
GET https://api.chainward.ai/api/public/agents/{wallet}
```

Heavier: returns the full label + 24h/7d stats + 7-day hourly balance history + 30-day daily gas history + most recent 20 transactions + any matching Decodes. Use when the user wants detail.

Returns `404` if the address is not tracked. That's information, not an error.

### 3. Agent economics (ACP revenue, P&L, gas efficiency)

```
GET https://api.chainward.ai/api/observatory/economics/{wallet}
```

ACP revenue, jobs, success rate, unique buyers, 30-day gas burn, P&L, gas efficiency ratio. Use when the user asks about revenue or profitability.

### 4. Observatory overview (ecosystem stats)

```
GET https://api.chainward.ai/api/observatory
```

Aggregate stats for the tracked-agent universe. Use for broad questions like "how active is the agent economy this week?"

### 5. Top agents leaderboard

```
GET https://api.chainward.ai/api/observatory/leaderboard
```

Ranked list by activity. Use for "who are the top agents on Base?"

### 6. Live activity feed

```
GET https://api.chainward.ai/api/observatory/feed
```

Recent labeled-agent activity across the ecosystem. Use for "what's happening right now?"

### 7. List published Decodes

```
GET https://api.chainward.ai/api/public/decodes
```

Every published Decode, newest first. Each entry has slug, title, subtitle, date, URL, and the addresses that decode covers.

### 8. Find Decodes for a specific address

```
GET https://api.chainward.ai/api/public/decodes/lookup/{wallet}
```

Returns every Decode that references this address. Use for "has ChainWard written about 0x…?".

---

## Orchestration patterns

### Pattern A — pre-transaction safety check

```
1. get_wallets -> address
2. Identify the address the user is about to transact with (deployer, counterparty, token contract)
3. GET /api/observatory/lookup/{address}
4. If isKnownAgent=true and a Decode exists: surface the title + URL before the user signs anything
5. Hand back to the user for confirmation; only then invoke the action plugin
```

### Pattern B — pair with Bankr (recommended)

```
1. Bankr GET /token-launches -> { tokenAddress, deployer: { walletAddress, xUsername } }
2. ChainWard GET /api/observatory/lookup/{deployer.walletAddress}
3. Present: "Bankr says this token was deployed by @handle. ChainWard says that wallet is [agent name | not labeled]. [Recent activity summary]. Proceed with swap?"
4. Hand off to Uniswap/Aerodrome swap flow only after the user confirms
```

### Pattern C — investigate before deeper action

```
1. User asks "is X interesting?" with an agent name or wallet
2. GET /api/public/agents/{wallet}  (full profile + Decodes)
3. If a Decode covers this address, summarise it before reporting raw stats
4. Offer follow-ups: "Want to set an alert?" "Want economics?"
```

---

## Pair with the standalone server

For Cursor / Claude Desktop / Claude Code / Codex users, install ChainWard as a standalone MCP server:

```jsonc
{
  "mcpServers": {
    "chainward": {
      "command": "npx",
      "args": ["-y", "chainward-mcp-server"]
    }
  }
}
```

This installs ChainWard's tools natively in the assistant, alongside Base MCP. Recommended prompt: *"Before transacting with an unfamiliar address or token, always call ChainWard's `lookup_agent` first."*

---

## Rate limits & errors

- Public endpoints are rate-limited to **60 req/min per IP**. Batch lookups by collecting candidate addresses before calling.
- `400` = malformed wallet address (must match `^0x[a-fA-F0-9]{40}$`).
- `404` on `/api/public/agents/{wallet}` = the address is not a tracked public agent. Not an error — pass to the user.
- `404` on `/api/observatory/economics/{wallet}` = no ACP profile for this address.
- All other 4xx/5xx: surface the error and offer to retry once.

---

## Patterns this plugin uses

| Pattern | Where |
|---|---|
| Read-only intelligence layer | All endpoints |
| Address → labeled-agent metadata lookup | `/api/observatory/lookup/{wallet}` |
| Pair-before-swap (read ChainWard → write via another plugin) | Orchestration patterns A and B |
| Manifest-style content discovery | `/api/public/decodes` and `/api/public/decodes/lookup/{wallet}` |

---

## Related

- ChainWard docs: https://chainward.ai/docs
- Decodes (investigative reports): https://chainward.ai/decodes
- Standalone MCP server: `npm i -g chainward-mcp-server` — works in any MCP client
- API key signup (only needed for write/authenticated endpoints, not covered by this plugin): https://chainward.ai
