<p align="center">
  <img src="apps/web/public/chainward-logo.svg" alt="ChainWard" width="64" height="64" />
</p>

<h1 align="center">ChainWard</h1>

<p align="center">
  Real-time monitoring and alerts for AI agent wallets on Base.
</p>

<p align="center">
  <a href="https://chainward.ai">Website</a> &middot;
  <a href="https://chainward.ai/base">Observatory</a> &middot;
  <a href="https://chainward.ai/docs/api">API Docs</a> &middot;
  <a href="https://www.npmjs.com/package/@chainward/sdk">SDK</a> &middot;
  <a href="https://www.npmjs.com/package/@chainward/cli">CLI</a>
</p>

---

ChainWard gives you real-time visibility into your on-chain agent wallets. Track transactions, monitor balances, catch failed transactions and gas spikes, and get alerts delivered to Discord, Telegram, or webhooks — all within 30 seconds of on-chain activity.

## Features

- **Real-time indexing** — Transactions indexed via Alchemy webhooks as they land on-chain
- **7 alert types** — Large transfer, gas spike, failed tx, new contract, balance drop, inactivity, idle balance
- **3 delivery channels** — Discord embeds, Telegram bot, custom webhooks
- **Dashboard** — Fleet overview, per-agent detail, transaction history, gas analytics, balance charts
- **Base Agent Observatory** — Public dashboard tracking 39+ agent wallets on Base ([chainward.ai/base](https://chainward.ai/base))
- **Wallet Lookup** — Free public tool to inspect any Base wallet's recent activity
- **TypeScript SDK** — Programmatic access to all endpoints
- **CLI** — Monitor agents from your terminal with `chainward watch`
- **Framework plugins** — Drop-in integrations for elizaOS, Coinbase AgentKit, and Virtuals GAME

## Architecture

```
Alchemy webhook → API /api/webhooks/alchemy → BullMQ queue
  → Indexer: parse tx, insert to TimescaleDB, evaluate alerts
  → Alert pipeline: evaluate → deliver to Discord/Telegram/webhook
```

| Component | Tech |
|-----------|------|
| API | Hono (Node 22) |
| Web | Next.js 15, Tailwind CSS v4 |
| Database | TimescaleDB (PostgreSQL + hypertables) |
| Queue | BullMQ + Redis |
| Auth | SIWE (Sign In With Ethereum) + JWT |
| Monorepo | Turborepo + pnpm workspaces |

## Quick Start

```bash
git clone https://github.com/saltxd/chainward.git
cd chainward
pnpm install
```

Copy environment files:

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Configure your `.env` files with database, Redis, and Alchemy credentials, then:

```bash
pnpm dev
```

This starts the API on `localhost:8000` and the web app on `localhost:3000`.

## SDK

```bash
npm install @chainward/sdk
```

```typescript
import { ChainwardClient } from '@chainward/sdk';

const client = new ChainwardClient({ apiKey: 'ag_...' });

const agents = await client.listAgents();
const txs = await client.listTransactions({ limit: 20 });
await client.createAlert({
  walletAddress: '0x...',
  chain: 'base',
  alertType: 'failed_tx',
  channels: ['discord'],
  discordWebhook: 'https://discord.com/api/webhooks/...',
});
```

## CLI

```bash
npm install -g @chainward/cli
chainward login
chainward agents
chainward watch        # live transaction stream
chainward alerts list
```

## Framework Plugins

### elizaOS

```bash
npm install @chainward/elizaos-plugin
```

```typescript
import { chainwardPlugin } from '@chainward/elizaos-plugin';

// Add to your elizaOS agent character
const character = {
  plugins: [chainwardPlugin],
  settings: {
    secrets: {
      CHAINWARD_API_KEY: 'ag_...',
    },
  },
};
```

### Coinbase AgentKit

```bash
npm install @chainward/agentkit-plugin
```

```typescript
import { chainwardActionProvider } from '@chainward/agentkit-plugin';

const provider = chainwardActionProvider({ apiKey: 'ag_...' });
// Add to your AgentKit agent's action providers
```

### Virtuals GAME

```bash
npm install @chainward/virtuals-plugin
```

```typescript
import { ChainwardPlugin } from '@chainward/virtuals-plugin';

const plugin = new ChainwardPlugin({ apiKey: 'ag_...' });
const worker = plugin.getWorker();
// Add worker to your GAME agent
```

## API

All endpoints accept Bearer `ag_` API keys or session cookies. Base URL: `https://api.chainward.ai`

```bash
# List agents
curl -H "Authorization: Bearer ag_..." https://api.chainward.ai/api/agents

# Get transactions
curl -H "Authorization: Bearer ag_..." https://api.chainward.ai/api/transactions?limit=20

# Create an alert
curl -X POST -H "Authorization: Bearer ag_..." \
  -H "Content-Type: application/json" \
  -d '{"walletAddress":"0x...","chain":"base","alertType":"gas_spike","thresholdValue":"5","thresholdUnit":"usd","channels":["discord"],"discordWebhook":"https://discord.com/api/webhooks/..."}' \
  https://api.chainward.ai/api/alerts
```

Full API reference: [chainward.ai/docs/api](https://chainward.ai/docs/api)

## Packages

| Package | Description |
|---------|-------------|
| `apps/api` | Hono API server |
| `apps/web` | Next.js dashboard |
| `packages/common` | Shared types and utilities |
| `packages/db` | Drizzle ORM schema and migrations |
| `packages/indexer` | BullMQ workers for tx processing, alerts, and analytics |
| `packages/sdk` | TypeScript client ([npm](https://www.npmjs.com/package/@chainward/sdk)) |
| `packages/cli` | CLI tool ([npm](https://www.npmjs.com/package/@chainward/cli)) |
| `packages/elizaos-plugin` | elizaOS plugin ([npm](https://www.npmjs.com/package/@chainward/elizaos-plugin)) |
| `packages/agentkit-plugin` | Coinbase AgentKit plugin ([npm](https://www.npmjs.com/package/@chainward/agentkit-plugin)) |
| `packages/virtuals-plugin` | Virtuals GAME plugin ([npm](https://www.npmjs.com/package/@chainward/virtuals-plugin)) |

## Development

```bash
pnpm install          # Install dependencies
pnpm dev              # Start API + web dev servers
pnpm typecheck        # Typecheck all packages
pnpm build            # Build all packages
```

## License

MIT
