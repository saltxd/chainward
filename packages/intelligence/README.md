# Intelligence Data

This directory contains curated intelligence data for ChainWard. The actual JSON data files are **not tracked in git** — only example files and this README are committed.

## What goes here

| File | Description | Schema |
|------|-------------|--------|
| `observatory-agents.json` | Labeled AI agent wallets for the Base Observatory | See `ObservatoryAgent` type |
| `protocol-registry.json` | Known DeFi protocol contract addresses | See `KnownContract` type |
| `spam-tokens.json` | Spam/scam token addresses and known-good tokens | See `SpamTokenData` type |

## TypeScript types

All data schemas are defined in `@chainward/intelligence-loader`. See `packages/intelligence-loader/src/types.ts` for the full interface definitions.

## For self-hosters

If you're running your own ChainWard instance, you have three options:

### Option 1: Start empty (default)

Don't create any JSON files. ChainWard starts with an empty observatory and no protocol tagging. You can add agents through the API or web UI.

### Option 2: Bring your own data

Copy the `.example.json` files, rename them (remove `.example`), and populate with your own data:

```bash
cp observatory-agents.example.json observatory-agents.json
cp protocol-registry.example.json protocol-registry.json
cp spam-tokens.example.json spam-tokens.json
```

Then run the seed scripts:

```bash
npx tsx packages/db/seeds/observatory-agents.ts
npx tsx packages/db/seeds/known-contracts.ts
```

### Option 3: Use the API

Register agents and contracts through the ChainWard API:

```bash
# Register an agent
curl -X POST https://your-instance/api/agents \
  -H "Authorization: Bearer ag_YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"walletAddress":"0x...","chain":"base","agentName":"My Bot"}'
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `INTELLIGENCE_SOURCE` | auto-detect | `local` (read JSON files), `remote` (future), `empty` (no data) |
| `INTELLIGENCE_DIR` | `./packages/intelligence` | Path to intelligence data directory |

When `INTELLIGENCE_SOURCE` is not set, ChainWard auto-detects: if `observatory-agents.json` exists in the intelligence directory, it uses `local`; otherwise `empty`.
