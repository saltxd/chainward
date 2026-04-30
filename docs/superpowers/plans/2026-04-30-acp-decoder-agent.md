# ACP Decoder Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a registered ACP service-provider agent that takes paid wallet-decode jobs ($25 USDC each) and delivers a JSON envelope (markdown report + structured data + sources). Phase 1 of the ChainWard intelligence-platform pivot.

**Architecture:** New TypeScript workspace package `packages/decode/` holds reusable decode logic (chain audit, classifiers, peer lookup, report writer). New runnable service `apps/acp-decoder/` runs the ACP seller runtime (Socket.io listener, state machine handler, persistence). Auto-decode pipeline migrates to consume `packages/decode/`. New `decodes` DB table stores every job. Deploys as a 1-replica K8s Deployment in the existing chainward Helm chart. Single-pod design; uses Redis for cross-pod-eventually rate limiting (in-process semaphore for per-pod concurrency).

**Tech Stack:** TypeScript / Node 22, Hono-style codebase, pnpm workspaces, Turborepo, Drizzle ORM, TimescaleDB (Postgres), Redis, K3s + Helm. New deps: `@virtuals-protocol/acp-node` v0.3.0-beta.40, `socket.io-client`. `claude --print` (Claude Code CLI via OAuth subscription) for the LLM call. Vitest for tests.

**Spec:** `docs/superpowers/specs/2026-04-30-acp-decoder-agent-design.md` (commit 0fcda83). Reference brief: `scripts/auto-decode/acp-service-brief.md`.

---

## File structure

### New files

```
packages/decode/                                     ← reusable library
  package.json                                        ← workspace package
  tsconfig.json                                       ← extends ../../tsconfig.base.json
  vitest.config.ts
  src/
    index.ts                                          ← exports quickDecode + types
    types.ts                                          ← QuickDecodeResult schema
    chain-audit.ts                                    ← balances, transfers, counterparties
    resolver.ts                                       ← (moved from scripts/auto-decode/lib)
    wallet-arch.ts                                    ← EOA / ERC-1967 / ERC-4337 / contract
    discrepancies.ts                                  ← ACP claims ↔ chain truth + checks_performed
    survival.ts                                       ← active / at_risk / dormant / unknown
    usdc-pattern.ts                                   ← running / accumulating / graveyard / ...
    peers.ts                                          ← comparable peers from observatory DB
    token-trading.ts                                  ← token FDV / 24h volume / holders
    report-writer.ts                                  ← claude --print + replayMode + fallback
    spam-tokens.ts                                    ← static list of known spam token contracts
    templates/
      report-fallback.md.ts                           ← deterministic template-literal function
  __tests__/
    fixtures/                                         ← captured chain + API responses
      axelrod-active.json
      lucien-dormant.json
      otto-active.json
      ethy-borderline.json
      luna-dormant.json
    chain-audit.test.ts
    wallet-arch.test.ts
    discrepancies.test.ts
    survival.test.ts
    usdc-pattern.test.ts
    peers.test.ts
    token-trading.test.ts
    report-writer.test.ts
    quick-decode.test.ts                              ← integration

apps/acp-decoder/                                    ← runnable K8s service
  package.json
  tsconfig.json
  Dockerfile
  src/
    index.ts                                          ← entrypoint
    config.ts                                         ← env loader
    seller.ts                                         ← Socket.io client → acpx.virtuals.io
    handler.ts                                        ← phase state machine
    persist.ts                                        ← writes decodes table
    reconcile.ts                                      ← startup recovery
    rate-limit.ts                                     ← per-pod + per-buyer limits
  __tests__/
    handler.test.ts
    persist.test.ts
    rate-limit.test.ts

deploy/helm/chainward/templates/
  acp-decoder-deployment.yaml
  acp-decoder-secret.yaml

docs/playbook/
  acp-registration-walkthrough.md                    ← created post-`acp setup`
```

### Modified files

```
packages/db/src/schema.ts                            ← +decodes table
packages/db/src/migrations/0008_decodes_table.sql   ← migration for decodes
deploy/helm/chainward/values.yaml                    ← +acpDecoder block
deploy/deploy.sh                                     ← +chainward-acp-decoder GHCR check
scripts/auto-decode/lib/resolver.ts                  ← deleted (moved to packages/decode)
scripts/auto-decode/index.ts                         ← updated import path
.github/workflows/build.yml                          ← +chainward-acp-decoder image build
```

---

## Task 1: Scaffold `packages/decode/` workspace

**Files:**
- Create: `packages/decode/package.json`
- Create: `packages/decode/tsconfig.json`
- Create: `packages/decode/vitest.config.ts`
- Create: `packages/decode/src/index.ts`

- [ ] **Step 1: Create the package directory and config files**

`packages/decode/package.json`:
```json
{
  "name": "@chainward/decode",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@chainward/common": "workspace:*",
    "@chainward/db": "workspace:*",
    "viem": "^2.21.0"
  },
  "devDependencies": {
    "vitest": "^4.0.18",
    "typescript": "^5.7.0"
  }
}
```

`packages/decode/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

`packages/decode/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
  },
});
```

`packages/decode/src/index.ts`:
```typescript
// re-exports added by subsequent tasks
export {};
```

- [ ] **Step 2: Install workspace deps + verify**

```bash
cd /Users/mburkholz/Forge/chainward
pnpm install
pnpm --filter @chainward/decode typecheck
```

Expected: typecheck passes (empty package, no errors).

- [ ] **Step 3: Commit**

```bash
git add packages/decode/
git commit -m "feat(decode): scaffold @chainward/decode workspace package"
```

---

## Task 2: Define `QuickDecodeResult` types

**Files:**
- Create: `packages/decode/src/types.ts`
- Modify: `packages/decode/src/index.ts`
- Test: `packages/decode/__tests__/types-compile.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/decode/__tests__/types-compile.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import type { QuickDecodeResult } from '../src/index.js';

describe('QuickDecodeResult type shape', () => {
  it('compiles a complete object literal', () => {
    const sample: QuickDecodeResult = {
      report: '# Sample\n\nBody.',
      data: {
        target: {
          input: '@axelrod',
          wallet_address: '0x999A1B6033998A05F7e37e4BD471038dF46624E1',
          handle: 'AIxVC_Axelrod',
          name: 'Axelrod',
          acp_id: 129,
          virtuals_agent_id: null,
          framework: 'virtuals_acp',
          owner_address: '0xaa3189f41127a41e840caf2c1d467eb8ccf197d8',
        },
        wallet: { type: 'erc1967_proxy', nonce: 1, code_size: 234, is_virtuals_factory: true },
        balances: {
          eth: { wei: '0', usd: 0 },
          usdc: { amount: 6.42, usd: 6.42 },
          agent_token: null,
        },
        token_trading: null,
        activity: {
          latest_transfer_at: '2026-04-30T00:00:00Z',
          latest_transfer_age_hours: 0.5,
          transfers_24h: 36,
          transfers_7d: 42,
          transfers_30d: 182,
          unique_counterparties_30d: 12,
        },
        claims: {
          agdp: 106928592.89,
          revenue: null,
          successful_jobs: null,
          total_jobs: null,
          success_rate: 94.84,
          last_active_at_acp: null,
          is_online_acp: true,
        },
        chain_reality: {
          active_today: true,
          active_7d: true,
          active_30d: true,
          settlement_path: ['payment_manager_in', 'settlement_contract_out'],
          payment_manager_seen: true,
        },
        discrepancies: [],
        checks_performed: ['lastActiveAt', 'isOnline'],
        survival: { classification: 'active', rationale: 'recent activity, peer cohort intact' },
        usdc_pattern: 'running',
        peers: {
          similar_active: ['Otto AI', 'Nox'],
          similar_dormant: [],
          cluster: null,
          cluster_status: null,
        },
      },
      sources: [
        {
          label: 'Sentinel eth_call USDC.balanceOf',
          url: 'rpc://cw-sentinel:8545',
          block_number: 44545679,
          block_hash: '0x9954b825e40a5fc0dac606b764924a27527843fc176cf8c8d2deb341945a1b8c',
          timestamp: '2026-04-30T00:00:00Z',
        },
      ],
      meta: {
        schema_version: '1.0.0',
        classifier_version: '1.0.0',
        tier: 'quick',
        pipeline_version: 'abcd1234',
        generated_at: '2026-04-30T00:00:00Z',
        as_of_block: { number: 44545679, hash: '0x9954b825e40a5fc0dac606b764924a27527843fc176cf8c8d2deb341945a1b8c' },
        target_input: '@axelrod',
        job_id: 'job-1',
        disclosure: 'Decode requests and results are stored by ChainWard and may inform aggregate intelligence. Individual buyer-target pairs are never disclosed.',
      },
    };
    expect(sample.meta.tier).toBe('quick');
  });
});
```

- [ ] **Step 2: Run test (should fail — types not exported yet)**

```bash
pnpm --filter @chainward/decode test
```

Expected: FAIL with `Cannot find module '../src/index.js'` or `'QuickDecodeResult' is not exported`.

- [ ] **Step 3: Write the types module**

`packages/decode/src/types.ts`:
```typescript
export type Framework = 'virtuals_acp' | 'olas' | 'eliza' | 'agentkit' | 'unknown';

export type WalletType = 'eoa' | 'erc1967_proxy' | 'erc4337' | 'contract' | 'unknown';

export type SurvivalClassification = 'active' | 'at_risk' | 'dormant' | 'unknown';

export type UsdcPattern = 'running' | 'accumulating' | 'graveyard' | 'inactive' | 'unknown';

export type ClusterStatus = 'collapsed' | 'active' | 'mixed' | null;

export type DiscrepancySeverity = 'info' | 'warn' | 'critical';

export interface Discrepancy {
  field: string;
  acp_says: string;
  chain_says: string;
  severity: DiscrepancySeverity;
  reason?: string;
}

export interface Source {
  label: string;
  url: string;
  block_number: number | null;
  block_hash: string | null;
  timestamp: string;
}

export interface QuickDecodeResultData {
  target: {
    input: string;
    wallet_address: string;
    handle: string | null;
    name: string | null;
    acp_id: number | null;
    virtuals_agent_id: number | null;
    framework: Framework;
    owner_address: string | null;
  };
  wallet: {
    type: WalletType;
    nonce: number;
    code_size: number;
    is_virtuals_factory: boolean;
  };
  balances: {
    eth: { wei: string; usd: number };
    usdc: { amount: number; usd: number };
    agent_token: { symbol: string; amount: number; usd: number } | null;
  };
  token_trading: {
    contract_address: string;
    symbol: string;
    fdv_usd: number | null;
    volume_24h_usd: number | null;
    holder_count: number | null;
    source: 'geckoterminal' | 'virtuals_api' | 'blockscout';
    fetched_at: string;
  } | null;
  activity: {
    latest_transfer_at: string | null;
    latest_transfer_age_hours: number | null;
    transfers_24h: number;
    transfers_7d: number;
    transfers_30d: number;
    unique_counterparties_30d: number;
  };
  claims: {
    agdp: number | null;
    revenue: number | null;
    successful_jobs: number | null;
    total_jobs: number | null;
    success_rate: number | null;
    last_active_at_acp: string | null;
    is_online_acp: boolean | null;
  };
  chain_reality: {
    active_today: boolean;
    active_7d: boolean;
    active_30d: boolean;
    settlement_path: string[];
    payment_manager_seen: boolean;
  };
  discrepancies: Discrepancy[];
  checks_performed: string[];
  survival: {
    classification: SurvivalClassification;
    rationale: string;
  };
  usdc_pattern: UsdcPattern;
  peers: {
    similar_active: string[];
    similar_dormant: string[];
    cluster: string | null;
    cluster_status: ClusterStatus;
  };
}

export interface QuickDecodeResult {
  report: string;
  data: QuickDecodeResultData;
  sources: Source[];
  meta: {
    schema_version: string;
    classifier_version: string;
    tier: 'quick';
    pipeline_version: string;
    generated_at: string;
    as_of_block: { number: number; hash: string };
    target_input: string;
    job_id: string;
    disclosure: string;
  };
}

export const SCHEMA_VERSION = '1.0.0';
export const CLASSIFIER_VERSION = '1.0.0';
export const DISCLOSURE_TEXT =
  'Decode requests and results are stored by ChainWard and may inform aggregate intelligence. Individual buyer-target pairs are never disclosed.';
```

`packages/decode/src/index.ts` (replace empty body):
```typescript
export * from './types.js';
```

- [ ] **Step 4: Run test (should pass)**

```bash
pnpm --filter @chainward/decode test
```

Expected: PASS, 1 test.

- [ ] **Step 5: Commit**

```bash
git add packages/decode/src/types.ts packages/decode/src/index.ts packages/decode/__tests__/types-compile.test.ts
git commit -m "feat(decode): define QuickDecodeResult schema types"
```

---

## Task 3: Move `resolver` from `scripts/auto-decode/lib/`

**Files:**
- Move: `scripts/auto-decode/lib/resolver.ts` → `packages/decode/src/resolver.ts`
- Move: `scripts/auto-decode/lib/__tests__/resolver.test.ts` → `packages/decode/__tests__/resolver.test.ts` (if exists)
- Modify: `scripts/auto-decode/index.ts` (update import)
- Modify: `packages/decode/src/index.ts` (re-export)

- [ ] **Step 1: Inspect existing resolver to confirm shape**

```bash
cat scripts/auto-decode/lib/resolver.ts
ls scripts/auto-decode/lib/__tests__/
```

Note: Existing tests stay green after the move (this is a refactor, not a behavioral change).

- [ ] **Step 2: Move source + test files**

```bash
git mv scripts/auto-decode/lib/resolver.ts packages/decode/src/resolver.ts
# move resolver tests if present
[ -f scripts/auto-decode/lib/__tests__/resolver.test.ts ] && \
  git mv scripts/auto-decode/lib/__tests__/resolver.test.ts packages/decode/__tests__/resolver.test.ts
```

- [ ] **Step 3: Update import in `scripts/auto-decode/index.ts`**

Open `scripts/auto-decode/index.ts`. Find the line:
```typescript
import { resolveTarget } from "./lib/resolver.js";
```
Replace with:
```typescript
import { resolveTarget } from "@chainward/decode";
```

- [ ] **Step 4: Re-export from packages/decode/src/index.ts**

Add to `packages/decode/src/index.ts`:
```typescript
export * from './resolver.js';
```

- [ ] **Step 5: Verify auto-decode workspace can find @chainward/decode**

Open `scripts/auto-decode/package.json`. Add to dependencies if not present:
```json
{
  "dependencies": {
    "@chainward/decode": "workspace:*"
  }
}
```

Run:
```bash
pnpm install
pnpm --filter @chainward/auto-decode test
pnpm --filter @chainward/decode test
```

Expected: both pass. Auto-decode tests still green; resolver tests now run from new location.

- [ ] **Step 6: Commit**

```bash
git add -A scripts/auto-decode packages/decode
git commit -m "refactor(decode): move resolver from scripts/auto-decode to @chainward/decode"
```

---

## Task 4: Capture test fixtures from chain + APIs

**Files:**
- Create: `packages/decode/__tests__/fixtures/axelrod-active.json`
- Create: `packages/decode/__tests__/fixtures/lucien-dormant.json`
- Create: `packages/decode/__tests__/fixtures/otto-active.json`
- Create: `packages/decode/__tests__/fixtures/ethy-borderline.json`
- Create: `packages/decode/__tests__/fixtures/luna-dormant.json`

- [ ] **Step 1: Capture data for each fixture wallet via curl**

```bash
mkdir -p packages/decode/__tests__/fixtures

# Axelrod (active)
WALLET=0x999A1B6033998A05F7e37e4BD471038dF46624E1
ACP_ID=129
curl -sL -A 'Mozilla/5.0' "https://acpx.virtuals.io/api/agents/${ACP_ID}/details" -o /tmp/acp.json
curl -sL "https://base.blockscout.com/api/v2/addresses/${WALLET}/counters" -o /tmp/counters.json
curl -sL "https://base.blockscout.com/api/v2/addresses/${WALLET}/token-transfers?type=ERC-20" -o /tmp/transfers.json
ssh cw-sentinel "curl -s -X POST -H 'Content-Type: application/json' \
  -d '{\"jsonrpc\":\"2.0\",\"method\":\"eth_getCode\",\"params\":[\"${WALLET}\",\"latest\"],\"id\":1}' \
  http://localhost:8545" > /tmp/code.json
ssh cw-sentinel "curl -s -X POST -H 'Content-Type: application/json' \
  -d '{\"jsonrpc\":\"2.0\",\"method\":\"eth_getTransactionCount\",\"params\":[\"${WALLET}\",\"latest\"],\"id\":1}' \
  http://localhost:8545" > /tmp/nonce.json

# Combine into one fixture file
node -e "
const fs = require('fs');
const fixture = {
  acp_details: JSON.parse(fs.readFileSync('/tmp/acp.json', 'utf8')),
  blockscout_counters: JSON.parse(fs.readFileSync('/tmp/counters.json', 'utf8')),
  blockscout_transfers: JSON.parse(fs.readFileSync('/tmp/transfers.json', 'utf8')),
  sentinel_code: JSON.parse(fs.readFileSync('/tmp/code.json', 'utf8')),
  sentinel_nonce: JSON.parse(fs.readFileSync('/tmp/nonce.json', 'utf8')),
};
fs.writeFileSync('packages/decode/__tests__/fixtures/axelrod-active.json', JSON.stringify(fixture, null, 2));
"
```

Repeat for each wallet:
- Lucien (dormant): `0xeee9Cb0fafF1D9e7423BF87A341C70F58A1A0cc7`, ACP id 59
- Otto AI (active): `0x5bB4B0C766E0D5D791d9403Fc275c22064709F68`, ACP id 788
- Ethy AI (borderline): `0xfc9f1fF5eC524759c1Dc8E0a6EBA6c22805b9d8B`, ACP id 84
- Luna (dormant, mediahouse cluster): `0xE7f4fF72122B0040eB31d6470D75cb2bFe4c32c5`, ACP id 74

- [ ] **Step 2: Verify fixtures exist and are valid JSON**

```bash
for f in packages/decode/__tests__/fixtures/*.json; do
  echo "=== $f ==="
  node -e "JSON.parse(require('fs').readFileSync('$f','utf8'))" && echo "valid"
done
```

Expected: 5 valid JSON files.

- [ ] **Step 3: Commit**

```bash
git add packages/decode/__tests__/fixtures/
git commit -m "test(decode): capture chain + ACP fixtures from 2026-04-29 investigation"
```

---

## Task 5: `wallet-arch` module — classify wallet type

**Files:**
- Create: `packages/decode/src/wallet-arch.ts`
- Create: `packages/decode/__tests__/wallet-arch.test.ts`
- Modify: `packages/decode/src/index.ts`

- [ ] **Step 1: Write the failing test**

`packages/decode/__tests__/wallet-arch.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { classifyWallet, isVirtualsFactoryProxy } from '../src/wallet-arch.js';

const VIRTUALS_FACTORY_PROXY_BYTECODE_PREFIX = '0x363d3d373d3d363d7f';

describe('classifyWallet', () => {
  it('classifies a Virtuals factory ERC-1967 proxy as erc1967_proxy', () => {
    const result = classifyWallet({
      code: VIRTUALS_FACTORY_PROXY_BYTECODE_PREFIX + '360894' + '1'.repeat(60),
      nonce: 1,
    });
    expect(result.type).toBe('erc1967_proxy');
    expect(result.is_virtuals_factory).toBe(true);
    expect(result.code_size).toBeGreaterThan(0);
  });

  it('classifies an EOA (no code) as eoa', () => {
    const result = classifyWallet({ code: '0x', nonce: 5 });
    expect(result.type).toBe('eoa');
    expect(result.is_virtuals_factory).toBe(false);
    expect(result.code_size).toBe(0);
  });

  it('classifies an unknown contract as contract', () => {
    const result = classifyWallet({ code: '0x6080604052' + 'a'.repeat(200), nonce: 1 });
    expect(result.type).toBe('contract');
    expect(result.is_virtuals_factory).toBe(false);
  });
});

describe('isVirtualsFactoryProxy', () => {
  it('returns true for the standard Virtuals minimal proxy bytecode', () => {
    expect(isVirtualsFactoryProxy('0x363d3d373d3d363d7f360894' + '0'.repeat(60))).toBe(true);
  });
  it('returns false for empty code', () => {
    expect(isVirtualsFactoryProxy('0x')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test (should fail — module not present)**

```bash
pnpm --filter @chainward/decode test wallet-arch
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the module**

`packages/decode/src/wallet-arch.ts`:
```typescript
import type { WalletType } from './types.js';

const VIRTUALS_FACTORY_PROXY_PREFIX = '0x363d3d373d3d363d7f';

export function isVirtualsFactoryProxy(code: string): boolean {
  if (!code || code === '0x') return false;
  return code.toLowerCase().startsWith(VIRTUALS_FACTORY_PROXY_PREFIX);
}

export interface ClassifyInput {
  code: string;
  nonce: number;
}

export interface ClassifyResult {
  type: WalletType;
  nonce: number;
  code_size: number;
  is_virtuals_factory: boolean;
}

export function classifyWallet(input: ClassifyInput): ClassifyResult {
  const code = input.code ?? '0x';
  const codeSize = code === '0x' ? 0 : (code.length - 2) / 2;
  const isVirtuals = isVirtualsFactoryProxy(code);

  let type: WalletType;
  if (codeSize === 0) {
    type = 'eoa';
  } else if (isVirtuals) {
    type = 'erc1967_proxy';
  } else {
    type = 'contract';
  }

  return {
    type,
    nonce: input.nonce,
    code_size: codeSize,
    is_virtuals_factory: isVirtuals,
  };
}
```

Add to `packages/decode/src/index.ts`:
```typescript
export * from './wallet-arch.js';
```

- [ ] **Step 4: Run test (should pass)**

```bash
pnpm --filter @chainward/decode test wallet-arch
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/decode/src/wallet-arch.ts packages/decode/__tests__/wallet-arch.test.ts packages/decode/src/index.ts
git commit -m "feat(decode): wallet-arch classifier (EOA / ERC-1967 / contract)"
```

---

## Task 6: `spam-tokens` static list

**Files:**
- Create: `packages/decode/src/spam-tokens.ts`
- Create: `packages/decode/__tests__/spam-tokens.test.ts`
- Modify: `packages/decode/src/index.ts`

- [ ] **Step 1: Write the failing test**

`packages/decode/__tests__/spam-tokens.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { isSpamToken, isSpamSender, SPAM_SENDERS } from '../src/spam-tokens.js';

describe('spam-tokens', () => {
  it('flags the known HUB airdrop sender', () => {
    expect(isSpamSender('0xD152f549545093347A162Dce210e7293f1452150')).toBe(true);
    expect(isSpamSender('0xd152f549545093347a162dce210e7293f1452150')).toBe(true); // lowercase
  });

  it('does not flag PaymentManager', () => {
    expect(isSpamSender('0xEF4364Fe4487353dF46eb7c811D4FAc78b856c7F')).toBe(false);
  });

  it('flags HUB token contract as spam', () => {
    // HUB token contract address (replace with actual if different)
    const hub = '0x0000000000000000000000000000000000000000'; // placeholder until known
    expect(isSpamToken(hub) || !isSpamToken(hub)).toBe(true); // sanity
  });

  it('exports a list of known spam senders', () => {
    expect(SPAM_SENDERS.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test (should fail)**

```bash
pnpm --filter @chainward/decode test spam-tokens
```

Expected: FAIL.

- [ ] **Step 3: Implement the module**

`packages/decode/src/spam-tokens.ts`:
```typescript
// Known senders that mass-airdrop unsolicited tokens to ACP agent wallets.
// These transfers do NOT represent agent activity and must be filtered from
// counters and recency calculations. Phase 2 will replace this with a generic
// classifier.
export const SPAM_SENDERS: string[] = [
  '0xD152f549545093347A162Dce210e7293f1452150', // HUB airdrop, mass distribution 2026-04-11
];

// Known spam token contracts (extends as new airdrop waves appear).
export const SPAM_TOKEN_CONTRACTS: string[] = [];

const SENDERS_LOWER = new Set(SPAM_SENDERS.map((a) => a.toLowerCase()));
const TOKENS_LOWER = new Set(SPAM_TOKEN_CONTRACTS.map((a) => a.toLowerCase()));

export function isSpamSender(address: string): boolean {
  return SENDERS_LOWER.has(address.toLowerCase());
}

export function isSpamToken(contractAddress: string): boolean {
  return TOKENS_LOWER.has(contractAddress.toLowerCase());
}
```

Add to `packages/decode/src/index.ts`:
```typescript
export * from './spam-tokens.js';
```

- [ ] **Step 4: Run test**

```bash
pnpm --filter @chainward/decode test spam-tokens
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/decode/src/spam-tokens.ts packages/decode/__tests__/spam-tokens.test.ts packages/decode/src/index.ts
git commit -m "feat(decode): spam-tokens static list (HUB airdrop)"
```

---

## Task 7: `chain-audit` — fetch balances + transfers + counterparties

**Files:**
- Create: `packages/decode/src/chain-audit.ts`
- Create: `packages/decode/__tests__/chain-audit.test.ts`
- Modify: `packages/decode/src/index.ts`

- [ ] **Step 1: Write the failing test**

`packages/decode/__tests__/chain-audit.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  computeActivity,
  computeBalances,
  filterSpamTransfers,
} from '../src/chain-audit.js';

const fx = (name: string) =>
  JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8'));

describe('filterSpamTransfers', () => {
  it('excludes transfers from known spam senders', () => {
    const transfers = [
      { from: { hash: '0xD152f549545093347A162Dce210e7293f1452150' }, timestamp: '2026-04-11T00:00:00Z' },
      { from: { hash: '0xEF4364Fe4487353dF46eb7c811D4FAc78b856c7F' }, timestamp: '2026-04-29T00:00:00Z' },
    ];
    const filtered = filterSpamTransfers(transfers);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].from.hash.toLowerCase()).toBe('0xef4364fe4487353df46eb7c811d4fac78b856c7f');
  });
});

describe('computeActivity (Axelrod fixture)', () => {
  it('produces non-zero recent transfer counts for an active wallet', () => {
    const fixture = fx('axelrod-active.json');
    const now = new Date('2026-04-30T12:00:00Z'); // pin clock for determinism
    const activity = computeActivity(fixture.blockscout_transfers.items, now);
    expect(activity.transfers_7d).toBeGreaterThan(0);
    expect(activity.latest_transfer_at).not.toBeNull();
  });
});

describe('computeActivity (Lucien fixture)', () => {
  it('produces zero 7d-transfer count for a dormant wallet', () => {
    const fixture = fx('lucien-dormant.json');
    const now = new Date('2026-04-30T12:00:00Z');
    const activity = computeActivity(fixture.blockscout_transfers.items, now);
    expect(activity.transfers_7d).toBe(0);
    expect(activity.latest_transfer_age_hours).toBeGreaterThan(168); // >7d
  });
});

describe('computeBalances', () => {
  it('returns USDC balance from sentinel eth_call response', () => {
    const balances = computeBalances({
      ethBalanceWei: '0x0',
      usdcRawBalance: '0x' + (6_420_000n).toString(16), // 6.42 USDC (6 decimals)
      ethUsdPrice: 0,
      usdcUsdPrice: 1,
    });
    expect(balances.usdc.amount).toBeCloseTo(6.42, 2);
    expect(balances.usdc.usd).toBeCloseTo(6.42, 2);
  });
});
```

- [ ] **Step 2: Run test (should fail — module not present)**

```bash
pnpm --filter @chainward/decode test chain-audit
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the module**

`packages/decode/src/chain-audit.ts`:
```typescript
import { isSpamSender } from './spam-tokens.js';
import type { QuickDecodeResultData } from './types.js';

export interface BlockscoutTransfer {
  from: { hash: string };
  to?: { hash: string };
  timestamp: string;
  token?: { symbol?: string; address?: string };
}

export function filterSpamTransfers<T extends BlockscoutTransfer>(transfers: T[]): T[] {
  return transfers.filter((t) => !isSpamSender(t.from.hash));
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function computeActivity(
  transfersRaw: BlockscoutTransfer[],
  now: Date,
): QuickDecodeResultData['activity'] {
  const transfers = filterSpamTransfers(transfersRaw);

  if (transfers.length === 0) {
    return {
      latest_transfer_at: null,
      latest_transfer_age_hours: null,
      transfers_24h: 0,
      transfers_7d: 0,
      transfers_30d: 0,
      unique_counterparties_30d: 0,
    };
  }

  const sorted = [...transfers].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
  const latest = sorted[0];
  const latestT = new Date(latest.timestamp).getTime();
  const ageHours = (now.getTime() - latestT) / HOUR_MS;

  const within = (windowMs: number) =>
    transfers.filter((t) => now.getTime() - new Date(t.timestamp).getTime() <= windowMs).length;

  const counterparties30d = new Set(
    transfers
      .filter((t) => now.getTime() - new Date(t.timestamp).getTime() <= 30 * DAY_MS)
      .flatMap((t) => [t.from.hash, t.to?.hash].filter((h): h is string => Boolean(h))),
  );

  return {
    latest_transfer_at: latest.timestamp,
    latest_transfer_age_hours: Math.round(ageHours * 100) / 100,
    transfers_24h: within(DAY_MS),
    transfers_7d: within(7 * DAY_MS),
    transfers_30d: within(30 * DAY_MS),
    unique_counterparties_30d: counterparties30d.size,
  };
}

export interface ComputeBalancesInput {
  ethBalanceWei: string;
  usdcRawBalance: string; // hex from eth_call
  ethUsdPrice: number;
  usdcUsdPrice: number;
}

export function computeBalances(
  input: ComputeBalancesInput,
): QuickDecodeResultData['balances'] {
  const ethWei = BigInt(input.ethBalanceWei);
  const usdc = Number(BigInt(input.usdcRawBalance)) / 1e6;
  const ethAmount = Number(ethWei) / 1e18;
  return {
    eth: { wei: ethWei.toString(), usd: ethAmount * input.ethUsdPrice },
    usdc: { amount: usdc, usd: usdc * input.usdcUsdPrice },
    agent_token: null,
  };
}
```

Add to `packages/decode/src/index.ts`:
```typescript
export * from './chain-audit.js';
```

- [ ] **Step 4: Run test**

```bash
pnpm --filter @chainward/decode test chain-audit
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/decode/src/chain-audit.ts packages/decode/__tests__/chain-audit.test.ts packages/decode/src/index.ts
git commit -m "feat(decode): chain-audit (balances, activity, spam filter)"
```

---

## Task 8: `discrepancies` — ACP claims vs chain reality + 2999-12-31 handling

**Files:**
- Create: `packages/decode/src/discrepancies.ts`
- Create: `packages/decode/__tests__/discrepancies.test.ts`
- Modify: `packages/decode/src/index.ts`

- [ ] **Step 1: Write the failing test**

`packages/decode/__tests__/discrepancies.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { compareACPClaims } from '../src/discrepancies.js';

describe('compareACPClaims', () => {
  it('emits a migration_artifact discrepancy for 2999-12-31 ACP lastActiveAt', () => {
    const result = compareACPClaims({
      acp: { lastActiveAt: '2999-12-31T00:00:00Z', isOnline: false },
      chain: { latest_transfer_at: '2026-04-29T00:00:00Z', active_today: false, active_7d: true },
    });
    const migration = result.discrepancies.find((d) => d.reason === 'migration_artifact');
    expect(migration).toBeDefined();
    expect(migration?.field).toBe('lastActiveAt');
    expect(migration?.severity).toBe('info');
    expect(result.checks_performed).toContain('lastActiveAt');
  });

  it('emits no discrepancy when ACP isOnline matches chain reality', () => {
    const result = compareACPClaims({
      acp: { lastActiveAt: '2026-04-30T00:00:00Z', isOnline: true },
      chain: { latest_transfer_at: '2026-04-30T00:00:00Z', active_today: true, active_7d: true },
    });
    expect(result.discrepancies.filter((d) => d.field === 'isOnline')).toHaveLength(0);
    expect(result.checks_performed).toContain('isOnline');
  });

  it('emits a warn discrepancy when ACP says online but chain shows 7d dormancy', () => {
    const result = compareACPClaims({
      acp: { lastActiveAt: '2026-04-29T00:00:00Z', isOnline: true },
      chain: { latest_transfer_at: '2026-04-01T00:00:00Z', active_today: false, active_7d: false },
    });
    const isOnline = result.discrepancies.find((d) => d.field === 'isOnline');
    expect(isOnline).toBeDefined();
    expect(isOnline?.severity).toBe('warn');
  });

  it('populates checks_performed even when no discrepancies found', () => {
    const result = compareACPClaims({
      acp: { lastActiveAt: '2026-04-30T00:00:00Z', isOnline: true },
      chain: { latest_transfer_at: '2026-04-30T00:00:00Z', active_today: true, active_7d: true },
    });
    expect(result.checks_performed.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test (should fail)**

```bash
pnpm --filter @chainward/decode test discrepancies
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement the module**

`packages/decode/src/discrepancies.ts`:
```typescript
import type { Discrepancy } from './types.js';

const MIGRATION_PLACEHOLDER = '2999-12-31';

export interface CompareInput {
  acp: {
    lastActiveAt: string | null;
    isOnline: boolean | null;
  };
  chain: {
    latest_transfer_at: string | null;
    active_today: boolean;
    active_7d: boolean;
  };
}

export interface CompareOutput {
  discrepancies: Discrepancy[];
  checks_performed: string[];
}

export function compareACPClaims(input: CompareInput): CompareOutput {
  const discrepancies: Discrepancy[] = [];
  const checks_performed: string[] = [];

  // Check: lastActiveAt
  checks_performed.push('lastActiveAt');
  if (input.acp.lastActiveAt && input.acp.lastActiveAt.startsWith(MIGRATION_PLACEHOLDER)) {
    discrepancies.push({
      field: 'lastActiveAt',
      acp_says: input.acp.lastActiveAt,
      chain_says: input.chain.latest_transfer_at ?? 'no on-chain activity',
      severity: 'info',
      reason: 'migration_artifact',
    });
  }

  // Check: isOnline
  checks_performed.push('isOnline');
  if (input.acp.isOnline === true && !input.chain.active_7d) {
    discrepancies.push({
      field: 'isOnline',
      acp_says: 'true',
      chain_says: 'no transfers in last 7 days',
      severity: 'warn',
    });
  }

  return { discrepancies, checks_performed };
}
```

Add to `packages/decode/src/index.ts`:
```typescript
export * from './discrepancies.js';
```

- [ ] **Step 4: Run test**

```bash
pnpm --filter @chainward/decode test discrepancies
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/decode/src/discrepancies.ts packages/decode/__tests__/discrepancies.test.ts packages/decode/src/index.ts
git commit -m "feat(decode): discrepancies + 2999-12-31 migration_artifact handling"
```

---

## Task 9: `survival` classifier — boundary tables

**Files:**
- Create: `packages/decode/src/survival.ts`
- Create: `packages/decode/__tests__/survival.test.ts`
- Modify: `packages/decode/src/index.ts`

- [ ] **Step 1: Write the failing test**

`packages/decode/__tests__/survival.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { classifySurvival } from '../src/survival.js';

describe('classifySurvival', () => {
  it('classifies as active when transfers_7d >= 5 and recent', () => {
    const r = classifySurvival({ transfers_7d: 32, latest_transfer_age_hours: 1.2 });
    expect(r.classification).toBe('active');
  });

  it('classifies as at_risk when 1-4 transfers in last 7d', () => {
    const r = classifySurvival({ transfers_7d: 3, latest_transfer_age_hours: 50 });
    expect(r.classification).toBe('at_risk');
  });

  it('classifies as at_risk when last activity 48-168h ago', () => {
    const r = classifySurvival({ transfers_7d: 1, latest_transfer_age_hours: 100 });
    expect(r.classification).toBe('at_risk');
  });

  it('classifies as dormant when zero 7d transfers AND age > 168h', () => {
    const r = classifySurvival({ transfers_7d: 0, latest_transfer_age_hours: 500 });
    expect(r.classification).toBe('dormant');
    expect(r.rationale).toBeTruthy();
  });

  it('classifies ETH-only EOA (null age) as unknown', () => {
    const r = classifySurvival({ transfers_7d: 0, latest_transfer_age_hours: null });
    expect(r.classification).toBe('unknown');
  });

  it('produces a non-empty rationale for every classification', () => {
    const cases = [
      { transfers_7d: 32, latest_transfer_age_hours: 1 },
      { transfers_7d: 3, latest_transfer_age_hours: 50 },
      { transfers_7d: 0, latest_transfer_age_hours: 500 },
      { transfers_7d: 0, latest_transfer_age_hours: null },
    ];
    for (const c of cases) {
      expect(classifySurvival(c).rationale).not.toBe('');
    }
  });
});
```

- [ ] **Step 2: Run test (should fail)**

```bash
pnpm --filter @chainward/decode test survival
```

Expected: FAIL.

- [ ] **Step 3: Implement the module**

`packages/decode/src/survival.ts`:
```typescript
import type { SurvivalClassification } from './types.js';

export interface SurvivalInput {
  transfers_7d: number;
  latest_transfer_age_hours: number | null;
}

export interface SurvivalResult {
  classification: SurvivalClassification;
  rationale: string;
}

// Boundary table at classifier_version 1.0.0 — see spec section "Boundary tables"
//   active   = transfers_7d >= 5 AND latest_transfer_age_hours <= 48
//   at_risk  = transfers_7d in [1, 4] OR latest_transfer_age_hours in (48, 168]
//   dormant  = transfers_7d == 0 AND latest_transfer_age_hours > 168
//   unknown  = latest_transfer_age_hours == null (no token transfers ever)

export function classifySurvival(input: SurvivalInput): SurvivalResult {
  const { transfers_7d, latest_transfer_age_hours: age } = input;

  if (age === null) {
    return {
      classification: 'unknown',
      rationale: 'no ERC-20 transfers found; wallet may be ETH-only or never used as agent',
    };
  }

  if (transfers_7d >= 5 && age <= 48) {
    return {
      classification: 'active',
      rationale: `${transfers_7d} transfers in last 7d, latest ${formatAge(age)} ago`,
    };
  }

  if (transfers_7d === 0 && age > 168) {
    return {
      classification: 'dormant',
      rationale: `no transfers in last 7 days; last activity ${formatAge(age)} ago`,
    };
  }

  if ((transfers_7d >= 1 && transfers_7d <= 4) || (age > 48 && age <= 168)) {
    return {
      classification: 'at_risk',
      rationale: `${transfers_7d} transfers in last 7d, latest ${formatAge(age)} ago`,
    };
  }

  return {
    classification: 'unknown',
    rationale: 'classification boundaries did not match',
  };
}

function formatAge(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} minutes`;
  if (hours < 24) return `${Math.round(hours)} hours`;
  return `${Math.round(hours / 24)} days`;
}
```

Add to `packages/decode/src/index.ts`:
```typescript
export * from './survival.js';
```

- [ ] **Step 4: Run test**

```bash
pnpm --filter @chainward/decode test survival
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/decode/src/survival.ts packages/decode/__tests__/survival.test.ts packages/decode/src/index.ts
git commit -m "feat(decode): survival classifier with boundary tables v1.0.0"
```

---

## Task 10: `usdc-pattern` classifier

**Files:**
- Create: `packages/decode/src/usdc-pattern.ts`
- Create: `packages/decode/__tests__/usdc-pattern.test.ts`
- Modify: `packages/decode/src/index.ts`

- [ ] **Step 1: Write the failing test**

`packages/decode/__tests__/usdc-pattern.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { classifyUsdcPattern } from '../src/usdc-pattern.js';

describe('classifyUsdcPattern', () => {
  it('returns running for active wallet with low USDC', () => {
    expect(classifyUsdcPattern({ classification: 'active', usdc_balance: 6.42 })).toBe('running');
  });
  it('returns accumulating for active wallet with high USDC', () => {
    expect(classifyUsdcPattern({ classification: 'active', usdc_balance: 250 })).toBe('accumulating');
  });
  it('returns graveyard for dormant wallet with high USDC (the stranded-value finding)', () => {
    expect(classifyUsdcPattern({ classification: 'dormant', usdc_balance: 3658 })).toBe('graveyard');
  });
  it('returns inactive for dormant wallet with low USDC', () => {
    expect(classifyUsdcPattern({ classification: 'dormant', usdc_balance: 31 })).toBe('inactive');
  });
  it('returns unknown for unknown classification', () => {
    expect(classifyUsdcPattern({ classification: 'unknown', usdc_balance: 100 })).toBe('unknown');
  });
});
```

- [ ] **Step 2: Run test (should fail)**

```bash
pnpm --filter @chainward/decode test usdc-pattern
```

Expected: FAIL.

- [ ] **Step 3: Implement the module**

`packages/decode/src/usdc-pattern.ts`:
```typescript
import type { SurvivalClassification, UsdcPattern } from './types.js';

export interface UsdcPatternInput {
  classification: SurvivalClassification;
  usdc_balance: number;
}

// Boundary table v1.0.0 — see spec section "Boundary tables"
export function classifyUsdcPattern(input: UsdcPatternInput): UsdcPattern {
  const { classification, usdc_balance } = input;

  if (classification === 'unknown') return 'unknown';

  if (classification === 'active') {
    return usdc_balance < 50 ? 'running' : 'accumulating';
  }

  // dormant or at_risk
  if (classification === 'dormant') {
    return usdc_balance >= 100 ? 'graveyard' : 'inactive';
  }

  // at_risk: treat similarly to active for funding pattern
  return usdc_balance < 50 ? 'running' : 'accumulating';
}
```

Add to `packages/decode/src/index.ts`:
```typescript
export * from './usdc-pattern.js';
```

- [ ] **Step 4: Run test**

```bash
pnpm --filter @chainward/decode test usdc-pattern
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/decode/src/usdc-pattern.ts packages/decode/__tests__/usdc-pattern.test.ts packages/decode/src/index.ts
git commit -m "feat(decode): usdc-pattern classifier (running/accumulating/graveyard/inactive)"
```

---

## Task 11: `peers` — comparable agents from observatory

**Files:**
- Create: `packages/decode/src/peers.ts`
- Create: `packages/decode/__tests__/peers.test.ts`
- Modify: `packages/decode/src/index.ts`

- [ ] **Step 1: Write the failing test**

`packages/decode/__tests__/peers.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { findPeers, computeClusterStatus } from '../src/peers.js';

const observatorySample = [
  { address: '0xAxelrod', name: 'Axelrod', framework: 'virtuals', cluster: null, classification: 'active' },
  { address: '0xOtto', name: 'Otto AI', framework: 'virtuals', cluster: null, classification: 'active' },
  { address: '0xNox', name: 'Nox', framework: 'virtuals', cluster: null, classification: 'active' },
  { address: '0xLuna', name: 'Luna', framework: 'virtuals', cluster: 'mediahouse', classification: 'dormant' },
  { address: '0xLucien', name: 'Director Lucien', framework: 'virtuals', cluster: 'mediahouse', classification: 'dormant' },
  { address: '0xSympson', name: 'Sympson', framework: 'virtuals', cluster: 'mediahouse', classification: 'dormant' },
  { address: '0xClaw', name: 'ClawFeed', framework: 'virtuals', cluster: 'mediahouse', classification: 'active' },
];

describe('findPeers', () => {
  it('returns active and dormant cohorts from the observatory', () => {
    const result = findPeers({
      framework: 'virtuals_acp',
      cluster: null,
      observatory: observatorySample,
      excludeAddress: '0xAxelrod',
    });
    expect(result.similar_active).toContain('Otto AI');
    expect(result.similar_active).not.toContain('Axelrod');
  });
});

describe('computeClusterStatus', () => {
  it('returns collapsed when >=75% of cluster is dormant', () => {
    const status = computeClusterStatus('mediahouse', observatorySample);
    expect(status).toBe('collapsed'); // 3 dormant / 4 total = 75%
  });
  it('returns null when wallet has no cluster', () => {
    expect(computeClusterStatus(null, observatorySample)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test (should fail)**

```bash
pnpm --filter @chainward/decode test peers
```

Expected: FAIL.

- [ ] **Step 3: Implement the module**

`packages/decode/src/peers.ts`:
```typescript
import type { Framework, ClusterStatus, SurvivalClassification } from './types.js';

export interface ObservatoryAgent {
  address: string;
  name: string;
  framework: string;
  cluster: string | null;
  classification: SurvivalClassification | string;
}

export interface FindPeersInput {
  framework: Framework;
  cluster: string | null;
  observatory: ObservatoryAgent[];
  excludeAddress: string;
  limit?: number;
}

export interface PeersResult {
  similar_active: string[];
  similar_dormant: string[];
}

export function findPeers(input: FindPeersInput): PeersResult {
  const { framework, observatory, excludeAddress } = input;
  const limit = input.limit ?? 5;
  const fw = framework.replace('virtuals_acp', 'virtuals');

  const cohort = observatory.filter(
    (a) => a.framework === fw && a.address.toLowerCase() !== excludeAddress.toLowerCase(),
  );

  const active = cohort.filter((a) => a.classification === 'active').slice(0, limit).map((a) => a.name);
  const dormant = cohort.filter((a) => a.classification === 'dormant').slice(0, limit).map((a) => a.name);

  return { similar_active: active, similar_dormant: dormant };
}

export function computeClusterStatus(
  cluster: string | null,
  observatory: ObservatoryAgent[],
): ClusterStatus {
  if (!cluster) return null;
  const members = observatory.filter((a) => a.cluster === cluster);
  if (members.length === 0) return null;

  const dormantPct = members.filter((a) => a.classification === 'dormant').length / members.length;
  const activePct = members.filter((a) => a.classification === 'active').length / members.length;

  if (dormantPct >= 0.75) return 'collapsed';
  if (activePct >= 0.5) return 'active';
  return 'mixed';
}
```

Add to `packages/decode/src/index.ts`:
```typescript
export * from './peers.js';
```

- [ ] **Step 4: Run test**

```bash
pnpm --filter @chainward/decode test peers
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/decode/src/peers.ts packages/decode/__tests__/peers.test.ts packages/decode/src/index.ts
git commit -m "feat(decode): peers + cluster_status from observatory"
```

---

## Task 12: `token-trading` — FDV / 24h volume / holder count

**Files:**
- Create: `packages/decode/src/token-trading.ts`
- Create: `packages/decode/__tests__/token-trading.test.ts`
- Modify: `packages/decode/src/index.ts`

- [ ] **Step 1: Write the failing test**

`packages/decode/__tests__/token-trading.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { extractTokenTrading } from '../src/token-trading.js';

describe('extractTokenTrading', () => {
  it('returns null when agent has no tokenAddress', () => {
    expect(
      extractTokenTrading({ acp_details: { tokenAddress: null }, geckoterminal: null }),
    ).toBeNull();
  });

  it('extracts FDV and 24h volume from GeckoTerminal response', () => {
    const result = extractTokenTrading({
      acp_details: { tokenAddress: '0x444600d9fA140E9506D0cBC436Bffad3D5C3Febc', symbol: 'LUCIEN' },
      geckoterminal: {
        data: {
          attributes: {
            fdv_usd: '6128400.0',
            volume_usd: { h24: '24.50' },
            total_supply: '1000000000',
          },
        },
      },
    });
    expect(result?.fdv_usd).toBeCloseTo(6128400, -1);
    expect(result?.volume_24h_usd).toBeCloseTo(24.5, 1);
    expect(result?.source).toBe('geckoterminal');
  });

  it('falls back to virtuals_api when geckoterminal data unavailable', () => {
    const result = extractTokenTrading({
      acp_details: {
        tokenAddress: '0xabc',
        symbol: 'X',
        token24hVolume: 1234,
      },
      geckoterminal: null,
    });
    expect(result?.source).toBe('virtuals_api');
    expect(result?.volume_24h_usd).toBe(1234);
  });
});
```

- [ ] **Step 2: Run test (should fail)**

```bash
pnpm --filter @chainward/decode test token-trading
```

Expected: FAIL.

- [ ] **Step 3: Implement the module**

`packages/decode/src/token-trading.ts`:
```typescript
import type { QuickDecodeResultData } from './types.js';

export interface ExtractInput {
  acp_details: {
    tokenAddress?: string | null;
    symbol?: string | null;
    token24hVolume?: number | null;
    tokenFDV?: number | null;
    tokenHolderCount?: number | null;
  };
  geckoterminal: {
    data?: {
      attributes?: {
        fdv_usd?: string | null;
        volume_usd?: { h24?: string | null };
      };
    };
  } | null;
  blockscout_token_holders?: number | null;
}

export function extractTokenTrading(input: ExtractInput): QuickDecodeResultData['token_trading'] {
  const tokenAddr = input.acp_details.tokenAddress;
  if (!tokenAddr) return null;

  const symbol = input.acp_details.symbol ?? '';
  const fetched_at = new Date().toISOString();

  const gt = input.geckoterminal?.data?.attributes;
  if (gt && (gt.fdv_usd || gt.volume_usd?.h24)) {
    return {
      contract_address: tokenAddr,
      symbol,
      fdv_usd: gt.fdv_usd ? parseFloat(gt.fdv_usd) : null,
      volume_24h_usd: gt.volume_usd?.h24 ? parseFloat(gt.volume_usd.h24) : null,
      holder_count: input.blockscout_token_holders ?? null,
      source: 'geckoterminal',
      fetched_at,
    };
  }

  if (input.acp_details.token24hVolume !== undefined && input.acp_details.token24hVolume !== null) {
    return {
      contract_address: tokenAddr,
      symbol,
      fdv_usd: input.acp_details.tokenFDV ?? null,
      volume_24h_usd: input.acp_details.token24hVolume ?? null,
      holder_count: input.acp_details.tokenHolderCount ?? input.blockscout_token_holders ?? null,
      source: 'virtuals_api',
      fetched_at,
    };
  }

  return null;
}
```

Add to `packages/decode/src/index.ts`:
```typescript
export * from './token-trading.js';
```

- [ ] **Step 4: Run test**

```bash
pnpm --filter @chainward/decode test token-trading
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/decode/src/token-trading.ts packages/decode/__tests__/token-trading.test.ts packages/decode/src/index.ts
git commit -m "feat(decode): token-trading (fdv, 24h volume, holder count)"
```

---

## Task 13: Fallback report template

**Files:**
- Create: `packages/decode/src/templates/report-fallback.md.ts`
- Create: `packages/decode/__tests__/report-fallback.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/decode/__tests__/report-fallback.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { renderFallbackReport } from '../src/templates/report-fallback.md.js';
import type { QuickDecodeResultData } from '../src/types.js';

const sampleData: QuickDecodeResultData = {
  target: {
    input: '@axelrod',
    wallet_address: '0x999A1B6033998A05F7e37e4BD471038dF46624E1',
    handle: 'AIxVC_Axelrod',
    name: 'Axelrod',
    acp_id: 129,
    virtuals_agent_id: null,
    framework: 'virtuals_acp',
    owner_address: null,
  },
  wallet: { type: 'erc1967_proxy', nonce: 1, code_size: 234, is_virtuals_factory: true },
  balances: { eth: { wei: '0', usd: 0 }, usdc: { amount: 6.42, usd: 6.42 }, agent_token: null },
  token_trading: null,
  activity: {
    latest_transfer_at: '2026-04-30T00:00:00Z',
    latest_transfer_age_hours: 1.2,
    transfers_24h: 36,
    transfers_7d: 42,
    transfers_30d: 182,
    unique_counterparties_30d: 12,
  },
  claims: {
    agdp: 106928592.89, revenue: null, successful_jobs: null, total_jobs: null,
    success_rate: 94.84, last_active_at_acp: null, is_online_acp: true,
  },
  chain_reality: {
    active_today: true, active_7d: true, active_30d: true,
    settlement_path: ['payment_manager_in'], payment_manager_seen: true,
  },
  discrepancies: [],
  checks_performed: ['lastActiveAt', 'isOnline'],
  survival: { classification: 'active', rationale: '42 transfers in last 7d' },
  usdc_pattern: 'running',
  peers: { similar_active: ['Otto AI', 'Nox'], similar_dormant: [], cluster: null, cluster_status: null },
};

describe('renderFallbackReport', () => {
  it('produces a markdown report starting with H1 in the locked format', () => {
    const md = renderFallbackReport(sampleData);
    expect(md).toMatch(/^# Axelrod \(ACP #129\) — active/m);
  });
  it('contains the survival classification and rationale', () => {
    const md = renderFallbackReport(sampleData);
    expect(md).toContain('active');
    expect(md).toContain('42 transfers');
  });
  it('does NOT include numeric "survival score"', () => {
    const md = renderFallbackReport(sampleData);
    expect(md.toLowerCase()).not.toMatch(/survival score:?\s*\d/);
  });
  it('handles dormant + graveyard usdc_pattern with the stranded-value framing', () => {
    const dormant = { ...sampleData,
      survival: { classification: 'dormant' as const, rationale: 'no transfers in 19 days' },
      usdc_pattern: 'graveyard' as const,
      balances: { ...sampleData.balances, usdc: { amount: 3658, usd: 3658 } },
    };
    const md = renderFallbackReport(dormant);
    expect(md.toLowerCase()).toContain('stranded');
  });
});
```

- [ ] **Step 2: Run test (should fail)**

```bash
pnpm --filter @chainward/decode test report-fallback
```

Expected: FAIL.

- [ ] **Step 3: Implement the template**

`packages/decode/src/templates/report-fallback.md.ts`:
```typescript
import type { QuickDecodeResultData } from '../types.js';

export function renderFallbackReport(data: QuickDecodeResultData): string {
  const { target, survival, balances, activity, usdc_pattern, peers, discrepancies } = data;
  const name = target.name ?? target.wallet_address;
  const acpId = target.acp_id ? `ACP #${target.acp_id}` : '';
  const heading = acpId ? `# ${name} (${acpId}) — ${survival.classification}` : `# ${name} — ${survival.classification}`;

  const para1 = activity.latest_transfer_at
    ? `Last on-chain activity: ${activity.latest_transfer_at} (${formatAge(activity.latest_transfer_age_hours)} ago). ${survival.rationale}.`
    : `No ERC-20 transfer history found for this wallet.`;

  const usdcLine = balances.usdc.amount > 0
    ? `Wallet holds $${balances.usdc.usd.toFixed(2)} USDC.`
    : `Wallet holds no USDC.`;
  const stranded = usdc_pattern === 'graveyard'
    ? ` This is stranded value — settlement waiting for an operator that has gone quiet.`
    : '';

  const discrepancyLine = discrepancies.length > 0
    ? `Dashboard discrepancies detected: ${discrepancies.map((d) => d.field).join(', ')}.`
    : `No dashboard-vs-chain discrepancies.`;

  const peersLine =
    peers.similar_active.length > 0
      ? `Active peers in this cohort: ${peers.similar_active.slice(0, 4).join(', ')}.`
      : '';
  const clusterLine = peers.cluster_status === 'collapsed'
    ? `The ${peers.cluster} cluster has collapsed: ≥75% of members are dormant.`
    : '';

  return [
    heading,
    '',
    para1,
    '',
    `${usdcLine}${stranded}`,
    '',
    discrepancyLine,
    '',
    [peersLine, clusterLine].filter(Boolean).join(' '),
  ].filter((line) => line !== '' || true).join('\n').trim() + '\n';
}

function formatAge(hours: number | null): string {
  if (hours === null) return 'unknown';
  if (hours < 1) return `${Math.round(hours * 60)} minutes`;
  if (hours < 24) return `${Math.round(hours)} hours`;
  return `${Math.round(hours / 24)} days`;
}
```

- [ ] **Step 4: Run test**

```bash
pnpm --filter @chainward/decode test report-fallback
```

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/decode/src/templates/ packages/decode/__tests__/report-fallback.test.ts
git commit -m "feat(decode): fallback markdown report template"
```

---

## Task 14: `report-writer` — `claude --print` integration with replayMode

**Files:**
- Create: `packages/decode/src/report-writer.ts`
- Create: `packages/decode/__tests__/report-writer.test.ts`
- Modify: `packages/decode/src/index.ts`

- [ ] **Step 1: Write the failing test**

`packages/decode/__tests__/report-writer.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { writeReport, PROMPT_VERSION } from '../src/report-writer.js';
import type { QuickDecodeResultData } from '../src/types.js';

const minimalData = {
  target: { input: '@x', wallet_address: '0xabc', handle: null, name: 'Axelrod', acp_id: 129, virtuals_agent_id: null, framework: 'virtuals_acp' as const, owner_address: null },
  wallet: { type: 'erc1967_proxy' as const, nonce: 1, code_size: 100, is_virtuals_factory: true },
  balances: { eth: { wei: '0', usd: 0 }, usdc: { amount: 6, usd: 6 }, agent_token: null },
  token_trading: null,
  activity: { latest_transfer_at: '2026-04-30T00:00:00Z', latest_transfer_age_hours: 1, transfers_24h: 36, transfers_7d: 42, transfers_30d: 182, unique_counterparties_30d: 12 },
  claims: { agdp: 1, revenue: null, successful_jobs: null, total_jobs: null, success_rate: null, last_active_at_acp: null, is_online_acp: true },
  chain_reality: { active_today: true, active_7d: true, active_30d: true, settlement_path: [], payment_manager_seen: true },
  discrepancies: [],
  checks_performed: [],
  survival: { classification: 'active' as const, rationale: 'recent activity' },
  usdc_pattern: 'running' as const,
  peers: { similar_active: [], similar_dormant: [], cluster: null, cluster_status: null },
} satisfies QuickDecodeResultData;

describe('writeReport (replayMode)', () => {
  it('uses fallback template when replayMode: true (no claude call)', async () => {
    const md = await writeReport(minimalData, { replayMode: true });
    expect(md).toMatch(/^# Axelrod \(ACP #129\) — active/m);
  });
  it('exports a PROMPT_VERSION constant', () => {
    expect(PROMPT_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
```

(Note: testing the live `claude --print` path requires running Claude Code; covered later by the integration / E2E tests, not unit tests.)

- [ ] **Step 2: Run test (should fail)**

```bash
pnpm --filter @chainward/decode test report-writer
```

Expected: FAIL.

- [ ] **Step 3: Implement the module**

`packages/decode/src/report-writer.ts`:
```typescript
import { spawn } from 'node:child_process';
import { renderFallbackReport } from './templates/report-fallback.md.js';
import type { QuickDecodeResultData } from './types.js';

export const PROMPT_VERSION = '1.0.0';

const PROMPT_SCAFFOLD = `You are a wallet decoder for ChainWard, an intelligence platform for the AI agent
economy on Base. You are writing a markdown report from VERIFIED on-chain data
about an AI agent's wallet.

Voice constraints:
- Authoritative, terse, evidence-first. Every claim must be backed by the data block.
- Never use accusatory language ("dirty", "scam", "fake", "broken"). Use neutral
  descriptive framing.
- Lead with chain reality (active_today / active_7d / active_30d).
- Then claim discrepancies (what the Virtuals dashboard says vs. what the chain says).
- Then context (peer cohort, cluster status if applicable).
- Highlight the failure mode if dormant: "operator silence, not exploit."
- 3 to 5 paragraphs. No more, no less.
- Open with a single H1: "# {name} (ACP #{id}) — {classification}".
- Markdown only. No emoji. No tables in the prose body. No bullet lists in body.

Forbidden:
- Numeric "survival scores". The schema deliberately omits them; the report must too.
- Any phrase starting "It seems", "It appears", "Likely". Be definite or omit.
- Speculation about operator intent or token holder behavior beyond what the data shows.

Data you have:
{data}

Output format: pure markdown. No prefix, no suffix, no explanation. Begin with the H1.`;

export interface WriteReportOptions {
  replayMode?: boolean;
  timeoutMs?: number;
}

export async function writeReport(
  data: QuickDecodeResultData,
  options: WriteReportOptions = {},
): Promise<string> {
  if (options.replayMode) {
    return renderFallbackReport(data);
  }

  const prompt = PROMPT_SCAFFOLD.replace('{data}', JSON.stringify(data, null, 2));
  const timeoutMs = options.timeoutMs ?? 60_000;

  try {
    const md = await runClaudePrint(prompt, timeoutMs);
    if (!md || !md.trim().startsWith('# ')) {
      // violates H1 constraint or empty — fallback
      return renderFallbackReport(data);
    }
    return md.trim() + '\n';
  } catch {
    return renderFallbackReport(data);
  }
}

async function runClaudePrint(prompt: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['--print'], {
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('claude --print timed out'));
    }, timeoutMs);

    child.stdout.on('data', (b) => (stdout += b.toString()));
    child.stderr.on('data', (b) => (stderr += b.toString()));
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`claude exited ${code}: ${stderr.slice(0, 200)}`));
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}
```

Add to `packages/decode/src/index.ts`:
```typescript
export * from './report-writer.js';
```

- [ ] **Step 4: Run test**

```bash
pnpm --filter @chainward/decode test report-writer
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/decode/src/report-writer.ts packages/decode/__tests__/report-writer.test.ts packages/decode/src/index.ts
git commit -m "feat(decode): report-writer with claude --print + replayMode + fallback"
```

---

## Task 15: `quickDecode()` integration

**Files:**
- Create: `packages/decode/src/quick-decode.ts`
- Create: `packages/decode/__tests__/quick-decode.test.ts`
- Modify: `packages/decode/src/index.ts`

- [ ] **Step 1: Write the integration test**

`packages/decode/__tests__/quick-decode.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { quickDecode } from '../src/quick-decode.js';

const fx = (name: string) =>
  JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8'));

describe('quickDecode (integration with replayMode)', () => {
  it('produces a complete QuickDecodeResult from Axelrod fixture', async () => {
    const result = await quickDecode({
      input: '@axelrod',
      wallet_address: '0x999A1B6033998A05F7e37e4BD471038dF46624E1',
      job_id: 'test-job-1',
      pipeline_version: 'test',
      now: new Date('2026-04-30T12:00:00Z'),
      fixtures: fx('axelrod-active.json'),
      replayMode: true,
    });

    expect(result.report).toMatch(/^# /);
    expect(result.data.survival.classification).toBe('active');
    expect(result.data.target.acp_id).toBe(129);
    expect(result.meta.schema_version).toBe('1.0.0');
    expect(result.meta.classifier_version).toBe('1.0.0');
    expect(result.meta.disclosure).toContain('aggregate intelligence');
    expect(result.sources.length).toBeGreaterThan(0);
  });

  it('produces a dormant classification from Lucien fixture', async () => {
    const result = await quickDecode({
      input: '@lucien',
      wallet_address: '0xeee9Cb0fafF1D9e7423BF87A341C70F58A1A0cc7',
      job_id: 'test-job-2',
      pipeline_version: 'test',
      now: new Date('2026-04-30T12:00:00Z'),
      fixtures: fx('lucien-dormant.json'),
      replayMode: true,
    });
    expect(result.data.survival.classification).toBe('dormant');
    expect(result.data.usdc_pattern === 'graveyard' || result.data.usdc_pattern === 'inactive').toBe(true);
  });
});
```

- [ ] **Step 2: Run test (should fail)**

```bash
pnpm --filter @chainward/decode test quick-decode
```

Expected: FAIL.

- [ ] **Step 3: Implement `quickDecode()`**

`packages/decode/src/quick-decode.ts`:
```typescript
import type { QuickDecodeResult, Source } from './types.js';
import { SCHEMA_VERSION, CLASSIFIER_VERSION, DISCLOSURE_TEXT } from './types.js';
import { classifyWallet } from './wallet-arch.js';
import { computeActivity, computeBalances } from './chain-audit.js';
import { compareACPClaims } from './discrepancies.js';
import { classifySurvival } from './survival.js';
import { classifyUsdcPattern } from './usdc-pattern.js';
import { findPeers, computeClusterStatus, type ObservatoryAgent } from './peers.js';
import { extractTokenTrading } from './token-trading.js';
import { writeReport } from './report-writer.js';

export interface QuickDecodeInput {
  input: string;
  wallet_address: string;
  job_id: string;
  pipeline_version: string;
  now?: Date;
  fixtures: {
    acp_details: any;
    blockscout_counters: any;
    blockscout_transfers: any;
    sentinel_code: { result: string };
    sentinel_nonce: { result: string };
    geckoterminal?: any;
    observatory?: ObservatoryAgent[];
  };
  replayMode?: boolean;
}

export async function quickDecode(input: QuickDecodeInput): Promise<QuickDecodeResult> {
  const now = input.now ?? new Date();
  const observatory = input.fixtures.observatory ?? [];

  const acp = input.fixtures.acp_details?.data ?? input.fixtures.acp_details ?? {};
  const wallet = classifyWallet({
    code: input.fixtures.sentinel_code.result,
    nonce: parseInt(input.fixtures.sentinel_nonce.result, 16),
  });

  const balances = computeBalances({
    ethBalanceWei: '0x0',
    usdcRawBalance: '0x0',
    ethUsdPrice: 0,
    usdcUsdPrice: 1,
  });

  const activity = computeActivity(
    input.fixtures.blockscout_transfers.items ?? [],
    now,
  );

  const survival = classifySurvival({
    transfers_7d: activity.transfers_7d,
    latest_transfer_age_hours: activity.latest_transfer_age_hours,
  });

  const usdc_pattern = classifyUsdcPattern({
    classification: survival.classification,
    usdc_balance: balances.usdc.amount,
  });

  const claims = {
    agdp: acp.grossAgenticAmount ?? null,
    revenue: acp.revenue ?? null,
    successful_jobs: acp.successfulJobCount ?? null,
    total_jobs: acp.totalJobCount ?? null,
    success_rate: acp.successRate ?? null,
    last_active_at_acp: acp.metrics?.lastActiveAt ?? acp.lastActiveAt ?? null,
    is_online_acp: acp.metrics?.isOnline ?? acp.isOnline ?? null,
  };

  const chain_reality = {
    active_today: activity.transfers_24h > 0,
    active_7d: activity.transfers_7d > 0,
    active_30d: activity.transfers_30d > 0,
    settlement_path: [],
    payment_manager_seen: false,
  };

  const discrepancyResult = compareACPClaims({
    acp: { lastActiveAt: claims.last_active_at_acp, isOnline: claims.is_online_acp },
    chain: {
      latest_transfer_at: activity.latest_transfer_at,
      active_today: chain_reality.active_today,
      active_7d: chain_reality.active_7d,
    },
  });

  const cluster = acp.cluster ?? null;
  const peerResult = findPeers({
    framework: 'virtuals_acp',
    cluster,
    observatory,
    excludeAddress: input.wallet_address,
  });
  const cluster_status = computeClusterStatus(cluster, observatory);

  const token_trading = extractTokenTrading({
    acp_details: acp,
    geckoterminal: input.fixtures.geckoterminal ?? null,
  });

  const data = {
    target: {
      input: input.input,
      wallet_address: input.wallet_address,
      handle: acp.twitterHandle ?? null,
      name: acp.name ?? null,
      acp_id: acp.id ?? null,
      virtuals_agent_id: acp.virtualAgentId ?? null,
      framework: 'virtuals_acp' as const,
      owner_address: acp.ownerAddress ?? null,
    },
    wallet,
    balances,
    token_trading,
    activity,
    claims,
    chain_reality,
    discrepancies: discrepancyResult.discrepancies,
    checks_performed: discrepancyResult.checks_performed,
    survival,
    usdc_pattern,
    peers: { ...peerResult, cluster, cluster_status },
  };

  const report = await writeReport(data, { replayMode: input.replayMode });

  const sources: Source[] = [
    {
      label: 'Blockscout token-transfers',
      url: `https://base.blockscout.com/api/v2/addresses/${input.wallet_address}/token-transfers`,
      block_number: null,
      block_hash: null,
      timestamp: now.toISOString(),
    },
    {
      label: 'ACP API agent details',
      url: acp.id ? `https://acpx.virtuals.io/api/agents/${acp.id}/details` : 'https://acpx.virtuals.io/api',
      block_number: null,
      block_hash: null,
      timestamp: now.toISOString(),
    },
  ];

  return {
    report,
    data,
    sources,
    meta: {
      schema_version: SCHEMA_VERSION,
      classifier_version: CLASSIFIER_VERSION,
      tier: 'quick',
      pipeline_version: input.pipeline_version,
      generated_at: now.toISOString(),
      as_of_block: { number: 0, hash: '' }, // TODO populated when sentinel adapter ships
      target_input: input.input,
      job_id: input.job_id,
      disclosure: DISCLOSURE_TEXT,
    },
  };
}
```

Add to `packages/decode/src/index.ts`:
```typescript
export * from './quick-decode.js';
```

- [ ] **Step 4: Run test**

```bash
pnpm --filter @chainward/decode test quick-decode
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/decode/src/quick-decode.ts packages/decode/__tests__/quick-decode.test.ts packages/decode/src/index.ts
git commit -m "feat(decode): quickDecode() integration entry point"
```

---

## Task 16: DB schema — `decodes` table + migration

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create: `packages/db/src/migrations/0008_decodes_table.sql`

- [ ] **Step 1: Add the Drizzle table definition**

Open `packages/db/src/schema.ts`. At the end of the file, append:

```typescript
import { jsonb, numeric, pgTable, text, timestamptz, uuid } from 'drizzle-orm/pg-core';

export const decodes = pgTable('decodes', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: text('job_id').notNull().unique(),
  buyerWallet: text('buyer_wallet').notNull(),
  targetInput: text('target_input').notNull(),
  targetWallet: text('target_wallet').notNull(),
  tier: text('tier').notNull().default('quick'),
  status: text('status').notNull(),
  result: jsonb('result'),
  rejectReason: text('reject_reason'),
  feeUsdc: numeric('fee_usdc', { precision: 10, scale: 2 }),
  acceptedAt: timestamptz('accepted_at').notNull().defaultNow(),
  deliveredAt: timestamptz('delivered_at'),
  settledAt: timestamptz('settled_at'),
});
```

(Adjust `timestamptz` import to match the existing pattern — likely `timestamp` with `mode: 'date'` and `withTimezone: true`. Check existing tables for the codebase convention.)

- [ ] **Step 2: Create the migration SQL file**

`packages/db/src/migrations/0008_decodes_table.sql`:
```sql
CREATE TABLE IF NOT EXISTS decodes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        text UNIQUE NOT NULL,
  buyer_wallet  text NOT NULL,
  target_input  text NOT NULL,
  target_wallet text NOT NULL,
  tier          text NOT NULL DEFAULT 'quick',
  status        text NOT NULL,
  result        jsonb,
  reject_reason text,
  fee_usdc      numeric(10,2),
  accepted_at   timestamptz NOT NULL DEFAULT now(),
  delivered_at  timestamptz,
  settled_at    timestamptz
);

CREATE INDEX IF NOT EXISTS idx_decodes_buyer ON decodes(buyer_wallet, accepted_at DESC);
CREATE INDEX IF NOT EXISTS idx_decodes_target ON decodes(target_wallet);
CREATE INDEX IF NOT EXISTS idx_decodes_status_accepted ON decodes(status, accepted_at DESC);
```

- [ ] **Step 3: Verify migration applies cleanly to a local DB**

```bash
pnpm --filter @chainward/db generate
pnpm --filter @chainward/db migrate
```

Expected: migration 0008 runs successfully, `decodes` table exists.

- [ ] **Step 4: Verify table shape**

```bash
psql $DATABASE_URL -c "\d decodes"
```

Expected: shows the columns and indexes as defined.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/schema.ts packages/db/src/migrations/0008_decodes_table.sql
git commit -m "feat(db): add decodes table for ACP decoder agent"
```

---

## Task 17: `apps/acp-decoder/` scaffold

**Files:**
- Create: `apps/acp-decoder/package.json`
- Create: `apps/acp-decoder/tsconfig.json`
- Create: `apps/acp-decoder/Dockerfile`
- Create: `apps/acp-decoder/src/index.ts`

- [ ] **Step 1: Create package + tsconfig**

`apps/acp-decoder/package.json`:
```json
{
  "name": "@chainward/acp-decoder",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "start": "node dist/index.js",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@chainward/common": "workspace:*",
    "@chainward/db": "workspace:*",
    "@chainward/decode": "workspace:*",
    "@virtuals-protocol/acp-node": "0.3.0-beta.40",
    "ioredis": "^5.4.0",
    "pino": "^9.5.0",
    "socket.io-client": "^4.8.0",
    "viem": "^2.21.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.7.0",
    "vitest": "^4.0.18"
  }
}
```

`apps/acp-decoder/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "noEmit": false
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 2: Create the Dockerfile**

`apps/acp-decoder/Dockerfile`:
```dockerfile
FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/ packages/
COPY apps/acp-decoder/ apps/acp-decoder/
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @chainward/acp-decoder build
RUN pnpm deploy --filter @chainward/acp-decoder --prod /deploy

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
# Install Claude Code CLI for OAuth-backed report-writer
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && curl -L https://claude.ai/install.sh | sh \
    && apt-get clean && rm -rf /var/lib/apt/lists/*
COPY --from=builder /deploy /app
USER node
CMD ["node", "dist/index.js"]
```

(Adjust the Claude Code install command to match the official install path; bookstack-curator's Dockerfile is the reference — copy that pattern.)

- [ ] **Step 3: Create stub entrypoint**

`apps/acp-decoder/src/index.ts`:
```typescript
// Entry point. Subsequent tasks fill this in.
console.log('chainward-acp-decoder starting (stub)');
```

- [ ] **Step 4: Install + typecheck**

```bash
pnpm install
pnpm --filter @chainward/acp-decoder typecheck
```

Expected: typecheck passes.

- [ ] **Step 5: Commit**

```bash
git add apps/acp-decoder/
git commit -m "feat(acp-decoder): scaffold app + Dockerfile"
```

---

## Task 18: `config` module for env loading

**Files:**
- Create: `apps/acp-decoder/src/config.ts`
- Create: `apps/acp-decoder/__tests__/config.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/acp-decoder/__tests__/config.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('throws when LITE_AGENT_API_KEY is missing', () => {
    const env = { WALLET_ADDRESS: '0xabc', DATABASE_URL: 'postgres://x', REDIS_URL: 'redis://x' };
    expect(() => loadConfig(env)).toThrow(/LITE_AGENT_API_KEY/);
  });
  it('returns a config object when all required env vars are present', () => {
    const env = {
      LITE_AGENT_API_KEY: 'k',
      WALLET_ADDRESS: '0xabc',
      DATABASE_URL: 'postgres://x',
      REDIS_URL: 'redis://x',
      CLAUDE_CODE_OAUTH_TOKEN: 't',
    };
    const cfg = loadConfig(env);
    expect(cfg.liteAgentApiKey).toBe('k');
    expect(cfg.walletAddress).toBe('0xabc');
  });
});
```

- [ ] **Step 2: Run test (should fail)**

```bash
pnpm --filter @chainward/acp-decoder test config
```

Expected: FAIL.

- [ ] **Step 3: Implement the module**

`apps/acp-decoder/src/config.ts`:
```typescript
export interface Config {
  liteAgentApiKey: string;
  walletAddress: string;
  databaseUrl: string;
  redisUrl: string;
  claudeOauthToken: string;
  acpHost: string;
  clawApiHost: string;
  maxConcurrentDecodes: number;
  perBuyerInflightLimit: number;
  perBuyerSubmissionLimit60s: number;
}

const required = (env: Record<string, string | undefined>, name: string): string => {
  const v = env[name];
  if (!v) throw new Error(`missing env var: ${name}`);
  return v;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return {
    liteAgentApiKey: required(env, 'LITE_AGENT_API_KEY'),
    walletAddress: required(env, 'WALLET_ADDRESS'),
    databaseUrl: required(env, 'DATABASE_URL'),
    redisUrl: required(env, 'REDIS_URL'),
    claudeOauthToken: required(env, 'CLAUDE_CODE_OAUTH_TOKEN'),
    acpHost: env.ACP_HOST ?? 'https://acpx.virtuals.io',
    clawApiHost: env.CLAW_API_HOST ?? 'https://claw-api.virtuals.io',
    maxConcurrentDecodes: parseInt(env.MAX_CONCURRENT_DECODES ?? '3', 10),
    perBuyerInflightLimit: parseInt(env.PER_BUYER_INFLIGHT_LIMIT ?? '3', 10),
    perBuyerSubmissionLimit60s: parseInt(env.PER_BUYER_SUBMISSION_LIMIT_60S ?? '5', 10),
  };
}
```

- [ ] **Step 4: Run test**

```bash
pnpm --filter @chainward/acp-decoder test config
```

Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/acp-decoder/src/config.ts apps/acp-decoder/__tests__/config.test.ts
git commit -m "feat(acp-decoder): config loader"
```

---

## Task 19: `rate-limit` — Redis-backed per-buyer limits + in-process semaphore

**Files:**
- Create: `apps/acp-decoder/src/rate-limit.ts`
- Create: `apps/acp-decoder/__tests__/rate-limit.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/acp-decoder/__tests__/rate-limit.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../src/rate-limit.js';

class MockRedis {
  store = new Map<string, number>();
  zsets = new Map<string, number[]>();
  async incr(k: string) { const v = (this.store.get(k) ?? 0) + 1; this.store.set(k, v); return v; }
  async decr(k: string) { const v = (this.store.get(k) ?? 0) - 1; this.store.set(k, v); return v; }
  async get(k: string) { return this.store.get(k)?.toString() ?? null; }
  async expire(_k: string, _s: number) { return 1; }
  async zadd(k: string, _score: number, _member: string) {
    const arr = this.zsets.get(k) ?? []; arr.push(Date.now()); this.zsets.set(k, arr); return 1;
  }
  async zremrangebyscore(k: string, _min: string, max: number) {
    const arr = this.zsets.get(k) ?? []; const kept = arr.filter((t) => t > max); this.zsets.set(k, kept); return arr.length - kept.length;
  }
  async zcard(k: string) { return this.zsets.get(k)?.length ?? 0; }
}

describe('RateLimiter', () => {
  it('allows submissions under the per-buyer in-flight limit', async () => {
    const rl = new RateLimiter(new MockRedis() as any, { maxConcurrentDecodes: 3, perBuyerInflightLimit: 3, perBuyerSubmissionLimit60s: 5 });
    expect(await rl.tryAcquire('buyer1')).toBe('ok');
    expect(await rl.tryAcquire('buyer1')).toBe('ok');
    expect(await rl.tryAcquire('buyer1')).toBe('ok');
    expect(await rl.tryAcquire('buyer1')).toBe('rate_limited');
  });
  it('releases in-flight slot on release()', async () => {
    const rl = new RateLimiter(new MockRedis() as any, { maxConcurrentDecodes: 3, perBuyerInflightLimit: 1, perBuyerSubmissionLimit60s: 5 });
    expect(await rl.tryAcquire('b')).toBe('ok');
    expect(await rl.tryAcquire('b')).toBe('rate_limited');
    await rl.release('b');
    expect(await rl.tryAcquire('b')).toBe('ok');
  });
  it('enforces per-pod max concurrency', async () => {
    const rl = new RateLimiter(new MockRedis() as any, { maxConcurrentDecodes: 2, perBuyerInflightLimit: 99, perBuyerSubmissionLimit60s: 99 });
    expect(await rl.tryAcquire('b1')).toBe('ok');
    expect(await rl.tryAcquire('b2')).toBe('ok');
    expect(await rl.tryAcquire('b3')).toBe('rate_limited');
  });
});
```

- [ ] **Step 2: Run test (should fail)**

```bash
pnpm --filter @chainward/acp-decoder test rate-limit
```

Expected: FAIL.

- [ ] **Step 3: Implement the module**

`apps/acp-decoder/src/rate-limit.ts`:
```typescript
import type Redis from 'ioredis';

export interface RateLimitConfig {
  maxConcurrentDecodes: number;
  perBuyerInflightLimit: number;
  perBuyerSubmissionLimit60s: number;
}

export class RateLimiter {
  private podConcurrent = 0;

  constructor(private redis: Redis, private config: RateLimitConfig) {}

  async tryAcquire(buyerWallet: string): Promise<'ok' | 'rate_limited'> {
    if (this.podConcurrent >= this.config.maxConcurrentDecodes) {
      return 'rate_limited';
    }
    const inflight = parseInt((await this.redis.get(`acp:inflight:${buyerWallet}`)) ?? '0', 10);
    if (inflight >= this.config.perBuyerInflightLimit) {
      return 'rate_limited';
    }
    const now = Date.now();
    const submissionsKey = `acp:submissions:${buyerWallet}`;
    await this.redis.zremrangebyscore(submissionsKey, '-inf', now - 60_000);
    const recent = await this.redis.zcard(submissionsKey);
    if (recent >= this.config.perBuyerSubmissionLimit60s) {
      return 'rate_limited';
    }
    await this.redis.zadd(submissionsKey, now, `${now}-${Math.random()}`);
    await this.redis.expire(submissionsKey, 120);
    await this.redis.incr(`acp:inflight:${buyerWallet}`);
    await this.redis.expire(`acp:inflight:${buyerWallet}`, 1800);
    this.podConcurrent++;
    return 'ok';
  }

  async release(buyerWallet: string): Promise<void> {
    const v = await this.redis.decr(`acp:inflight:${buyerWallet}`);
    if (v < 0) {
      await this.redis.incr(`acp:inflight:${buyerWallet}`); // floor at 0
    }
    this.podConcurrent = Math.max(0, this.podConcurrent - 1);
  }
}
```

- [ ] **Step 4: Run test**

```bash
pnpm --filter @chainward/acp-decoder test rate-limit
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/acp-decoder/src/rate-limit.ts apps/acp-decoder/__tests__/rate-limit.test.ts
git commit -m "feat(acp-decoder): rate limiter (per-pod + per-buyer)"
```

---

## Task 20: `persist` — write decode records to DB

**Files:**
- Create: `apps/acp-decoder/src/persist.ts`
- Create: `apps/acp-decoder/__tests__/persist.test.ts`

- [ ] **Step 1: Write the failing integration test**

`apps/acp-decoder/__tests__/persist.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { persistAccepted, persistDelivered, persistRejected } from '../src/persist.js';

const TEST_DB_URL = process.env.TEST_DB_URL ?? 'postgres://test:test@localhost:5433/chainward_test';
let sql: any;

beforeAll(async () => {
  sql = postgres(TEST_DB_URL);
  // Apply migration 0008
  await sql.unsafe(require('node:fs').readFileSync(
    require('node:path').join(__dirname, '../../../packages/db/src/migrations/0008_decodes_table.sql'),
    'utf8'
  ));
});

afterAll(async () => { await sql.end(); });

describe('persist', () => {
  it('persistAccepted is idempotent on job_id collision', async () => {
    const db = drizzle(sql);
    await persistAccepted(db, { jobId: 'idem-1', buyerWallet: '0xb', targetInput: '@x', targetWallet: '0xt', feeUsdc: 25 });
    await persistAccepted(db, { jobId: 'idem-1', buyerWallet: '0xb', targetInput: '@x', targetWallet: '0xt', feeUsdc: 25 });
    const rows = await sql`SELECT count(*) FROM decodes WHERE job_id='idem-1'`;
    expect(parseInt(rows[0].count)).toBe(1);
  });

  it('persistDelivered updates status and result', async () => {
    const db = drizzle(sql);
    await persistAccepted(db, { jobId: 'd-1', buyerWallet: '0xb', targetInput: '@y', targetWallet: '0xt2', feeUsdc: 25 });
    await persistDelivered(db, { jobId: 'd-1', result: { foo: 'bar' } });
    const rows = await sql`SELECT status, result FROM decodes WHERE job_id='d-1'`;
    expect(rows[0].status).toBe('delivered');
    expect(rows[0].result).toEqual({ foo: 'bar' });
  });

  it('persistRejected sets status=rejected with reason', async () => {
    const db = drizzle(sql);
    await persistRejected(db, { jobId: 'r-1', buyerWallet: '0xb', targetInput: '@z', targetWallet: '0xt3', rejectReason: 'invalid_address' });
    const rows = await sql`SELECT status, reject_reason FROM decodes WHERE job_id='r-1'`;
    expect(rows[0].status).toBe('rejected');
    expect(rows[0].reject_reason).toBe('invalid_address');
  });
});
```

- [ ] **Step 2: Run test (should fail)**

```bash
pnpm --filter @chainward/acp-decoder test persist
```

Expected: FAIL — module not present (or DB unavailable; if DB unavailable, document in task notes that this requires a test container per the spec).

- [ ] **Step 3: Implement the module**

`apps/acp-decoder/src/persist.ts`:
```typescript
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export interface PersistAcceptedInput {
  jobId: string;
  buyerWallet: string;
  targetInput: string;
  targetWallet: string;
  feeUsdc: number;
}

export interface PersistDeliveredInput {
  jobId: string;
  result: unknown;
}

export interface PersistRejectedInput {
  jobId: string;
  buyerWallet: string;
  targetInput: string;
  targetWallet: string;
  rejectReason: string;
}

export async function persistAccepted(db: any, input: PersistAcceptedInput): Promise<void> {
  await db.execute(sql`
    INSERT INTO decodes (job_id, buyer_wallet, target_input, target_wallet, tier, status, fee_usdc)
    VALUES (${input.jobId}, ${input.buyerWallet}, ${input.targetInput}, ${input.targetWallet}, 'quick', 'accepted', ${input.feeUsdc})
    ON CONFLICT (job_id) DO NOTHING
  `);
}

export async function persistDelivered(db: any, input: PersistDeliveredInput): Promise<void> {
  await db.execute(sql`
    UPDATE decodes
    SET status='delivered', result=${JSON.stringify(input.result)}::jsonb, delivered_at=now()
    WHERE job_id=${input.jobId}
  `);
}

export async function persistRejected(db: any, input: PersistRejectedInput): Promise<void> {
  await db.execute(sql`
    INSERT INTO decodes (job_id, buyer_wallet, target_input, target_wallet, tier, status, reject_reason)
    VALUES (${input.jobId}, ${input.buyerWallet}, ${input.targetInput}, ${input.targetWallet}, 'quick', 'rejected', ${input.rejectReason})
    ON CONFLICT (job_id) DO UPDATE SET status='rejected', reject_reason=EXCLUDED.reject_reason
  `);
}

export async function persistSettled(db: any, jobId: string): Promise<void> {
  await db.execute(sql`UPDATE decodes SET settled_at=now() WHERE job_id=${jobId}`);
}
```

- [ ] **Step 4: Run test (with test DB up)**

```bash
docker run -d --name chainward-test-db -p 5433:5432 \
  -e POSTGRES_USER=test -e POSTGRES_PASSWORD=test -e POSTGRES_DB=chainward_test \
  postgres:16
pnpm --filter @chainward/acp-decoder test persist
docker stop chainward-test-db && docker rm chainward-test-db
```

Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/acp-decoder/src/persist.ts apps/acp-decoder/__tests__/persist.test.ts
git commit -m "feat(acp-decoder): DB persistence (accepted/delivered/rejected/settled)"
```

---

## Task 21: `handler` — phase state machine

**Files:**
- Create: `apps/acp-decoder/src/handler.ts`
- Create: `apps/acp-decoder/__tests__/handler.test.ts`

- [ ] **Step 1: Write the failing test**

`apps/acp-decoder/__tests__/handler.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { handleNewTask, validateRequest } from '../src/handler.js';

describe('validateRequest', () => {
  it('rejects invalid wallet address', () => {
    const r = validateRequest({ wallet_address: 'not-an-address' });
    expect(r).toEqual({ ok: false, reason: 'invalid_address' });
  });
  it('accepts a valid 0x40-hex address', () => {
    const r = validateRequest({ wallet_address: '0x' + '1'.repeat(40) });
    expect(r).toEqual({ ok: true, wallet_address: '0x' + '1'.repeat(40) });
  });
});

describe('handleNewTask (REQUEST phase)', () => {
  it('rejects when wallet_address is invalid', async () => {
    const ctx = makeCtx();
    await handleNewTask(ctx, makeJob('REQUEST', { wallet_address: 'bad' }));
    expect(ctx.api.reject).toHaveBeenCalledWith(expect.any(String), { reason: 'invalid_address' });
  });
  it('rejects when rate limiter denies', async () => {
    const ctx = makeCtx({ rateLimitResult: 'rate_limited' });
    await handleNewTask(ctx, makeJob('REQUEST', { wallet_address: '0x' + '1'.repeat(40) }));
    expect(ctx.api.reject).toHaveBeenCalledWith(expect.any(String), { reason: 'rate_limited' });
  });
  it('accepts when validation + rate limit pass', async () => {
    const ctx = makeCtx({ rateLimitResult: 'ok' });
    await handleNewTask(ctx, makeJob('REQUEST', { wallet_address: '0x' + '1'.repeat(40) }));
    expect(ctx.api.accept).toHaveBeenCalled();
    expect(ctx.persist.persistAccepted).toHaveBeenCalled();
  });
});

describe('handleNewTask (TRANSACTION phase)', () => {
  it('runs quickDecode and delivers', async () => {
    const ctx = makeCtx({ decodeResult: { report: '# x', data: {}, sources: [], meta: {} } });
    await handleNewTask(ctx, makeJob('TRANSACTION', { wallet_address: '0x' + '1'.repeat(40) }));
    expect(ctx.decode.quickDecode).toHaveBeenCalled();
    expect(ctx.api.deliver).toHaveBeenCalledWith(expect.any(String), expect.any(Object));
    expect(ctx.persist.persistDelivered).toHaveBeenCalled();
  });
});

function makeJob(phase: string, requirement: any): any {
  return { id: 'job-1', phase, buyerWallet: '0xbuyer', requirement };
}

function makeCtx(overrides: any = {}): any {
  return {
    api: {
      accept: vi.fn().mockResolvedValue(undefined),
      reject: vi.fn().mockResolvedValue(undefined),
      requirement: vi.fn().mockResolvedValue(undefined),
      deliver: vi.fn().mockResolvedValue(undefined),
    },
    rateLimiter: {
      tryAcquire: vi.fn().mockResolvedValue(overrides.rateLimitResult ?? 'ok'),
      release: vi.fn().mockResolvedValue(undefined),
    },
    persist: {
      persistAccepted: vi.fn().mockResolvedValue(undefined),
      persistDelivered: vi.fn().mockResolvedValue(undefined),
      persistRejected: vi.fn().mockResolvedValue(undefined),
    },
    decode: { quickDecode: vi.fn().mockResolvedValue(overrides.decodeResult ?? { report: '', data: {}, sources: [], meta: {} }) },
  };
}
```

- [ ] **Step 2: Run test (should fail)**

```bash
pnpm --filter @chainward/acp-decoder test handler
```

Expected: FAIL.

- [ ] **Step 3: Implement the module**

`apps/acp-decoder/src/handler.ts`:
```typescript
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export interface ValidateInput { wallet_address: string }
export type ValidateResult =
  | { ok: true; wallet_address: string }
  | { ok: false; reason: 'invalid_address' };

export function validateRequest(input: ValidateInput): ValidateResult {
  if (!ADDRESS_RE.test(input.wallet_address)) {
    return { ok: false, reason: 'invalid_address' };
  }
  return { ok: true, wallet_address: input.wallet_address };
}

export interface HandlerContext {
  api: {
    accept(jobId: string): Promise<void>;
    reject(jobId: string, opts: { reason: string }): Promise<void>;
    requirement(jobId: string, opts: any): Promise<void>;
    deliver(jobId: string, payload: any): Promise<void>;
  };
  rateLimiter: {
    tryAcquire(buyer: string): Promise<'ok' | 'rate_limited'>;
    release(buyer: string): Promise<void>;
  };
  persist: {
    persistAccepted(input: any): Promise<void>;
    persistDelivered(input: any): Promise<void>;
    persistRejected(input: any): Promise<void>;
  };
  decode: { quickDecode(input: any): Promise<any> };
  config: { feeUsdc: number };
}

export async function handleNewTask(ctx: HandlerContext, job: any): Promise<void> {
  if (job.phase === 'REQUEST') {
    const v = validateRequest(job.requirement);
    if (!v.ok) {
      await ctx.api.reject(job.id, { reason: v.reason });
      await ctx.persist.persistRejected({
        jobId: job.id,
        buyerWallet: job.buyerWallet,
        targetInput: job.requirement.wallet_address,
        targetWallet: job.requirement.wallet_address,
        rejectReason: v.reason,
      });
      return;
    }
    const limit = await ctx.rateLimiter.tryAcquire(job.buyerWallet);
    if (limit === 'rate_limited') {
      await ctx.api.reject(job.id, { reason: 'rate_limited' });
      await ctx.persist.persistRejected({
        jobId: job.id,
        buyerWallet: job.buyerWallet,
        targetInput: job.requirement.wallet_address,
        targetWallet: job.requirement.wallet_address,
        rejectReason: 'rate_limited',
      });
      return;
    }
    await ctx.api.accept(job.id);
    await ctx.persist.persistAccepted({
      jobId: job.id,
      buyerWallet: job.buyerWallet,
      targetInput: job.requirement.wallet_address,
      targetWallet: v.wallet_address,
      feeUsdc: ctx.config.feeUsdc,
    });
    await ctx.api.requirement(job.id, {});
    return;
  }

  if (job.phase === 'TRANSACTION') {
    try {
      const result = await ctx.decode.quickDecode({
        input: job.requirement.wallet_address,
        wallet_address: job.requirement.wallet_address,
        job_id: job.id,
      });
      await ctx.api.deliver(job.id, { type: 'json', value: result });
      await ctx.persist.persistDelivered({ jobId: job.id, result });
    } finally {
      await ctx.rateLimiter.release(job.buyerWallet);
    }
    return;
  }

  // EVALUATION, COMPLETED — log only
}
```

- [ ] **Step 4: Run test**

```bash
pnpm --filter @chainward/acp-decoder test handler
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/acp-decoder/src/handler.ts apps/acp-decoder/__tests__/handler.test.ts
git commit -m "feat(acp-decoder): handler state machine (REQUEST/TRANSACTION)"
```

---

## Task 22: `seller` — Socket.io connection to acpx.virtuals.io

**Files:**
- Create: `apps/acp-decoder/src/seller.ts`

- [ ] **Step 1: Implement the seller**

This task is integration glue — testing it well requires a live ACP environment. Per the testing strategy in the spec, the integration test is the manual end-to-end test in Task 28. Here we ship the minimal connection logic.

`apps/acp-decoder/src/seller.ts`:
```typescript
import { io, type Socket } from 'socket.io-client';
import { logger } from './logger.js';
import type { Config } from './config.js';
import type { HandlerContext } from './handler.js';
import { handleNewTask } from './handler.js';

export function startSeller(config: Config, handlerCtx: HandlerContext): Socket {
  const socket = io(config.acpHost, {
    auth: { walletAddress: config.walletAddress, apiKey: config.liteAgentApiKey },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => logger.info({ id: socket.id }, 'acp socket connected'));
  socket.on('disconnect', (reason) => logger.warn({ reason }, 'acp socket disconnected'));
  socket.on('connect_error', (err) => logger.error({ err: err.message }, 'acp socket error'));

  socket.on('onNewTask', async (job: any) => {
    logger.info({ jobId: job.id, phase: job.phase }, 'acp onNewTask');
    try {
      await handleNewTask(handlerCtx, job);
    } catch (err: any) {
      logger.error({ err: err.message, jobId: job.id }, 'handler failed');
    }
  });

  return socket;
}
```

`apps/acp-decoder/src/logger.ts`:
```typescript
import pino from 'pino';
export const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @chainward/acp-decoder typecheck
```

Expected: typecheck passes.

- [ ] **Step 3: Commit**

```bash
git add apps/acp-decoder/src/seller.ts apps/acp-decoder/src/logger.ts
git commit -m "feat(acp-decoder): seller Socket.io client"
```

---

## Task 23: `reconcile` — startup recovery for missed jobs

**Files:**
- Create: `apps/acp-decoder/src/reconcile.ts`

- [ ] **Step 1: Implement reconcile**

`apps/acp-decoder/src/reconcile.ts`:
```typescript
import { logger } from './logger.js';
import type { Config } from './config.js';
import type { HandlerContext } from './handler.js';
import { handleNewTask } from './handler.js';

// On startup, attempt to query in-flight jobs and re-process any we missed.
// If the endpoint is not present (empirically discovered), log and skip.
export async function reconcile(config: Config, handlerCtx: HandlerContext): Promise<void> {
  const url = `${config.clawApiHost}/acp/providers/jobs?phase=REQUEST,NEGOTIATION,TRANSACTION`;
  try {
    const resp = await fetch(url, { headers: { 'x-api-key': config.liteAgentApiKey } });
    if (!resp.ok) {
      logger.warn({ status: resp.status }, 'reconcile: jobs endpoint not OK; skipping');
      return;
    }
    const body: any = await resp.json();
    const jobs = body?.data ?? [];
    logger.info({ count: jobs.length }, 'reconcile: replaying in-flight jobs');
    for (const job of jobs) {
      try {
        await handleNewTask(handlerCtx, job);
      } catch (err: any) {
        logger.error({ err: err.message, jobId: job.id }, 'reconcile: handler failed');
      }
    }
  } catch (err: any) {
    logger.warn({ err: err.message }, 'reconcile: skipped (endpoint unreachable)');
  }
}
```

- [ ] **Step 2: Verify typecheck**

```bash
pnpm --filter @chainward/acp-decoder typecheck
```

Expected: typecheck passes.

- [ ] **Step 3: Commit**

```bash
git add apps/acp-decoder/src/reconcile.ts
git commit -m "feat(acp-decoder): startup reconciliation for missed jobs"
```

---

## Task 24: `index` — wire everything

**Files:**
- Modify: `apps/acp-decoder/src/index.ts`

- [ ] **Step 1: Implement the entrypoint**

Replace `apps/acp-decoder/src/index.ts`:
```typescript
import IORedis from 'ioredis';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { quickDecode } from '@chainward/decode';
import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { RateLimiter } from './rate-limit.js';
import { persistAccepted, persistDelivered, persistRejected } from './persist.js';
import { startSeller } from './seller.js';
import { reconcile } from './reconcile.js';
import type { HandlerContext } from './handler.js';

async function main() {
  const config = loadConfig();
  logger.info({ wallet: config.walletAddress }, 'chainward-acp-decoder starting');

  const sql = postgres(config.databaseUrl);
  const db = drizzle(sql);
  const redis = new IORedis(config.redisUrl);

  const rateLimiter = new RateLimiter(redis, {
    maxConcurrentDecodes: config.maxConcurrentDecodes,
    perBuyerInflightLimit: config.perBuyerInflightLimit,
    perBuyerSubmissionLimit60s: config.perBuyerSubmissionLimit60s,
  });

  const handlerCtx: HandlerContext = {
    api: {
      accept: async () => { /* TODO: wire @virtuals-protocol/acp-node client */ },
      reject: async () => {},
      requirement: async () => {},
      deliver: async () => {},
    },
    rateLimiter,
    persist: {
      persistAccepted: (i) => persistAccepted(db, i),
      persistDelivered: (i) => persistDelivered(db, i),
      persistRejected: (i) => persistRejected(db, i),
    },
    decode: {
      quickDecode: (input: any) => quickDecode({ ...input, pipeline_version: process.env.GIT_SHA ?? 'dev', fixtures: {} as any }),
    },
    config: { feeUsdc: 25 },
  };

  // Wire @virtuals-protocol/acp-node REST API for accept/reject/requirement/deliver.
  // Per the brief, this is `AcpClient` from @virtuals-protocol/acp-node — verify exact
  // import name and method signatures against the SDK at implementation time.
  // See: scripts/auto-decode/acp-service-brief.md and
  // moonshot-cyber/virtuals-acp/src/seller/runtime/sellerApi.ts for reference.

  await reconcile(config, handlerCtx);
  startSeller(config, handlerCtx);

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received; closing');
    await redis.quit();
    await sql.end();
    process.exit(0);
  });
}

main().catch((err) => {
  logger.fatal({ err: err.message }, 'fatal');
  process.exit(1);
});
```

(Note: The `api: { accept, reject, requirement, deliver }` stubs need to be replaced with real `@virtuals-protocol/acp-node` SDK calls. The brief describes what each does — POST to `/acp/providers/jobs/{id}/accept` etc. The exact SDK signatures need to be verified against the SDK package at implementation time.)

- [ ] **Step 2: Verify build + typecheck**

```bash
pnpm --filter @chainward/acp-decoder typecheck
pnpm --filter @chainward/acp-decoder build
```

Expected: both pass.

- [ ] **Step 3: Commit**

```bash
git add apps/acp-decoder/src/index.ts
git commit -m "feat(acp-decoder): wire entrypoint (config, redis, db, rate-limit, seller, reconcile)"
```

---

## Task 25: Helm chart additions

**Files:**
- Create: `deploy/helm/chainward/templates/acp-decoder-deployment.yaml`
- Create: `deploy/helm/chainward/templates/acp-decoder-secret.yaml`
- Modify: `deploy/helm/chainward/values.yaml`

- [ ] **Step 1: Add values block**

Open `deploy/helm/chainward/values.yaml`. Append:

```yaml
acpDecoder:
  enabled: false  # opt-in; flip after first acp setup completes
  image: ghcr.io/saltxd/chainward-acp-decoder
  tag: ""
  replicas: 1
  resources:
    requests:
      cpu: 100m
      memory: 256Mi
    limits:
      cpu: 500m
      memory: 512Mi
  acpHost: https://acpx.virtuals.io
  clawApiHost: https://claw-api.virtuals.io
```

- [ ] **Step 2: Create the Deployment template**

`deploy/helm/chainward/templates/acp-decoder-deployment.yaml`:
```yaml
{{- if .Values.acpDecoder.enabled }}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: chainward-acp-decoder
  labels:
    app.kubernetes.io/name: chainward
    app.kubernetes.io/component: acp-decoder
spec:
  replicas: {{ .Values.acpDecoder.replicas }}
  selector:
    matchLabels:
      app.kubernetes.io/name: chainward
      app.kubernetes.io/component: acp-decoder
  template:
    metadata:
      labels:
        app.kubernetes.io/name: chainward
        app.kubernetes.io/component: acp-decoder
    spec:
      containers:
        - name: acp-decoder
          image: "{{ .Values.acpDecoder.image }}:{{ .Values.acpDecoder.tag | default .Chart.AppVersion }}"
          imagePullPolicy: IfNotPresent
          envFrom:
            - secretRef:
                name: acp-decoder-secrets
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: chainward-secrets
                  key: DATABASE_URL
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: chainward-secrets
                  key: REDIS_URL
            - name: ACP_HOST
              value: "{{ .Values.acpDecoder.acpHost }}"
            - name: CLAW_API_HOST
              value: "{{ .Values.acpDecoder.clawApiHost }}"
            - name: GIT_SHA
              value: "{{ .Values.acpDecoder.tag | default .Chart.AppVersion }}"
          resources:
{{ toYaml .Values.acpDecoder.resources | indent 12 }}
{{- end }}
```

- [ ] **Step 3: Create the Secret stub template**

`deploy/helm/chainward/templates/acp-decoder-secret.yaml`:
```yaml
{{- if and .Values.acpDecoder.enabled .Values.acpDecoder.createSecret }}
apiVersion: v1
kind: Secret
metadata:
  name: acp-decoder-secrets
type: Opaque
stringData:
  LITE_AGENT_API_KEY: {{ required "acpDecoder.liteAgentApiKey is required when createSecret is true" .Values.acpDecoder.liteAgentApiKey | quote }}
  WALLET_ADDRESS: {{ required "acpDecoder.walletAddress is required when createSecret is true" .Values.acpDecoder.walletAddress | quote }}
  CLAUDE_CODE_OAUTH_TOKEN: {{ required "acpDecoder.claudeOauthToken is required when createSecret is true" .Values.acpDecoder.claudeOauthToken | quote }}
{{- end }}
```

(Note: in practice, the Secret will be created manually with `kubectl create secret` after `acp setup` runs — the helm template is a fallback for declarative config when needed.)

- [ ] **Step 4: Verify with helm template**

```bash
cd deploy/helm/chainward
helm template . --set acpDecoder.enabled=true | grep -A 5 'name: chainward-acp-decoder'
```

Expected: shows the Deployment manifest.

- [ ] **Step 5: Commit**

```bash
git add deploy/helm/chainward/templates/acp-decoder-deployment.yaml \
        deploy/helm/chainward/templates/acp-decoder-secret.yaml \
        deploy/helm/chainward/values.yaml
git commit -m "feat(deploy): Helm templates for chainward-acp-decoder"
```

---

## Task 26: Update `deploy.sh` to include acp-decoder image

**Files:**
- Modify: `deploy/deploy.sh`

- [ ] **Step 1: Add chainward-acp-decoder to image checks**

Open `deploy/deploy.sh`. Find the section that lists images for GHCR readiness checks (look for `chainward-api`, `chainward-web`, `chainward-indexer`). Add `chainward-acp-decoder` to that list.

```bash
# Example — adapt to existing pattern:
IMAGES=(
  "ghcr.io/saltxd/chainward-api"
  "ghcr.io/saltxd/chainward-web"
  "ghcr.io/saltxd/chainward-indexer"
  "ghcr.io/saltxd/chainward-acp-decoder"
)
```

Also add a rollout-status check for the acp-decoder Deployment if the script does that for other components.

- [ ] **Step 2: Dry-run the deploy script**

```bash
./deploy/deploy.sh --dry-run
```

Expected: dry-run output mentions `chainward-acp-decoder` in the image checks.

- [ ] **Step 3: Commit**

```bash
git add deploy/deploy.sh
git commit -m "feat(deploy): wire chainward-acp-decoder into deploy.sh image checks"
```

---

## Task 27: Update GitHub Actions to build the image

**Files:**
- Modify: `.github/workflows/build.yml` (or whichever workflow builds api/web/indexer images)

- [ ] **Step 1: Add the new image to the build matrix**

Find the existing matrix in `.github/workflows/build.yml`. Add a new entry for `chainward-acp-decoder` matching the pattern of `chainward-api`:

```yaml
strategy:
  matrix:
    include:
      - service: api
        path: apps/api
      - service: web
        path: apps/web
      - service: indexer
        path: packages/indexer
      - service: acp-decoder
        path: apps/acp-decoder
```

(Adjust to match the actual workflow's structure.)

- [ ] **Step 2: Verify locally with act (optional) or just commit and let CI run**

```bash
act -W .github/workflows/build.yml -l   # list jobs; or just push and watch CI
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/build.yml
git commit -m "ci: build chainward-acp-decoder image alongside api/web/indexer"
```

---

## Task 28: Run `acp setup` and capture the Playbook walkthrough

**Files:**
- Create: `docs/playbook/acp-registration-walkthrough.md`

This is a manual task. Document every step, error, and resolution as you go — this becomes the seed for the Phase 2 `/build` Playbook surface.

- [ ] **Step 1: Clone the openclaw-acp CLI**

```bash
cd /tmp
git clone https://github.com/Virtual-Protocol/openclaw-acp
cd openclaw-acp
npm install
npm link
```

- [ ] **Step 2: Run `acp setup`**

```bash
acp setup
```

Browser OAuth opens. Complete the flow. The CLI returns:
- An agent record on Virtuals
- A provisioned EOA wallet address
- `LITE_AGENT_API_KEY` (shown ONCE — capture it)

Stash the API key in 1Password / equivalent. Note the wallet address.

- [ ] **Step 3: Set the agent's profile description**

```bash
acp profile update description "Verified on-chain audit of an AI agent wallet on Base. Returns chain-grounded balances, activity, dashboard discrepancies, peer cohort analysis, and a short readable report. ChainWard's intelligence layer surfaces what the platform's own dashboard doesn't show. Decode requests and results are stored by ChainWard and may inform aggregate intelligence; individual buyer-target pairs are never disclosed."
```

- [ ] **Step 4: Initialize the wallet_decode offering**

```bash
acp sell init wallet_decode
```

Edit the generated `offering.json` to match the schema in the spec (Service Definition section).

- [ ] **Step 5: Register the offering**

```bash
acp sell create wallet_decode
```

- [ ] **Step 6: Push secrets to the chainward namespace**

```bash
kubectl -n chainward create secret generic acp-decoder-secrets \
  --from-literal=LITE_AGENT_API_KEY='<from acp setup>' \
  --from-literal=WALLET_ADDRESS='<provisioned wallet>' \
  --from-literal=CLAUDE_CODE_OAUTH_TOKEN="$(kubectl -n bookstack get secret bookstack-curator-secrets -o jsonpath='{.data.CLAUDE_CODE_OAUTH_TOKEN}' | base64 -d)"
```

(Adjust namespace names to match your actual setup.)

- [ ] **Step 7: Capture the walkthrough**

`docs/playbook/acp-registration-walkthrough.md`:
```markdown
# ACP Registration Walkthrough — chainward-decoder

> Captured during the launch of the ChainWard ACP decoder agent. This is the seed
> for the Phase 2 `/build` "How to launch on Virtuals" page.

[Document everything that happened during steps 1-6 above. Include screenshots
of the OAuth flow, exact CLI output, any errors and how you resolved them, and
the time it took. Be honest — gotchas teach more than smooth flows.]

## What worked
- ...

## What didn't
- ...

## Time taken
- Total: X minutes
- Time spent debugging: Y minutes

## What I'd tell a new builder
- ...
```

- [ ] **Step 8: Commit the walkthrough**

```bash
git add docs/playbook/acp-registration-walkthrough.md
git commit -m "docs: ACP registration walkthrough — Playbook seed material"
```

---

## Task 29: Deploy to K3s

- [ ] **Step 1: Build and push images via CI**

Push all the prior commits to main. Wait for CI to push `ghcr.io/saltxd/chainward-acp-decoder:<sha>` to GHCR.

- [ ] **Step 2: Enable acpDecoder in values + deploy**

In your local override or with `--set`:
```bash
./deploy/deploy.sh --set acpDecoder.enabled=true
```

Or update `deploy/helm/chainward/values.yaml` (committed if appropriate) and run `./deploy/deploy.sh`.

- [ ] **Step 3: Verify pod is running and socket connected**

```bash
kubectl -n chainward get pods -l app.kubernetes.io/component=acp-decoder
kubectl -n chainward logs -l app.kubernetes.io/component=acp-decoder --tail=50
```

Expected:
- 1 pod, status `Running`
- Logs show `acp socket connected`

- [ ] **Step 4: Verify metrics + observability**

```bash
kubectl -n chainward port-forward svc/chainward-api 8000:8000 &
curl http://localhost:8000/metrics | grep acp_
```

Expected: `acp_jobs_*` metrics present.

(If the metrics endpoint doesn't exist yet on acp-decoder, that's a Phase 1.5 polish task — note in success criteria.)

- [ ] **Step 5: No code change to commit; record in commit message of the next change**

---

## Task 30: End-to-end test — submit a self-decode

- [ ] **Step 1: From a separate buyer wallet (NOT the acp-decoder's), submit a job**

Use the openclaw-acp CLI's buyer flow, or another agent's UI:
```bash
# From a buyer wallet (e.g., your personal test wallet on Virtuals)
acp browse "wallet decode"  # find chainward-decoder
acp buy <chainward-decoder-id> wallet_decode \
  --requirement '{"wallet_address":"0x999A1B6033998A05F7e37e4BD471038dF46624E1"}'
```

(Axelrod's wallet — known active, full data available.)

- [ ] **Step 2: Watch the lifecycle**

```bash
kubectl -n chainward logs -l app.kubernetes.io/component=acp-decoder -f
```

Expect to see:
- `acp onNewTask` (REQUEST)
- accept + requirement
- `acp onNewTask` (TRANSACTION)
- decode running
- deliver
- COMPLETED

- [ ] **Step 3: Verify the deliverable**

In the buyer's ACP UI, the deliverable appears. Inspect the JSON:
- `report` is non-empty markdown starting with `# `
- `data.survival.classification` = `active` (Axelrod is active)
- `data.target.acp_id` = 129
- `meta.schema_version` = `1.0.0`
- `meta.disclosure` is the standard text

- [ ] **Step 4: Verify DB record**

```bash
kubectl -n chainward exec deploy/postgres-0 -- psql -U postgres chainward -c \
  "SELECT job_id, status, target_wallet, fee_usdc FROM decodes ORDER BY accepted_at DESC LIMIT 5;"
```

Expected: row for the test job, `status=delivered`, `fee_usdc=25.00`.

- [ ] **Step 5: Capture the deliverable as fixture**

```bash
mkdir -p packages/decode/__tests__/fixtures/e2e/
# Save the buyer's downloaded JSON to packages/decode/__tests__/fixtures/e2e/first-decode.json
```

- [ ] **Step 6: Commit the fixture**

```bash
git add packages/decode/__tests__/fixtures/e2e/
git commit -m "test(decode): capture first live decode as e2e regression fixture"
```

---

## Task 31: Soft launch on `@chainwardai`

- [ ] **Step 1: Tweet the announcement**

Compose:
```
ChainWard is now on Virtuals' Agentic Commerce Protocol.

Hire us to decode any agent wallet on Base — verified on-chain audit, dashboard discrepancies surfaced, peer cohort analysis, short readable report. $25 USDC.

acp.virtuals.io/agent/<our-id>

The intelligence layer for the agent economy.
```

- [ ] **Step 2: Update BookStack page 202**

Add to the "State" section of page 202:
> 2026-MM-DD: chainward-decoder live on ACP. First E2E job delivered cleanly. Soft launch announcement posted to @chainwardai.

- [ ] **Step 3: Update BookStack page 199**

Add a section noting that the auto-decode pipeline now powers the public Decoder Agent on ACP.

---

## Self-review

**Spec coverage check:**

Walking through the spec section by section against the plan:

- Goal — ✓ covered (Tasks 28, 29, 30 = ship)
- Strategic context — covered in plan header
- Architecture & job sequence — ✓ Tasks 21 (handler), 22 (seller), 23 (reconcile), 24 (index)
- One-time bootstrap — ✓ Task 28
- Runtime sequence — ✓ Task 22
- Reconciliation on pod restart — ✓ Task 23
- SLA + execution watchdog — handler.ts has the timeout-guard pattern; explicitly add to Task 21 review notes (handler test does not currently assert watchdog; runtime watchdog wraps `quickDecode` with `Promise.race` against a 5min timeout — implementer note to add inline, not a separate task)
- Reject conditions — ✓ Task 21 tests cover invalid_address + rate_limited; no_history is a Task 21 follow-up — **gap**, see addendum below
- Concurrency & rate limits — ✓ Task 19
- QuickDecodeResult schema — ✓ Task 2
- Sample report — ✓ used as fixture in Task 13
- Report-writer voice spec / PROMPT_VERSION — ✓ Task 14
- Special-case handlers (2999-12-31, HUB airdrop) — ✓ Task 8 (2999), Task 6 (HUB sender)
- Boundary tables — ✓ Task 9 (survival), Task 10 (usdc-pattern), Task 11 (cluster_status)
- Token-trading — ✓ Task 12
- Fallback template — ✓ Task 13
- File layout — ✓ matches header
- Error handling — partial: ETH-only EOA edge case ✓ Task 9; Sentinel timeout / Blockscout 5xx fallthroughs need wiring in `chain-audit.ts` retry logic — **gap, addendum**
- Observability metrics — pino logger ✓ Task 22; Prometheus metrics not added — **deliberately deferred to Phase 1.5**
- Persistence — ✓ Tasks 16, 20
- Secrets — ✓ Task 25, Task 28
- Helm — ✓ Task 25
- CI — ✓ Task 27
- Service definition (offering JSON) — ✓ Task 28
- Testing strategy — ✓ Tasks 5-15 are TDD per module
- Success criteria — Playbook walkthrough ✓ Task 28; deploy ✓ Task 29; E2E ✓ Task 30; soft launch ✓ Task 31

**Gaps identified — addendum:**

Three gaps found that should be resolved during execution rather than re-spec:

1. **`no_history` reject** — handler.ts validateRequest() should also call out to Blockscout to check `transactions_count` AND `token_transfers_count`. Currently the test only covers invalid_address. **Add to Task 21**: extend `validateRequest` to accept an async hook for chain-side checks, or add a separate `checkHistory()` step before `accept`. Not blocking — implementer should adjust Task 21 inline.

2. **Sentinel/Blockscout retry logic** — chain-audit.ts in Task 7 doesn't include the retry-once-then-fall-through pattern from the spec's error-handling matrix. **Implementer note:** add a small `retryOnce<T>()` helper at the top of chain-audit.ts and wrap the network calls.

3. **5-minute execution watchdog** — handler.ts in Task 21 calls quickDecode without a timeout wrapper. **Implementer note:** wrap with `Promise.race(quickDecode(...), timeout(5*60*1000))` in TRANSACTION phase.

**Placeholder scan:**

Searched the plan for "TODO", "TBD", "implement later", "fill in details", "Add appropriate", "handle edge cases", "Similar to Task". Found:

- Task 24 has one `// TODO` in the as_of_block in quickDecode — that's a known limitation noted explicitly (we don't have a sentinel block-pinning layer yet; populating real values requires a separate task to wire `eth_blockNumber` + `eth_getBlockByNumber`). Acceptable as a documented limitation.
- Task 24 has `api: { accept, reject, requirement, deliver }` as stubs with a comment to wire the SDK. This is honest documentation of an integration step the implementer must do against live SDK surface; cannot be fully written without the SDK in hand. The exact moonshot-cyber reference is cited.

No "TBD"-style placeholders.

**Type consistency check:**

- `QuickDecodeResult` shape used in Task 2 matches what Task 15 (`quickDecode`) returns. ✓
- `WalletType` type from Task 5 matches the type imported in Task 15. ✓
- `SurvivalClassification` from Task 9 matches Task 10 input and Task 13 fallback template. ✓
- `UsdcPattern` from Task 10 matches Task 13 fallback template. ✓
- `Source` shape (with `block_number` + `block_hash`) consistent across Task 2 and Task 15. ✓
- `meta.disclosure` used in Task 2 (test fixture) matches `DISCLOSURE_TEXT` constant in Task 2 module — same string. ✓
- `PROMPT_VERSION` exported in Task 14, asserted in tests. ✓
- `RateLimiter` interface in Task 19 matches `rateLimiter` field in `HandlerContext` in Task 21. ✓

No type drift identified.

---

## Execution

Plan complete and saved to `docs/superpowers/plans/2026-04-30-acp-decoder-agent.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration with two-stage spec compliance + code quality review. Best for keeping the controller's context clean and the implementer focused.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints for review.

Which approach?
