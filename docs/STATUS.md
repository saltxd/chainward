# ChainWard — Project Status

**Last updated:** 2026-03-03

## What Is ChainWard

Real-time monitoring, smart alerts, and gas analytics for autonomous AI agents operating on Base. SaaS product targeting the ~3,000-4,000 teams running on-chain AI agents. Previously named AgentGuard — rebranded March 2026.

**Domain:** chainward.ai
**API:** api.chainward.ai
**Internal:** chainward.k3s.nox

## Current State: Live with Wallet Auth

Full stack deployed to K3s cluster. Live indexing via Alchemy webhooks processes real Base mainnet transactions in real time. Wallet-based authentication via SIWE (Sign In With Ethereum) with RainbowKit UI.

### What Works

| Feature | Status | Notes |
|---------|--------|-------|
| **Monorepo (Turborepo)** | Done | 6 packages (`@chainward/*`), all build clean |
| **Database (TimescaleDB)** | Done | 10 tables, 3 hypertables, compression + retention |
| **Auth (SIWE + JWT)** | Done | Wallet sign-in via RainbowKit, JWT sessions in HTTP-only cookies |
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
| **CI/CD** | Done | GitHub Actions: typecheck → build → push GHCR, manual K3s deploy |
| **Cloudflared Tunnel** | Done | Public access via Cloudflare tunnel (chainward.ai + api.chainward.ai) |
| **Dashboard UX Polish** | Done | Overview page, error banners, tx pagination, detail slide-over, alert form |
| **Onboarding** | Done | Banner prompts new users to monitor their connected wallet |

### Auth Architecture

- **Wallet UI:** RainbowKit v2 + wagmi v2 (MetaMask, Coinbase Wallet, WalletConnect)
- **Protocol:** SIWE (EIP-4361) message sign → verify → JWT session
- **Session:** `chainward-session` HTTP-only cookie, HS256 JWT, 7-day expiry
- **Nonce:** Redis-backed with 5-min TTL, atomic delete on verify
- **User identity:** Wallet address (primary key), display name (optional), email (optional)

### K3s Deployment

- **Namespace:** `chainward`
- **Pods:** api, web, indexer, postgres, redis
- **Internal access:** http://chainward.k3s.nox
- **Public access:** chainward.ai (web), api.chainward.ai (api)
- **Docker images:** `ghcr.io/saltxd/chainward-{api,web,indexer}:latest`

## What's Next

### Immediate
- [ ] Alert delivery e2e testing (Discord webhook)
- [ ] Share landing page in Base builder communities

### Future
- [ ] Solana chain support
- [ ] Email alert delivery channel
- [ ] Billing/Stripe integration
- [ ] ArgoCD for GitOps deployment
