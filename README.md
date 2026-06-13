<p align="center">
  <img src="apps/web/public/chainward-logo.svg" alt="ChainWard" width="64" height="64" />
</p>

<h1 align="center">ChainWard</h1>

<p align="center">
  An automated, adversarially-verified on-chain investigation engine for AI agents on Base.
</p>

<p align="center">
  <a href="https://chainward.ai/decodes">Decodes</a> &middot;
  <a href="https://chainward.ai/base">Observatory</a> &middot;
  <a href="https://chainward.ai">Website</a>
</p>

---

ChainWard investigates what AI agents on Base actually do on-chain — and proves it. Its core is an automated pipeline that researches a target, writes a forensic report, and runs that report through a **verifier gauntlet** that re-checks every numeric claim against the chain before anything publishes. There is no human in the loop between the trigger and the published article. The data is read from a **self-hosted Base node**, so the ground truth has no third-party RPC dependency.

The interesting engineering here isn't "an LLM writes crypto articles." It's the machinery that stops the LLM from being confidently wrong in public.

## The auto-decode pipeline

One command — `pnpm decode:auto <@handle|0xaddress>` — resolves the target, then spawns Claude Code headless against an orchestrator prompt that runs a five-phase, multi-subagent pipeline. Each phase is a fresh fan-out of subagents; the orchestrator only dispatches and gates.

```
  decode:auto @target
        │
        ▼
  ┌─────────────────────────────────────────────────────────┐
  │ 1. RESEARCH    3 parallel agents                          │
  │                identity/chain · token economics · utility │
  ├─────────────────────────────────────────────────────────┤
  │ 2. WRITE       1 agent → decode.md + 5-tweet thread       │
  ├─────────────────────────────────────────────────────────┤
  │ 3. GAUNTLET    3 parallel verifiers                       │
  │                citation · failure-mode · voice            │
  ├─────────────────────────────────────────────────────────┤
  │ 4. DECISION    citation + failure-mode block; voice is    │
  │                advisory. Any FAIL → 1 retry, then halt.   │
  ├─────────────────────────────────────────────────────────┤
  │ 5. PUBLISH     render OG card → commit → deploy →          │
  │                poll live URL → post launch tweet          │
  └─────────────────────────────────────────────────────────┘
        │
        ▼
   published decode  ·  or a halt report (nothing ships)
```

## Why the gauntlet matters

The hard problem with LLM-generated analysis is **confident fabrication** — a plausible number with no basis. ChainWard's gauntlet is built on three rules, enforced by the orchestrator, that make unsupervised publishing safe:

- **Verifiers re-fetch; they don't trust.** The citation verifier extracts every numeric and factual claim from the draft and re-fetches it independently from the source — transaction receipts off the self-hosted node, the ACP API, Blockscout — then compares within hard tolerances (USD ≤ $0.01, counts and tx hashes exact). *An uncited claim is an automatic FAIL, even if the value happens to be right.*
- **Verifier output is read-only.** The orchestrator cannot litigate a FAIL or spawn a "re-check the verifier" agent. If the verifier says FAIL, it's FAIL.
- **One retry, then stop.** The writer gets exactly one corrective pass against the failed claims. If anything still fails, the run **halts and publishes nothing**. There is no iterating to a green light — *convergence is rationalization*.

The result is a pipeline that would rather ship nothing than ship a wrong number. Every published decode has had each of its claims re-derived from chain data by an agent that was trying to fail it.

## Proof

Investigations the pipeline has published — each claim chain-verified and falsifiable ([all decodes →](https://chainward.ai/decodes)):

- **[Degen Claw](https://chainward.ai/decodes/degen-claw-on-chain)** — "The dashboard says $490,296 of agentic GDP. We checked Hyperliquid directly: the account holds $11.18 and has never placed a trade."
- **[BridgeKitty](https://chainward.ai/decodes/bridgekitty-on-chain)** — a top-10 agent on the ACP dashboard that has never sent a transaction on Base, across every wallet and endpoint we could query.
- **[AIXBT](https://chainward.ai/decodes/aixbt-on-chain)** — the most famous AI agent in crypto, and exactly what $52.92 of on-chain earnings can and cannot tell you.
- **[Bankr's 14-Wallet Hack](https://chainward.ai/decodes/bankr-hack-trace)** — two AI-mediated drains in 15 days, traced on-chain, with no smart-contract bug involved.

## How it's built

- **Self-hosted Base node** — a reth node ChainWard runs itself. Verifiers read ground truth directly: no shared RPC, no rate limits, no provider that can deprecate an endpoint.
- **`packages/decode`** — the typed decode core, independent of the LLM: target resolution, chain audit, claim-vs-on-chain discrepancy detection, USDC-flow classification, peer clustering, wallet-architecture detection, and survival scoring. Unit-tested (80+ tests).
- **`apps/acp-decoder`** — the same decode core packaged as a service agent on Virtuals' Agentic Commerce Protocol, which has completed a real, paid, on-chain job end-to-end.
- **`scripts/auto-decode` + `scripts/auto-decode-prompts`** — the orchestrator and the subagent prompts (research, writer, and the three verifiers). The prompts are the most interesting reading in the repo.

ChainWard also includes the full-stack platform the engine grew out of: a real-time indexer (Alchemy webhooks → BullMQ → TimescaleDB), an alert pipeline (Discord/Telegram/webhook), a Next.js dashboard, and the public [Observatory](https://chainward.ai/base) that tracks agent wallets across Base.

## Repo layout

| Path | What it is |
|------|------------|
| `scripts/auto-decode/` | Pipeline entrypoint — spawns the orchestrator |
| `scripts/auto-decode-prompts/` | Orchestrator + research + verifier-gauntlet prompts |
| `packages/decode/` | Typed, LLM-independent decode core (80+ tests) |
| `apps/acp-decoder/` | Decode core as a paid Virtuals ACP service agent |
| `apps/api/` | Hono API (Node 22) |
| `apps/web/` | Next.js 15 dashboard, decodes, and Observatory |
| `packages/indexer/` | BullMQ workers — indexing, alerts, analytics |
| `packages/db/` | Drizzle ORM schema + migrations (TimescaleDB) |
| `packages/observatory/` | Aggregate queries behind the public Observatory |
| `packages/{sdk,cli}/` | TypeScript client and `chainward` CLI |
| `packages/{elizaos,agentkit,virtuals}-plugin/` | Framework integrations |

A Turborepo monorepo, TypeScript end-to-end.

## Run it

```bash
pnpm install
pnpm typecheck     # all packages
pnpm build
pnpm dev           # API on :8000, web on :3000

pnpm decode:auto @some-agent   # run the pipeline (needs a Claude Code token + MCP config)
```

## License

MIT
