# ChainWard project status

**Last updated:** 2026-11-05. Every fact below was read from the code on that date: the API mounts, the pages, the workers, the package manifests and the CI workflows. Git history keeps the March 2026 version, which described the original monitoring SaaS and a manual deploy that is no longer used.

## What ChainWard is

On-chain checks and monitoring for AI agents, mainly on Base, with some checks on BNB Chain.

- **Checks with a verdict.** Paste an address and get Pay, Hold or Unknown, with the one fact behind the verdict and the one limit of the check. Free on the site; agents pay per call over x402.
- **Decodes.** 35 published investigations at chainward.ai/decodes, each measured from chain data and opening with a plain-English box.
- **Monitoring.** The original dashboard: register agent wallets, index their transactions, and alert on Discord, Telegram or a webhook.

Domain chainward.ai, API api.chainward.ai, code github.com/saltxd/chainward.

## Public pages (`apps/web`)

| Page | What it is |
|---|---|
| `/` | Home: paste an address first |
| `/decodes`, `/decodes/[slug]` | The published investigations |
| `/report/[address]`, `/reports` | Pay or Hold reports for Base and BNB Chain addresses, and their library |
| `/rugcheck` | Free token rug check |
| `/wallet`, `/wallet/[address]`, `/wallet-api` | Wallet lookup and the wallet screening API |
| `/x402`, `/x402/watch` | The x402 seller board, and the paid endpoint watch |
| `/screen` | The linked-wallet screen for reward programs |
| `/attest` | Flagged reports written onto Base as attestations |
| `/base`, `/base/[slug]`, `/base/digest` | The Base agent observatory and its weekly digest |
| `/agent/[wallet]` | A public page per agent wallet |
| `/set-and-earn` | Who hired the agents built for BNB Chain's Set and Earn |
| `/hyperliquid` | Hyperliquid agent audit against the live arena |
| `/mcp` | The MCP server |
| `/paid/[slug]` | Paid datasets |
| `/request-brief` | Order a paid intel brief |
| `/docs`, `/docs/api`, `/docs/alerts`, `/docs/cli` | Documentation |
| `/deck/bnb` | The BNB Chain Builder Grant deck |
| `/overview`, `/agents`, `/agents/[id]`, `/transactions`, `/alerts`, `/settings` | The signed-in monitoring dashboard |
| `/login`, `/register` | Sign in with Ethereum |

## API (`apps/api`, Hono, port 8000)

| Mount | Access |
|---|---|
| `/api/auth` | Sign in with Ethereum: EOAs by signature recovery, smart wallets by ERC-1271 or ERC-6492 on Base (`apps/api/src/lib/siweVerify.ts`) |
| `/api/agents`, `/api/transactions`, `/api/balances`, `/api/gas`, `/api/stats`, `/api/alerts`, `/api/wallets`, `/api/keys` | A session cookie or a `Bearer ag_` API key (`requireApiKeyOrSession`) |
| `/api/risk`, `/api/risk/wallet`, `/api/risk/rugcheck`, `/api/risk/token`, `/api/risk/token-report`, `/api/paid` | Checks and datasets; agents pay per call over x402 |
| `/v1` | The wallet screening API, with a key |
| `/api/public/agents`, `/api/public/decodes`, `/api/observatory`, `/api/digest`, `/api/x402`, `/api/set-and-earn`, `/api/health`, `/api/telemetry` | Public |
| `/api/payments`, `/api/brief` | Orders for paid briefs |
| `/api/webhooks` | Alchemy address-activity webhooks, signature checked |
| `/api/near` | `POST /authorize` signs a verdict for the NEAR payment guard; answers 503 until its signing key is configured |

## Background workers (`packages/indexer`)

| Area | Workers |
|---|---|
| Transactions and balances | `baseIndexer`, `backfill`, `transferBackfill`, `balancePoller`, `webhookHealth` |
| Alerts | `alertEvaluator`, `alertDelivery` |
| Checks and attestations | `riskCheck`, `riskAttest`, `healthScore` |
| Boards and digests | `x402Board`, `setAndEarnBoard`, `digestGenerator` |
| Agent marketplaces and registries | `acpSync`, `acpWalletTracer`, `registryScout`, `termixProvider`, `intelligence` |

Pipeline: Alchemy webhook, then `/api/webhooks/alchemy`, then the `base-tx-process` queue (BullMQ), then the indexer writes to TimescaleDB and queues alert evaluation, then delivery to Discord, Telegram or a webhook.

## Packages

| Package | Version in `package.json` | Public |
|---|---|---|
| `chainward-mcp-server` | 0.3.1 | npm |
| `@chainward/sdk` | 0.1.3 | npm |
| `@chainward/cli` | 0.1.3 | npm |
| `@chainward/agentkit-plugin` | 0.1.4 | npm |
| `@chainward/elizaos-plugin` | 0.1.4 | npm |
| `@chainward/virtuals-plugin` | 0.1.5 | npm |

Private workspace packages: `common`, `db`, `decode`, `indexer`, `intelligence-loader`, `observatory`, and the apps `api`, `web` and `acp-decoder`.

## Data

TimescaleDB through Drizzle. 26 numbered migrations in `packages/db/src/migrations/`, applied in order by the chart's pre-upgrade hook and tracked in `schema_migrations`.

## Build and deploy

A push to `main` ships everything:

1. `.github/workflows/build.yml` (Build & Push): lint, typecheck and build; an image boot smoke test; a secret scan; then all five images (`api`, `web`, `indexer`, `acp-decoder`, `migrate`) to GHCR.
2. Its bump job commits the new tag to `saltxd/homelab-k3s` (`apps/chainward/helmrelease.yaml`).
3. Flux upgrades the release: migrations run first, then the deployments roll.
4. The `login-smoke` job signs in on production with an EOA and an undeployed smart wallet once `/api/health` reports the new commit.

Verify a deploy by the live image tag, not by CI going green. **Never roll images or env by hand** (`deploy/deploy.sh` without flags, `kubectl set image`, `kubectl set env`): Flux drift detection reverts it. `./deploy/deploy.sh --migrate-only` remains for an emergency out-of-band migration. `.github/workflows/publish-packages.yml` publishes the public packages to npm through Trusted Publishing.

## More

- `CLAUDE.md`: the stack, commands, deployment and gotchas.
- `docs/decode-publishing-runbook.md`: how a decode is made and checked before it ships.
- `deliverables/README.md`: the decode checklist.
- `docs/PROVIDER-SWITCHING.md`, `docs/BSC.md`: provider and BNB Chain details.
