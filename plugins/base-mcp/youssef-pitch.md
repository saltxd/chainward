# Pitch — @0xyoussea (Youssef Amrani, Base)

Use this as the leave-behind in a DM or email. Keep it short. Don't lead with our product; lead with the gap we fill in the day-1 plugin set.

---

## DM/email draft (short version)

Hey Youssef — congrats on the Base MCP launch.

I run ChainWard (chainward.ai) — we label AI-agent wallets on Base and publish investigative Decodes on agent on-chain behavior. We've covered Bankr's two hacks, the ACP leaderboard data quality, Axelrod, AIXBT, OpenGradient, and a few more.

Looking at the 7 day-1 skill plugins, every one of them answers "how do I do something with this protocol?" — none answer the question that comes a step earlier: **"who's on the other side of this trade, and should I trust them?"**

We built a Base MCP skill plugin that fills that gap. Read-only. Eight tools that wrap our public API: agent lookup by address, ACP economics, ecosystem stats, Decode lookup. Pairs naturally with Bankr (vet a fresh launch's deployer), Virtuals (evaluate the ecosystem you're operating in), and Uniswap/Aerodrome (don't swap into a token without context).

Spec (markdown, follows your custom-plugin template): https://github.com/saltxd/chainward/blob/main/plugins/base-mcp/chainward.md
Standalone MCP if useful: https://github.com/saltxd/chainward/tree/main/packages/mcp-server

Two asks:
1. **`web_request` allowlist** for `api.chainward.ai` (read-only public endpoints — `/api/public/agents/*`, `/api/observatory/*`, `/api/public/decodes/*`). Without this, the plugin only works in shell-capable harnesses (Cursor, Claude Code, Codex), not consumer Claude/ChatGPT.
2. Quick feedback on the spec — happy to iterate before any consideration of getting promoted out of "custom."

Either way: huge fan of how the attribution suffix is implemented in account-sdk. We're writing about it.

— Marles (Twitter: @your_handle)

---

## Talking points if it converts to a call

**The wedge in one sentence:** "Every Base MCP plugin answers a 'how do I act?' question. ChainWard answers the 'who and what is this?' question that comes a step earlier."

**Why this matters for Base MCP's pitch:** the assistant should not feel comfortable proposing a swap into an unknown token via Uniswap, or a buy of a freshly-launched coin via Bankr, without a sanity check. Bankr's own plugin spec literally warns about low-liquidity, short-lived, meme-token launches with colliding symbols — that's the exact failure mode a ChainWard lookup catches. Read before write is the safer composition.

**Coverage we already have:**
- 10 published Decodes — Bankr hack trace, ACP leaderboard audit, aGDP vs FDV, AIXBT, Axelrod, BridgeKitty, OpenGradient, Wasabot, Live Leaderboard 2026-04
- Real-time labels on the Virtuals + ACP universe (~80k agents)
- Public API: agents, decodes, observatory, leaderboard
- Existing SDK (`@chainward/sdk`), CLI (`chainward`), elizaOS plugin

**What we're not asking for (yet):**
- Promotion into the native plugin set — happy to live as a custom-plugin reference.
- Co-marketing, co-branding, equity stuff — none of that. Just `api.chainward.ai` on the allowlist so the plugin works for consumer-app users.

**What we'd offer in return:**
- Publish the "Find the Tag" Decode crediting Base's attribution implementation as a forensic primitive.
- Add Base MCP to ChainWard's recommended-flows section: "see context here, act there."
- Help debug other custom plugins that hit allowlist friction — we have a working pattern they can copy.

**Fallback path if allowlist is a no:**
- Standalone `@chainward/mcp-server` works today in Cursor/Claude Code/Claude Desktop/Codex. We ship that regardless. Then the allowlist conversation can happen later when there's user demand pressuring it.

---

## Backup contacts (if no reply in a week)

- `dschlabach` / X `@dmschlabach` — top contributor to legacy base-mcp repo (128 commits)
- `hughescoin` — Sr. DevRel @ Base, friendlier intake channel
- `fan-zhang-sv` (@coinbase) — handled the legacy-repo sunset, knows the transition history

---

## Don't do

- Don't open a PR to `base/skills` adding the plugin. Their CONTRIBUTING.md says contributions are limited to Base core team. 18 outside PRs are sitting in the queue from May through October. PR is a low-EV channel today.
- Don't cold-DM until the standalone MCP server has been npm-published. The pitch is "we're already shipping this, want to be in your allowlist" — not "please bless our idea."
- Don't bury the lede. The first line of the DM should be the wedge sentence.
