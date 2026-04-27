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
pnpm typecheck        # Typecheck all 9 packages
pnpm build            # Build all packages
pnpm dev              # Dev servers (api + web)
```

## Deployment

K3s cluster, namespace `chainward`. **Always use the deploy script** — never run `kubectl set image` manually:

```bash
./deploy/deploy.sh                    # deploy current HEAD (migrate + rollout + verify)
./deploy/deploy.sh --tag abc1234      # deploy specific tag
./deploy/deploy.sh --migrate-only     # apply pending DB migrations only
./deploy/deploy.sh --skip-migrate     # skip migrations, just roll out images
./deploy/deploy.sh --dry-run          # preview what would happen
```

The deploy script:
1. Verifies all 3 images exist in GHCR
2. Creates ConfigMaps from migration SQL files in the repo
3. Runs a K8s migration Job (tracked via `schema_migrations` table)
4. Rolls out api, web, indexer deployments
5. Waits for rollouts and verifies health endpoints

**DB migrations:** Add new `.sql` files to `packages/db/src/migrations/` with numeric prefix (e.g., `0007_description.sql`). The migration runner applies them in order and tracks completion. Use `IF NOT EXISTS` / `IF EXISTS` for idempotency.

**Deploy ALL THREE when shared packages (db, common) change.** The indexer especially must stay in sync with the DB schema — a stale indexer will crash on missing columns.

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
- **Deploy script waits for GHCR** — `deploy.sh` polls for images before rolling out (15s intervals, 10 min timeout). If CI hasn't pushed images yet, the deploy blocks instead of creating ImagePullBackOff pods

## Decodes

On-chain investigation articles rendered at `chainward.ai/decodes/{slug}`. The web app auto-discovers markdown files in `deliverables/{agent-slug}/decode.md` with YAML frontmatter (`title`, `subtitle`, `date`, `slug`).

**Before starting or continuing a decode, read `docs/decode-publishing-runbook.md`.** It covers current pipeline state, the X/Cloudflare/OG gotchas we burned hours learning, the next-decode candidate (Axelrod), and bootstrap instructions for fresh sessions. Operational checklist lives next to the deliverables in `deliverables/README.md`. Investigation methodology + voice guide is **BookStack page 172**.

To pick the next decode target programmatically: `pnpm decode:candidates`.

## Project Status

See `docs/STATUS.md` for full feature matrix, key files listing, deployment details, and roadmap.
