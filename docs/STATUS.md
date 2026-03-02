# ChainWard — Project Status

**Last updated:** 2026-03-02

## What Is ChainWard

Real-time monitoring, smart alerts, and gas analytics for autonomous AI agents operating on Base. SaaS product targeting the ~3,000-4,000 teams running on-chain AI agents. Previously named AgentGuard — rebranded March 2026.

**Domain:** chainward.ai
**Internal:** chainward.k3s.nox

## Current State: Live on K3s with Real-Time Indexing

Full stack deployed to K3s cluster. Live indexing via Alchemy webhooks processes real Base mainnet transactions in real time. Landing page ready for sharing.

### What Works

| Feature | Status | Notes |
|---------|--------|-------|
| **Monorepo (Turborepo)** | Done | 6 packages (`@chainward/*`), all build clean |
| **Database (TimescaleDB)** | Done | 10 tables, 3 hypertables, compression + retention |
| **Auth (Better Auth)** | Done | Email/password signup + login, session cookies |
| **API (Hono)** | Done | 20+ endpoints, 7 service classes, rate limiting |
| **Web Dashboard (Next.js 15)** | Done | 7 pages, charts, transaction table, agent management |
| **Landing Page** | Done | Terminal-aesthetic hero with animated activity feed, feature grid, CTA |
| **Live Indexing** | Done | Alchemy webhooks → API → BullMQ → indexer → TimescaleDB |
| **Auto Webhook Management** | Done | Agent CRUD auto-adds/removes wallets from Alchemy webhook |
| **Agent Registration** | Done | Register Base wallet addresses, CRUD operations |
| **Transaction Indexing** | Done | Real-time + backfill, gas from receipts, block timestamps, CoinGecko USD |
| **Balance Snapshots** | Done | Current balance + historical points for chart |
| **Stats/Overview** | Done | Fleet-level and per-agent stats with real data, spam-filtered |
| **Alert System** | Done | 6 alert types, 3 delivery channels (webhook/Slack/Discord), rate-limited test |
| **Spam Token Filtering** | Done | Address blocklist + name pattern matching + NULL-safe SQL |
| **API Key System** | Done | Create/revoke keys, SHA-256 hashing, scopes |
| **SDK** | Done | `@chainward/sdk` TypeScript client |
| **Helm Chart** | Done | Full K3s deployment (API, web, indexer, postgres, redis) |
| **CI/CD** | Done | GitHub Actions: typecheck → build → push GHCR → deploy K3s |
| **Cloudflared Tunnel** | Done | Public webhook ingress via Cloudflare tunnel |

### K3s Deployment

- **Namespace:** `agentguard` (will migrate to `chainward`)
- **Pods:** api, web, indexer, postgres, redis
- **Internal access:** http://agentguard.k3s.nox (will update to chainward.k3s.nox)
- **Docker images:** `ghcr.io/saltxd/chainward-{api,web,indexer}:latest`

## What's Next

### Immediate (This Week)
- [ ] Set up chainward.ai DNS (Cloudflare) → K3s web service
- [ ] Set up GitHub secrets for CI/CD (K3S_HOST, K3S_USER, K3S_SSH_KEY)
- [ ] Create GHCR pull secret in K3s
- [ ] Push to GitHub to trigger first CI/CD run
- [ ] Share landing page link in Base builder communities
- [ ] Test alert delivery end-to-end (Discord webhook)

### Dashboard Polish (Next)
- [ ] Overview dashboard page at `/` (fleet stats + charts)
- [ ] Error display components (replace silent failures)
- [ ] Agent creation fix (name optional, address validation)
- [ ] Transaction pagination
- [ ] Transaction detail slide-over
- [ ] Alert form improvements (Slack/Discord URL inputs, lookback selector)
- [ ] Header/layout improvements (user info, wider sidebar)

### Future
- [ ] Migrate K3s namespace from `agentguard` to `chainward`
- [ ] Solana chain support
- [ ] Email alert delivery channel
- [ ] Billing/Stripe integration
- [ ] ArgoCD for GitOps deployment
