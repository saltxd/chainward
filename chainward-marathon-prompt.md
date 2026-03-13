# ChainWard Marathon Build Prompt

## Context

You are continuing work on a crypto observability SaaS previously called **AgentGuard**. It has been **renamed to ChainWard** (chainward.ai). The product monitors on-chain AI agent wallets on Base (Ethereum L2), showing transactions, balances, gas analytics, and alerts.

**What's already built and deployed on K3s:**
- Turborepo monorepo: apps/web (Next.js 15), apps/api (Hono), packages/db (Drizzle + TimescaleDB), packages/indexer (BullMQ workers)
- PostgreSQL 16 + TimescaleDB with hypertables for transactions, balance_snapshots, alert_events
- Continuous aggregates: gas_analytics_hourly, gas_analytics_daily, tx_volume_hourly
- Redis + BullMQ job queue for transaction processing and alert evaluation
- Alchemy webhook integration for real-time Base transaction indexing
- Balance polling worker (5 min intervals)
- Historical backfill (30 days via eth_getLogs)
- Better Auth for authentication (email/password) — **TO BE REPLACED**
- Dashboard: Overview, Agents list, Agent detail (balance chart, gas chart, tx table), Transactions page, Alerts page, Settings page
- Docker images pushed to ghcr.io/mburkholz/agentguard-* — **NEEDS RENAME**
- Deployed on K3s with Traefik ingress at agentguard-api.wannatapthat.com

**Tech stack:** TypeScript, Next.js 15 (App Router), Hono, Drizzle ORM, TimescaleDB, Redis, BullMQ, viem, Tailwind CSS, shadcn/ui, Recharts

---

## Phase 1: Rebrand AgentGuard → ChainWard

**Priority: Do this first. Everything else builds on the new name.**

### Tasks:
1. **Global find-and-replace** across the entire codebase:
   - `AgentGuard` → `ChainWard`
   - `agentguard` → `chainward`
   - `agent-guard` → `chainward`
   - `ag_` prefix on API keys → `cw_` prefix
2. **Update UI branding:**
   - Sidebar logo text: "ChainWard" (keep the green accent on "Ward")
   - Footer version: `ChainWard v0.1.0`
   - Browser tab title: `ChainWard`
   - Favicon: generate a simple CW monogram or shield icon in forest green (#1B5E20)
3. **Update package.json names** in all packages and apps
4. **Update Docker image names** to `ghcr.io/mburkholz/chainward-api`, `chainward-web`, `chainward-worker`
5. **Update Helm chart** values and deployment names
6. **Update environment variable prefixes** if any use `AGENTGUARD_`

### Deliverable:
All references to AgentGuard are gone. The app displays "ChainWard" everywhere. Docker builds succeed with new image names.

---

## Phase 2: Replace Better Auth with SIWE (Sign In With Ethereum)

**Priority: Critical. This must happen before the landing page launches. Crypto-native users expect wallet auth, not email/password forms.**

### Why:
The target users are crypto-native teams building AI agents on Base. In DeFi, there is no concept of "accounts" — your wallet IS your identity. Uniswap, Curve, Aave — none of them have signup forms. ChainWard should work the same way: connect wallet → you're in → start monitoring.

### Architecture:

**Frontend flow:**
1. User lands on ChainWard → clicks "Connect Wallet"
2. MetaMask/Coinbase Wallet/WalletConnect popup appears
3. User connects → frontend gets their address
4. Frontend requests a nonce from the API: `GET /api/auth/nonce`
5. Frontend constructs a SIWE message and asks user to sign it (no gas, no transaction — just a signature)
6. Frontend sends signed message to API: `POST /api/auth/verify` with `{ message, signature }`
7. API verifies the signature using `viem`, creates/finds user by wallet address, returns a session token (JWT or cookie)
8. User is now authenticated. All subsequent API calls include the session.

**Backend implementation:**
1. Install `siwe` package for message construction/verification (or do it manually with `viem` — `verifyMessage` is sufficient)
2. Create `auth` routes on the Hono API:
   - `GET /api/auth/nonce` — generate and store a random nonce (Redis, 5 min TTL)
   - `POST /api/auth/verify` — verify SIWE signature, upsert user by wallet address, return session
   - `GET /api/auth/session` — return current user from session
   - `POST /api/auth/logout` — clear session
3. **User model simplification** — the users table becomes:
   ```sql
   users (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     wallet_address TEXT UNIQUE NOT NULL,  -- checksummed 0x address
     display_name TEXT,                     -- optional, user can set later
     email TEXT,                            -- optional, for email alerts later
     tier TEXT DEFAULT 'free',
     created_at TIMESTAMPTZ DEFAULT NOW(),
     updated_at TIMESTAMPTZ DEFAULT NOW()
   )
   ```
4. Remove Better Auth entirely — delete the package, its config files, all email/password/OAuth related code, signup forms, login forms, forgot password flows.
5. **Session management:** Use HTTP-only cookies with a signed JWT. The JWT payload is `{ userId, walletAddress, iat, exp }`. Expiry: 7 days. On each API request, middleware verifies the JWT and attaches the user to the request context.

**Frontend components:**
1. **ConnectWallet button component** — uses wagmi + viem for wallet connection:
   - Install `wagmi`, `@tanstack/react-query`, `viem` (already have viem)
   - Configure wagmi with Base chain, MetaMask and Coinbase Wallet connectors, and WalletConnect (projectId from WalletConnect Cloud — free)
   - The button shows "Connect Wallet" when disconnected, shows truncated address + avatar when connected
   - Wrap the Next.js app in wagmi's `WagmiProvider` and `QueryClientProvider`
2. **Auth gate** — if no session, show the landing/connect page. If session exists, show the dashboard.
3. **Onboarding shortcut** — after wallet connect, if the user has 0 agents registered, prompt: "Monitor this wallet?" with their connected wallet pre-filled. One click to start monitoring their own wallet.

**Dependencies to add:**
- `wagmi` (latest)
- `@tanstack/react-query` (wagmi peer dep)
- `@walletconnect/modal` or `@web3modal/wagmi` for WalletConnect support
- Remove: `better-auth` and any related packages

**Key security notes:**
- Always verify signatures server-side with viem's `verifyMessage`
- Nonces must be single-use and expire (Redis with TTL)
- SIWE message must include the correct domain, chain ID (8453 for Base), and URI
- Checksummed addresses everywhere (viem's `getAddress`)

### Deliverable:
Better Auth is completely removed. Users connect with MetaMask or Coinbase Wallet, sign a message, and get a session. The dashboard loads with their data. No email, no password, no signup form.

---

## Phase 3: Landing Page at chainward.ai

**Priority: This is how people discover ChainWard. Ship this immediately after auth works.**

### Design Direction:
- **Dark theme** — match the dashboard aesthetic. Near-black background (#0a0f1a or similar), forest green (#1B5E20) accent for CTAs and highlights
- **Tone:** Professional but crypto-native. Not corporate enterprise, not crypto-bro memecoin. Think: the Alchemy or Dune Analytics landing pages — serious infrastructure tooling for serious builders
- **Typography:** Monospace for code/addresses/technical elements, clean sans-serif for headlines and body
- **No generic AI slop** — no gradient purple orbs, no "powered by AI" badges, no stock photos

### Page Structure (single page, Next.js route at `/`):

**Hero section:**
- Headline: "Monitor your AI agents on-chain" or "Observability for autonomous agents"
- Subheadline: 1-2 sentences — "ChainWard watches your agent wallets so you don't have to. Real-time transactions, balance tracking, gas analytics, and alerts for AI agents on Base."
- Primary CTA: "Connect Wallet" button (opens wallet connect flow)
- Secondary CTA: "View Demo" (optional — could link to a read-only demo dashboard)
- Hero visual: screenshot of the dashboard with real data, or an animated terminal-style display showing live transactions flowing in

**Features section (3-4 cards):**
1. **Real-Time Indexing** — "Every transaction your agent makes, indexed in seconds via Alchemy webhooks. No polling, no delays."
2. **Balance & Gas Tracking** — "Historical balance charts, gas analytics, and spending breakdowns across all your agent wallets."
3. **Alerts** — "Get notified on Discord when your agent makes a large transfer, balance drops, gas spikes, or transactions fail."
4. **Fleet Overview** — "Monitor 1 or 100 agents from a single dashboard. See your entire operation at a glance."

**How it works section (3 steps):**
1. Connect your wallet
2. Register your agent wallet addresses
3. ChainWard indexes everything automatically — you get a live dashboard and alerts

**Pricing section (simple, 3 tiers):**
- **Free:** 3 agents, 5-min polling, 7-day history, community Discord
- **Pro ($49/mo):** 25 agents, 1-min polling, 90-day history, webhook + Discord alerts, API access
- **Team ($199/mo):** 100 agents, 30-sec polling, unlimited history, priority alerts, dedicated support

**Footer:**
- Links: Docs (placeholder), Discord (placeholder), Twitter/X (@chainwardai), GitHub
- "Built for Base. More chains coming soon."
- © 2026 ChainWard

### Technical Implementation:
- This is a Next.js page — put it at the root route `/`
- When a user is NOT authenticated, they see the landing page
- When a user IS authenticated (wallet connected), they get redirected to `/dashboard`
- The landing page must be static/SSG for performance — no API calls on load
- Use Tailwind + custom CSS for animations. No heavy animation libraries.
- Mobile responsive — many crypto users browse on mobile

### Deliverable:
chainward.ai loads a polished landing page. "Connect Wallet" button initiates the SIWE flow. Authenticated users go straight to the dashboard.

---

## Phase 4: Alert System Fixes

### Tasks:
1. **Fix getEvents() bug** — currently only queries the first alert config's events. Should query all configs for the user.
2. **Test Discord delivery** — set up a test Discord webhook URL, configure an alert (e.g., any transaction > $0.01), trigger it with a real transaction, verify the Discord message arrives with correct formatting (embed with agent name, tx hash, amount, link to dashboard).
3. **Alert creation form improvements:**
   - Add Discord webhook URL input field
   - Add Slack webhook URL input field
   - Lookback window selector (1h, 6h, 24h, 7d)
   - Cooldown selector (5min, 15min, 1h, 6h)
   - Show which agent the alert is for (dropdown of registered agents)
4. **Rate limit the test endpoint** — prevent abuse of alert test/trigger endpoints

### Deliverable:
Alerts fire correctly, Discord notifications arrive with properly formatted embeds, alert creation form has all necessary fields.

---

## Phase 5: Dashboard Polish

### Tasks:
1. **Overview page (`/dashboard`)** — proper fleet overview:
   - Total agents, total value across all agents, 24h transaction count, 24h gas spend
   - Sparkline charts for value and tx count (7 day)
   - Recent transactions table (last 10 across all agents)
   - Top agents by activity
2. **Agent creation fix** — name field should be optional, default to truncated address. Add wallet address validation (must be valid Ethereum address, use viem's `isAddress`).
3. **Transaction pagination** — add prev/next controls, page size selector (25/50/100), total count display
4. **Transaction detail modal** — click a transaction row to see full details in a slide-over panel:
   - Full tx hash (clickable link to Basescan)
   - Full addresses (from, to, counterparty) with Basescan links
   - Method name and decoded calldata if available
   - Gas details (gas used, gas price, total cost in ETH and USD)
   - Token transfer details
   - Block number and timestamp
5. **Error display** — create a reusable error/toast component. Replace all silent failures with visible error messages.
6. **Loading states** — skeleton loaders for charts and tables while data is fetching
7. **Header improvements** — show connected wallet address (truncated) with a disconnect option

### Deliverable:
Dashboard feels polished and complete. No empty states without explanation, no silent failures, smooth loading transitions.

---

## Phase 6: CI/CD

### Tasks:
1. **GitHub Actions workflow** — on push to `main`:
   - TypeScript typecheck
   - Build all packages
   - Build Docker images (api, web, worker)
   - Push to ghcr.io/mburkholz/chainward-*
   - Tag with commit SHA and `latest`
2. **Deploy workflow** — after images are pushed:
   - SSH to K3s node or trigger ArgoCD sync
   - Update image tags in Helm values
   - Rolling restart of deployments
3. **GHCR pull secret** — ensure K3s cluster can pull from ghcr.io (create imagePullSecret if not already configured)

### Deliverable:
Push to main → automatic build → automatic deploy to K3s. No more manual Docker builds from Mac.

---

## Execution Order

**Do these in this exact order:**

1. **Phase 1: Rebrand** (1-2 hours) — foundation for everything else
2. **Phase 2: SIWE Auth** (4-6 hours) — must work before landing page
3. **Phase 3: Landing Page** (3-4 hours) — public face of the product
4. **Phase 4: Alert Fixes** (2-3 hours) — core functionality
5. **Phase 5: Dashboard Polish** (4-6 hours) — UX quality
6. **Phase 6: CI/CD** (2-3 hours) — developer efficiency

**After each phase, verify:**
- TypeScript compiles with no errors
- Docker images build successfully
- The app runs locally with `docker compose up`
- All existing functionality still works (don't break what's already working)

---

## Design System Reference

- **Background:** Near-black (#0a0f1a to #0d1117)
- **Surface/Cards:** Dark gray (#1a1f2e to #1e2433)
- **Primary accent:** Forest green (#1B5E20) — buttons, links, active states, charts
- **Text primary:** White (#ffffff)
- **Text secondary:** Gray (#9ca3af)
- **Success:** Green (#22c55e)
- **Warning:** Amber (#f59e0b)
- **Error:** Red (#ef4444)
- **Font:** System sans-serif for UI, monospace for addresses/hashes/code
- **Border radius:** Subtle (6-8px on cards, 4px on buttons)
- **Charts:** Forest green line/fill on dark background

---

## Important Notes

- The product domain is `chainward.ai` — all references to URLs, dashboard links in alert payloads, etc. should use this
- Twitter/X handle is `@chainwardai`
- API key prefix changes from `ag_` to `cw_`
- This is a crypto-native product — no email/password auth, no Web2 signup flows
- All wallet addresses must be checksummed (use viem's `getAddress`)
- The target user is a developer or team lead running AI agents on Base. They know what a transaction hash is. Don't dumb down the UI.
