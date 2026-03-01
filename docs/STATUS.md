# AgentGuard — Project Status

**Last updated:** 2026-02-28

## What Is AgentGuard

Observability and control plane for autonomous AI agents operating on-chain. Connects what an agent thinks (LLM decisions) with what an agent does (blockchain transactions). SaaS product targeting the ~3,000-4,000 teams running on-chain AI agents today.

## Current State: Local MVP Working

The full stack runs locally on Mac via Docker Compose (TimescaleDB + Redis) with the API and web frontend running via `pnpm dev`.

### What Works

| Feature | Status | Notes |
|---------|--------|-------|
| **Monorepo (Turborepo)** | Done | 6 packages, all build clean with zero errors |
| **Database (TimescaleDB)** | Done | 10 tables, 3 hypertables, compression + retention policies |
| **Auth (Better Auth)** | Done | Email/password signup + login, session cookies |
| **API (Hono)** | Done | 20+ endpoints, 7 service classes, rate limiting |
| **Web Dashboard (Next.js 15)** | Done | 7 pages, charts, transaction table, agent management |
| **Agent Registration** | Done | Register Base wallet addresses, CRUD operations |
| **Transaction Backfill** | Done | Pulls historical txs from Alchemy `getAssetTransfers` |
| **Balance Snapshots** | Done | Current balance + historical points for chart |
| **Stats/Overview** | Done | Fleet-level and per-agent stats with real data |
| **Balance History Chart** | Done | Recharts area chart with real data points |
| **Transaction Table** | Done | Paginated, sortable, shows real on-chain data |
| **API Key System** | Done | Create/revoke keys, SHA-256 hashing, scopes |
| **SDK** | Done | TypeScript client for programmatic access |
| **Docker Compose** | Done | TimescaleDB + Redis containers, multi-stage Dockerfiles |

### What Doesn't Work Yet

| Feature | Status | What's Needed |
|---------|--------|---------------|
| **Alchemy Webhooks (live indexing)** | Scaffolded | Need public URL for webhook endpoint (ngrok or deploy) |
| **Gas Analytics** | No data | Backfill doesn't fetch tx receipts (no gas_used/gas_price) |
| **USD Price Resolution** | Hardcoded | CoinGecko integration exists as placeholder; spam tokens show inflated values |
| **Token Filtering** | Missing | No spam token filtering — scam airdrops show in data |
| **Alert System** | Scaffolded | Workers built, needs real data flow to trigger |
| **Alert Delivery** | Scaffolded | Webhook/Slack/Discord delivery workers built, untested |
| **Balance Polling Worker** | Scaffolded | BullMQ worker exists, not running locally |
| **Helm Chart** | Empty | `deploy/helm/` exists but no templates |
| **K3s Deployment** | Not started | Needs Helm chart, sealed secrets, ingress |
| **CI/CD** | Not started | GitHub Actions workflows exist but untested |
| **Billing/Stripe** | Not planned for MVP | Tier limits enforced in code |

## Architecture

```
┌─────────────────────────────────────────────┐
│  Browser (localhost:3000)                    │
│  Next.js 15 + Tailwind + Recharts           │
│  Proxies /api/* to API server               │
└──────────────┬──────────────────────────────┘
               │
┌──────────────▼──────────────────────────────┐
│  API Server (localhost:8000)                 │
│  Hono + Better Auth + Drizzle ORM           │
│  Routes: auth, agents, transactions,         │
│  balances, gas, alerts, stats, keys          │
└──────┬────────────────┬─────────────────────┘
       │                │
┌──────▼──────┐  ┌──────▼──────┐
│ TimescaleDB │  │    Redis    │
│  (Docker)   │  │  (Docker)   │
│  Port 5432  │  │  Port 6379  │
└─────────────┘  └─────────────┘
```

### Packages

| Package | Purpose |
|---------|---------|
| `apps/api` | Hono API server |
| `apps/web` | Next.js 15 dashboard |
| `packages/db` | Drizzle schema + migrations |
| `packages/common` | Shared types, constants, utils |
| `packages/indexer` | BullMQ workers (base indexer, balance poller, alert evaluator, alert delivery) |
| `packages/sdk` | TypeScript SDK client |

## Running Locally

```bash
# Start infrastructure
cd deploy && docker compose up -d postgres redis

# Push schema (first time only)
DATABASE_URL="postgresql://agentguard:localdev@localhost:5432/agentguard" pnpm --filter @agentguard/db push --force

# Set up TimescaleDB hypertables (first time only)
docker exec deploy-postgres-1 psql -U agentguard -c "
SELECT create_hypertable('transactions', 'timestamp', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);
SELECT create_hypertable('balance_snapshots', 'timestamp', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);
SELECT create_hypertable('alert_events', 'timestamp', chunk_time_interval => INTERVAL '7 days', if_not_exists => TRUE);
"

# Start API
source .env && export DATABASE_URL REDIS_URL BETTER_AUTH_SECRET BETTER_AUTH_URL BASE_RPC_URL ALCHEMY_API_KEY NODE_ENV PORT CORS_ORIGINS
pnpm --filter @agentguard/api dev

# Start web (separate terminal)
pnpm --filter @agentguard/web dev

# Backfill data for a wallet
pnpm --filter @agentguard/api exec tsx ../../scripts/backfill.ts
```

## Environment Variables

See `.env.example`. Key ones:
- `DATABASE_URL` — TimescaleDB connection
- `REDIS_URL` — Redis connection
- `BETTER_AUTH_SECRET` — 32+ char random string
- `BASE_RPC_URL` — Alchemy Base RPC endpoint
- `ALCHEMY_API_KEY` — Alchemy API key (Base enabled)

## Known Issues / Bugs Fixed

All fixed as of `4655858`:
- Better Auth schema mapping (must pass tables explicitly to drizzle adapter)
- `trustedOrigins` required for cross-origin auth requests
- `.js` import extensions break drizzle-kit (stripped in db package)
- `ANY()` with JS arrays crashes postgres (use `inArray()` or `::text[]` cast)
- `Date` objects in raw SQL crash postgres driver (convert to ISO strings)
- Next.js proxy needed for same-origin cookies in dev
- Nested `<a>` tags cause React hydration errors

## What's Next (Priority Order)

### 1. Fix Data Quality
- [ ] Fetch transaction receipts for gas data (gas_used, gas_price)
- [ ] Integrate CoinGecko for real USD prices
- [ ] Filter known spam/scam tokens
- [ ] Improve backfill to use real block timestamps instead of random

### 2. Live Indexing
- [ ] Set up Alchemy webhook (requires public URL — ngrok for dev, or deploy first)
- [ ] Start the BullMQ indexer worker
- [ ] Start the balance polling worker
- [ ] Verify end-to-end: on-chain tx → webhook → worker → database → dashboard

### 3. Deploy to K3s
- [ ] Create Helm chart templates
- [ ] Set up sealed secrets for API keys
- [ ] Configure Traefik ingress (agentguard.k3s.nox or similar)
- [ ] Deploy TimescaleDB (or use existing postgres)
- [ ] Deploy Redis (or use existing)
- [ ] Deploy API + worker + web pods
- [ ] Set up Alchemy webhook pointing to public URL

### 4. Alert System
- [ ] Test alert evaluation with real transaction data
- [ ] Test webhook delivery
- [ ] Test Slack/Discord delivery
- [ ] Add "Send Test Alert" button to UI

### 5. Polish
- [ ] UI improvements (loading states, error messages, empty states)
- [ ] Transaction detail view
- [ ] Better agent naming on registration
- [ ] Settings page (tier display, API key management)
- [ ] Landing/marketing page

### 6. Production Readiness
- [ ] CI/CD pipeline (GitHub Actions → ArgoCD)
- [ ] Monitoring (Prometheus metrics endpoint)
- [ ] Proper error tracking
- [ ] Rate limiting tuning
- [ ] Database backup strategy
