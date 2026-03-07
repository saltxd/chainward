# ChainWard — Project Status

**Last updated:** 2026-03-07

## What Is ChainWard

Real-time monitoring, smart alerts, and gas analytics for autonomous AI agents operating on Base. SaaS product targeting the ~3,000-4,000 teams running on-chain AI agents. Previously named AgentGuard — rebranded March 2026.

**Domain:** chainward.ai
**API:** api.chainward.ai
**Internal:** chainward.k3s.nox
**GitHub:** github.com/saltxd/chainward

## Current State: Live & Functional

Full stack deployed to K3s cluster. Live indexing via Alchemy webhooks processes real Base mainnet transactions in real time. Alert pipeline delivers to Discord and Telegram. Two agents registered and actively monitored. Public API with key-based auth live. SDK and elizaOS plugin published to npm. Registry PR submitted to elizaOS.

### What Works

| Feature | Status | Notes |
|---------|--------|-------|
| **Monorepo (Turborepo)** | Done | 8 packages (`@chainward/*`), all build clean |
| **Database (TimescaleDB)** | Done | 10 tables, 3 hypertables, compression + retention |
| **Auth (SIWE + JWT)** | Done | Wallet sign-in via RainbowKit, JWT sessions in HTTP-only cookies |
| **API (Hono)** | Done | 20+ endpoints, 7 service classes, rate limiting |
| **Web Dashboard (Next.js 15)** | Done | 8 pages, charts, transaction table, agent management |
| **Landing Page** | Done | Terminal-aesthetic hero with animated activity feed, feature grid, CTA |
| **Login Page** | Done | Aerodrome-style pre-connect card with RainbowKit modal, SIWE sign-in |
| **Live Indexing** | Done | Alchemy webhooks → API → BullMQ → indexer → TimescaleDB |
| **Auto Webhook Management** | Done | Agent CRUD auto-adds/removes wallets from Alchemy webhook |
| **Agent Registration** | Done | Register Base wallet addresses, CRUD, inline rename on detail page |
| **Transaction Indexing** | Done | Real-time + backfill, gas from receipts, block timestamps, CoinGecko USD |
| **Balance Snapshots** | Done | Current balance + historical points for chart (hourly on agent, daily on overview) |
| **Stats/Overview** | Done | Fleet-level and per-agent stats with real data, spam-filtered |
| **Alert System** | Done | 6 alert types, 3 delivery channels (webhook/Telegram/Discord) |
| **Alert UI** | Done | AlertCard component, inline edit, toast notifications, form validation |
| **Alert History** | Done | Event list with type badges, clickable tx hashes, delivery status |
| **Spam Token Filtering** | Done | Address blocklist + name pattern matching + NULL-safe SQL |
| **Charts** | Done | Balance, Volume, Gas charts with brand-green (#4ade80), dark theme tooltips |
| **Toast Notifications** | Done | Success/error/info toasts for transient operations |
| **API Key Auth** | Done | Create/revoke keys, SHA-256 hashing, scopes. All data routes accept `Bearer ag_` keys. |
| **SDK** | Done | `@chainward/sdk@0.1.0` — published to npm, TypeScript client with Bearer auth |
| **API Docs** | Done | `/docs/api` — 18 grouped endpoints, SDK examples, Bearer auth |
| **elizaOS Plugin** | Done | `@chainward/elizaos-plugin@0.1.0` — published to npm, 6 actions, auto-registration on startup |
| **elizaOS Registry PR** | Pending | PR #287 submitted to `elizaos-plugins/registry` |
| **AgentKit Plugin** | Done | `@chainward/agentkit-plugin@0.1.0` — published to npm, 6 actions, ActionProvider with CreateAction decorators |
| **Integrations Section** | Done | "Works with" row on landing page: elizaOS (live), AgentKit (live), Virtuals (soon) |
| **Pricing Page** | Done | Free / Pro ($49) / Team ($199) tiers. "API access" on Pro + Team. All free during beta. |
| **GTM Plan** | Done | 5-agent research sprint: content strategy, outreach playbook, community intel, partnerships, competitive moat. See `docs/plans/2026-03-06-gtm-bull-rush.md`. |
| **Helm Chart** | Done | Full K3s deployment (API, web, indexer, postgres, redis) |
| **CI/CD** | Done | GitHub Actions: typecheck → build → push GHCR, manual K3s deploy |
| **Cloudflared Tunnel** | Done | Public access via Cloudflare tunnel (chainward.ai + api.chainward.ai) |
| **Security Hardening** | Done | CSP headers, auth rate limiting, input validation, XSS prevention |
| **Onboarding** | Done | Banner prompts new users to monitor their connected wallet |

### Alert Pipeline (end-to-end)

```
Transaction indexed → alert-evaluate queue → evaluator worker checks configs
  → if triggered: insert alert_event + push to alert-deliver queue
  → delivery worker: send to Discord embed / Telegram HTML / webhook POST
  → update alert_event with delivered=true or delivery_error
```

- **Tx-triggered types:** large_transfer, gas_spike, failed_tx, new_contract
- **Scheduled types (every 5min):** balance_drop, inactivity
- **Delivery channels:** Discord (rich embeds with Basescan links), Telegram (HTML messages via Bot API), Webhook (POST JSON)
- **Test alerts:** POST `/api/alerts/:id/test` — creates real alert_event, looks up agent name, delivers to configured channels

### Auth Architecture

- **Wallet UI:** RainbowKit v2 + wagmi v2 (MetaMask, Coinbase Wallet, WalletConnect)
- **Protocol:** SIWE (EIP-4361) message sign → verify → JWT session
- **Session:** `chainward-session` HTTP-only cookie, HS256 JWT, 7-day expiry
- **Nonce:** Redis-backed with 5-min TTL, atomic delete on verify
- **User identity:** Wallet address (primary key), display name (optional), email (optional)

### K3s Deployment

- **Namespace:** `chainward`
- **Deployments:** `api`, `web`, `indexer` (names match `kubectl -n chainward get deployments`)
- **Pods:** api, web, indexer, postgres, redis
- **Internal access:** http://chainward.k3s.nox
- **Public access:** chainward.ai (web), api.chainward.ai (api)
- **Docker images:** `ghcr.io/saltxd/chainward-{api,web,indexer}:<git-short-hash>`
- **Deploy command:** `kubectl -n chainward set image deployment/X X=ghcr.io/saltxd/chainward-X:$TAG`
- **IMPORTANT:** Deploy ALL THREE (api, web, indexer) when schema changes touch shared packages

### Key Files

| File | Purpose |
|------|---------|
| `apps/web/src/app/(dashboard)/alerts/page.tsx` | Alerts page: create form, alert cards, history |
| `apps/web/src/app/(dashboard)/agents/[id]/page.tsx` | Agent detail: stats, charts, rename, tx table |
| `apps/web/src/app/(dashboard)/overview/page.tsx` | Overview: fleet stats, volume/balance/gas charts |
| `apps/web/src/components/dashboard/alert-card.tsx` | AlertCard component with edit/toggle/delete |
| `apps/web/src/components/ui/toast.tsx` | Toast notification system (context + provider) |
| `apps/web/src/components/charts/` | BalanceChart, VolumeChart, GasChart (Recharts) |
| `apps/web/src/lib/api.ts` | Frontend API client + TypeScript interfaces |
| `apps/web/src/hooks/use-api.ts` | Data fetching hook (extracts `.data` from responses) |
| `apps/api/src/routes/alerts.ts` | Alert CRUD + test endpoint |
| `apps/api/src/services/` | Service classes (agent, alert, balance, gas, tx, user) |
| `packages/indexer/src/workers/alertEvaluator.ts` | Evaluates alert conditions per tx or on schedule |
| `packages/indexer/src/workers/alertDelivery.ts` | Delivers alerts to Discord/Telegram/webhook |
| `packages/indexer/src/workers/baseIndexer.ts` | Processes Alchemy webhooks, inserts txs |
| `packages/db/src/schema/` | Drizzle ORM schema definitions |
| `packages/common/src/` | Shared types, constants, chain utils |
| `packages/sdk/src/index.ts` | TypeScript SDK — typed API client with Bearer auth |
| `packages/elizaos-plugin/src/index.ts` | elizaOS plugin — 6 actions, auto-register on init |
| `apps/api/src/middleware/apiKeyAuth.ts` | API key + session dual auth middleware |
| `apps/api/src/services/apiKeyService.ts` | API key generation, validation, revocation |
| `apps/web/src/app/docs/api/page.tsx` | Public API reference (18 endpoints, SDK examples) |
| `deploy/helm/chainward/` | Helm chart for K3s deployment |
| `docs/plans/2026-03-06-gtm-bull-rush.md` | GTM execution plan (30-day action checklist) |

## What's Next

### Immediate (GTM Week 1)
- [x] `npm publish` SDK + elizaOS plugin (`@chainward/sdk@0.1.0`, `@chainward/elizaos-plugin@0.1.0`)
- [x] Submit PR to elizaOS plugin registry (PR #287)
- [x] Rename GitHub repo `agentguard` → `chainward`
- [x] Build + publish AgentKit action provider (`@chainward/agentkit-plugin@0.1.0`)
- [ ] Execute GTM content calendar — Day 1 tweet from @salt_cx
- [ ] Send first 3 outreach DMs (Rxbt, Austin Griffith, Jack Dishman)
- [ ] Post in CDP Discord, Virtuals Discord, Base Discord
- [ ] Register Basename + apply for Base Builder Grant

### Short-Term (Weeks 2-4)
- [ ] Submit AgentKit action provider PR to coinbase/agentkit (currently standalone npm package)
- [ ] Build Virtuals GAME SDK monitoring worker
- [ ] Publish long-form "I Monitored My AI Agent for 2 Weeks" article
- [ ] Agent health scoring (composite metric: uptime, gas efficiency, tx success rate)
- [ ] Email alert delivery channel
- [ ] Begin Stripe billing integration

### Future
- [ ] Ethereum mainnet + Arbitrum/Optimism chain support
- [ ] ArgoCD for GitOps deployment
- [ ] Alchemy webhook auto-registration (see `docs/plans/2026-03-02-live-indexing-design.md`)
