# chainward-mcp-server

[![npm](https://img.shields.io/npm/v/chainward-mcp-server.svg)](https://www.npmjs.com/package/chainward-mcp-server)

Model Context Protocol server exposing ChainWard's read-side intelligence on AI agents (Base mainnet).

ChainWard labels AI-agent wallets, tracks their on-chain activity in real time, and publishes investigative Decodes. This package lets any MCP-compatible assistant (Claude Desktop, Cursor, Claude Code, Codex, ChatGPT) query that intelligence via natural language — without leaving the chat.

This is the **standalone** distribution path. It works alongside Base MCP (which handles signing) but does not depend on Base MCP's `web_request` allowlist.

## Tools

| Tool | Purpose |
|---|---|
| `lookup_agent` | Is `0x…` a known AI agent? Returns label + Decode pointers. Cheap. |
| `get_agent_profile` | Full profile: 7d balance, 30d gas, recent 20 txs, related Decodes. |
| `get_agent_economics` | ACP revenue, jobs, success rate, gas efficiency, P&L. |
| `get_observatory_overview` | Ecosystem-wide stats. |
| `get_top_agents` | Leaderboard by activity. |
| `get_activity_feed` | Recent labeled-agent activity. |
| `list_decodes` | Every published Decode, newest first. |
| `find_decodes_for_address` | All Decodes referencing a specific address. |

All tools default to ChainWard's public endpoints (no auth). Setting `CHAINWARD_API_KEY` enables future authenticated tools.

## Install + run

### Claude Desktop / Cursor / Claude Code (stdio)

```jsonc
// claude_desktop_config.json or .cursor/mcp.json
{
  "mcpServers": {
    "chainward": {
      "command": "npx",
      "args": ["-y", "chainward-mcp-server"],
      "env": {
        "CHAINWARD_API_URL": "https://api.chainward.ai"
      }
    }
  }
}
```

### Remote HTTP transport

```bash
CHAINWARD_MCP_TRANSPORT=http PORT=3300 npx -y chainward-mcp-server
# MCP endpoint: http://localhost:3300/mcp
# Health: http://localhost:3300/healthz
```

Then point your client at `http://your-host:3300/mcp`.

## Env vars

| Var | Default | Description |
|---|---|---|
| `CHAINWARD_MCP_TRANSPORT` | `stdio` | `stdio` or `http` |
| `PORT` | `3300` | HTTP transport listen port |
| `CHAINWARD_API_URL` | `https://api.chainward.ai` | API base URL |
| `CHAINWARD_API_KEY` | _(none)_ | Optional `ag_…` Bearer key |

## Pair with Base MCP

This server is read-only. To **act** on what you learn (swap, lend, etc.), install Base MCP alongside this server. Recommended assistant prompt pattern:

> Before transacting with any unfamiliar address or token, call ChainWard's `lookup_agent` first. If a Decode exists, summarise it for the user before invoking any Base MCP plugin.

## License

MIT
