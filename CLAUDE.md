# ChainWard

Onchain agent monitoring SaaS. Tracks transactions, balances, and gas for AI agents on Base. Alerts via Discord/Telegram/webhook.

## Quick Reference

- **Stack:** Turborepo monorepo, pnpm workspaces, TypeScript everywhere
- **API:** Hono (Node 22, port 8000) — `apps/api/`
- **Web:** Next.js 15, Tailwind CSS v4, dark theme — `apps/web/`
- **DB:** TimescaleDB (PostgreSQL + hypertables) via Drizzle ORM — `packages/db/`
- **Queue:** BullMQ + Redis — `packages/indexer/`
- **Auth:** SIWE (Sign In With Ethereum) + JWT in HTTP-only cookies
- **Wallet UI:** RainbowKit v2 + wagmi v2
- **Shared types/utils:** `packages/common/`
- **Intelligence:** `packages/intelligence/` (gitignored data) + `packages/intelligence-loader/` (public types/loader)
- **SDK:** `packages/sdk/` — TypeScript client, Bearer auth via `ag_` keys
- **CLI:** `packages/cli/` — `chainward` command (login, status, agents, txs, alerts, watch)
- **elizaOS Plugin:** `packages/elizaos-plugin/` — 6 actions, auto-registration on init

## Commands

```bash
pnpm install          # Install dependencies
pnpm lint             # ESLint over the whole monorepo (one flat config at the root)
pnpm lint:fix         # ...and auto-fix what's mechanical
pnpm typecheck        # Typecheck every workspace package
pnpm build            # Build all packages
pnpm dev              # Dev servers (api + web)
```

**Lint config is monorepo-wide, not per-package.** `eslint.config.mjs` at the root
is the only one — individual packages have no `lint` script and no local config.
It is deliberately type-*unaware* (`pnpm typecheck` already runs tsc everywhere),
so lint's job is the class of defect the compiler misses: dead code, unused
symbols, `case`-block scope leaks. `no-explicit-any` is a **warning** (78 open,
mostly raw-`sql` row casts) — errors fail CI, warnings don't.

## Deployment

K3s cluster, namespace `chainward`, **managed by Flux** (`saltxd/homelab-k3s`, `apps/chainward/helmrelease.yaml`) since 2026-10-11. To ship, push to `main`:

1. CI "Build & Push" runs lint, typecheck, tests, a secret scan and an image smoke boot, then builds all five images (api, web, indexer, acp-decoder, migrate) into GHCR
2. Its `bump` job commits the new tag into `homelab-k3s`
3. Flux upgrades the release: the chart's pre-upgrade hook runs pending migrations, then api, web, indexer and acp-decoder roll

**Never roll images by hand** (`deploy/deploy.sh` without flags, `kubectl set image`): Flux drift detection reverts it. Verify a deploy by the live image tag (`kubectl -n chainward get deploy web -o jsonpath='{..image}'`), not by CI going green. Only one CI run waits per branch: a newer push cancels the pending one, and the bump deploys the branch head. Rollback = revert the bump commit in `homelab-k3s`. `./deploy/deploy.sh --migrate-only` still works for an emergency out-of-band migration.

**DB migrations:** Add new `.sql` files to `packages/db/src/migrations/` with numeric prefix (e.g., `0007_description.sql`). The migration runner (`deploy/run-migrations.sh`, run by the chart's pre-upgrade hook with `psql -f`, no wrapping transaction) applies them in order and tracks completion in `schema_migrations`. Use `IF NOT EXISTS` / `IF EXISTS` for idempotency.

**Every image ships together** through the bump, so api, web and indexer can't drift apart. The indexer must stay in sync with the DB schema: a stale indexer crashes on missing columns.

## Architecture

```
Alchemy webhook → API /api/webhooks/alchemy → BullMQ (base-tx-process)
  → baseIndexer worker: parse tx, insert to DB, push to alert-evaluate queue
  → alertEvaluator worker: check alert configs, fire if triggered
  → alertDelivery worker: send to Discord/Telegram/webhook
```

Balance snapshots taken on agent registration + periodic polling.

## Provider Abstraction

RPC and webhook functionality is abstracted behind provider interfaces:

- **Interfaces:** `ChainDataProvider` + `WebhookProvider` in `packages/common/src/providers/types.ts`
- **Factory:** `apps/api/src/providers/index.ts` — reads `CHAIN_PROVIDER` env var (default: `alchemy`)
- **Alchemy impl:** `apps/api/src/providers/alchemy/` — webhook management, signature verification, RPC wrappers
- **Indexer impl:** `packages/indexer/src/lib/chainDataProvider.ts` — lightweight provider for backfill
- **Switching guide:** `docs/PROVIDER-SWITCHING.md`
- **Standard RPC** calls (eth_getBalance, getTransaction, etc.) go through viem — not abstracted, just change `BASE_RPC_URL`
- To add a provider: create adapter files + register in factory + update env vars

## Intelligence Separation

Curated data (agent labels, protocol registry) is separated from the open-source engine:

- **Data** lives in `packages/intelligence/*.json` — gitignored, not in the public repo
- **Types + loader** in `packages/intelligence-loader/` — public, provides `getObservatoryAgents()`, `getProtocolRegistry()`, etc.
- **Seed scripts** read from `packages/intelligence/` and populate the DB
- **`INTELLIGENCE_SOURCE` env var:** `local` (read files), `remote` (future API), `empty` (self-hosted default)
- Auto-detects: if `observatory-agents.json` exists locally, uses `local`; otherwise `empty`
- Self-hosters get an empty observatory and add agents via API/UI
- See `packages/intelligence/README.md` for setup

## Critical Patterns

- **PostgreSQL arrays in Drizzle `sql` templates:** `${`{${arr.join(',')}}`}::text[]` — NOT `${arr}::text[]`
- **`useApi` hook unwraps `.data`** — the response IS the data array/object, not `{ data, success }`
- **React hooks must come before early returns** in components
- **API proxy (not rewrites)** for cookie forwarding — `apps/web/src/app/api/[...path]/route.ts`
- **Brand color:** `#4ade80` (green)
- **No shadcn** — custom UI components in `apps/web/src/components/ui/`
- **API auth:** All data routes accept both `Bearer ag_` API keys AND session cookies via `requireApiKeyOrSession()` middleware

## Key Gotchas

- Delivery channels are **Discord + Telegram** (not Slack). DB column: `telegram_chat_id`
- Recharts BarChart tooltip cursor needs `cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}` on dark themes
- Agent detail balance chart uses `1h` buckets (new agents need this); Overview uses `1d`
- SIWE nonces must be alphanumeric (strip hyphens from UUID)
- `TELEGRAM_BOT_TOKEN` env var needed for Telegram delivery
- elizaOS plugin uses `@elizaos/core@1.7.2` — Action handlers return `ActionResult`, examples use `name` (not `user`), `actions` array (not `action` string)
- **API proxy body forwarding** — `apps/web/src/app/api/[...path]/route.ts` only forwards request body for POST/PUT/PATCH. Do NOT forward body for DELETE/GET/HEAD — sending `body: ""` with `Content-Type: application/json` on DELETE causes upstream issues
- **Sign-in must work for smart wallets** — `apps/api/src/lib/siweVerify.ts` checks EOA (ecrecover) then ERC-1271/ERC-6492 on Base via viem `verifyMessage`. `siwe`'s own `verify()` without a provider only accepts EOAs (Coinbase Smart Wallet / Safe users could not log in for months, and a bad signature was a 500). CI's "Login smoke (production)" job runs `apps/api/scripts/login-smoke.mts` after every deploy, once `/api/health` reports the new commit: EOA + undeployed smart wallet sign in, tampered messages refused. Any QA pass must log in with a smart wallet, not just an EOA
- **Dockerfile deps stages list package.jsons explicitly** — api/indexer/acp-decoder Dockerfiles COPY each workspace package.json by hand. A new workspace package, or a new cross-package import into a source-bundled package (e.g. packages/decode), MUST be added to the `deps` + `build` stages of every consuming Dockerfile or the image build fails with esbuild "Could not resolve" even though local builds pass (CI run 28991942523)

## Decodes

On-chain investigation articles rendered at `chainward.ai/decodes/{slug}`. The web app auto-discovers markdown files in `deliverables/{agent-slug}/decode.md` with YAML frontmatter (`title`, `subtitle`, `date`, `slug`).

**Before starting or continuing a decode, read `docs/decode-publishing-runbook.md`.** It covers current pipeline state, the X/Cloudflare/OG gotchas we burned hours learning, the next-decode candidate (Axelrod), and bootstrap instructions for fresh sessions. Operational checklist lives next to the deliverables in `deliverables/README.md`. Investigation methodology + voice guide is **BookStack page 172**.

To pick the next decode target programmatically: `pnpm decode:candidates`.

## Project Status

See `docs/STATUS.md` for full feature matrix, key files listing, deployment details, and roadmap.
