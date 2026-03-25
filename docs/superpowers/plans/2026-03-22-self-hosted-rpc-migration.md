# Self-Hosted RPC Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate ChainWard from Alchemy RPC to self-hosted Base node (cw-sentinel at 192.168.1.194:8545) with Alchemy fallback, replacing all proprietary Alchemy RPC methods with standard equivalents.

**Architecture:** Add a `standard` chain data provider that uses `eth_getLogs` for transfer history and viem `multicall` for token balances — standard JSON-RPC methods that any node supports. Add fallback transport to viem client. Update env config to support optional `BASE_RPC_FALLBACK_URL`. Keep Alchemy webhooks unchanged.

**Tech Stack:** TypeScript, viem, Hono, BullMQ, Drizzle ORM, Zod

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Create | `apps/api/src/providers/standard/chainDataProvider.ts` | Standard RPC chain data provider (replaces Alchemy-specific methods) |
| Create | `apps/api/src/providers/standard/chainDataProvider.test.ts` | Tests for standard provider |
| Modify | `apps/api/src/providers/index.ts` | Register `standard` provider in factory |
| Modify | `apps/api/src/config.ts` | Add `BASE_RPC_FALLBACK_URL`, make `ALCHEMY_API_KEY` optional, add `standard` to `CHAIN_PROVIDER` |
| Modify | `packages/indexer/src/config.ts` | Add `BASE_RPC_FALLBACK_URL`, make `ALCHEMY_API_KEY` optional |
| Modify | `packages/indexer/src/lib/viem.ts` | Add fallback transport |
| Modify | `packages/indexer/src/lib/chainDataProvider.ts` | Replace `IndexerAlchemyProvider` with standard RPC implementation |
| Modify | `packages/indexer/src/workers/acpWalletTracer.ts` | Replace `alchemy_getAssetTransfers` with `eth_getLogs` |
| Modify | `packages/indexer/src/workers/backfill.ts` | Use standard provider instead of `IndexerAlchemyProvider` |
| Modify | `apps/api/src/lib/contractCheck.ts` | Use viem instead of ethers `JsonRpcProvider` |

**Not changed:**
- `apps/api/src/providers/alchemy/webhookProvider.ts` — webhooks stay on Alchemy
- `apps/api/src/providers/alchemy/chainDataProvider.ts` — kept as-is for `CHAIN_PROVIDER=alchemy` fallback
- `scripts/backfill.ts` — one-time script, intentionally uses Alchemy for historical data
- `packages/indexer/src/index.ts` — ACP wallet tracer is already disabled (CU emergency comment)

---

### Task 1: Add fallback RPC config to both env schemas

**Files:**
- Modify: `apps/api/src/config.ts:1-19`
- Modify: `packages/indexer/src/config.ts:1-18`

- [ ] **Step 1: Update API config schema**

In `apps/api/src/config.ts`, add `BASE_RPC_FALLBACK_URL`, make `ALCHEMY_API_KEY` optional when using standard provider, add `standard` to `CHAIN_PROVIDER`:

```typescript
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(8000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  BASE_RPC_URL: z.string().url(),
  BASE_RPC_FALLBACK_URL: z.string().url().optional(),
  ALCHEMY_API_KEY: z.string().optional(),
  ALCHEMY_WEBHOOK_SIGNING_KEY: z.string().min(1),
  ALCHEMY_AUTH_TOKEN: z.string().optional(),
  ALCHEMY_WEBHOOK_ID: z.string().optional(),
  CHAIN_PROVIDER: z.enum(['alchemy', 'standard']).default('standard'),
  SOLANA_RPC_URL: z.string().url().optional(),
  HELIUS_API_KEY: z.string().optional(),
  COINGECKO_API_KEY: z.string().optional(),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
});
```

- [ ] **Step 2: Update indexer config schema**

In `packages/indexer/src/config.ts`:

```typescript
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  BASE_RPC_URL: z.string().url(),
  BASE_RPC_FALLBACK_URL: z.string().url().optional(),
  ALCHEMY_API_KEY: z.string().optional(),
  COINGECKO_API_KEY: z.string().optional(),
});
```

- [ ] **Step 3: Verify typecheck passes**

Run: `cd ~/Forge/agentguard && pnpm typecheck`
Expected: PASS (no consumers rely on `ALCHEMY_API_KEY` being required yet)

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/config.ts packages/indexer/src/config.ts
git commit -m "feat: add BASE_RPC_FALLBACK_URL and standard provider option to env config"
```

---

### Task 2: Add fallback transport to viem client

**Files:**
- Modify: `packages/indexer/src/lib/viem.ts`

- [ ] **Step 1: Add fallback transport**

Replace `packages/indexer/src/lib/viem.ts` with:

```typescript
import { createPublicClient, http, fallback, type PublicClient, type HttpTransport, type Chain, type FallbackTransport } from 'viem';
import { base } from 'viem/chains';
import { getEnv } from '../config.js';

let _client: PublicClient<FallbackTransport | HttpTransport, Chain> | null = null;

export function getBaseClient(): PublicClient<FallbackTransport | HttpTransport, Chain> {
  if (!_client) {
    const env = getEnv();
    const transports = [http(env.BASE_RPC_URL)];
    if (env.BASE_RPC_FALLBACK_URL) {
      transports.push(http(env.BASE_RPC_FALLBACK_URL));
    }

    _client = createPublicClient({
      chain: base,
      transport: transports.length > 1 ? fallback(transports) : transports[0],
      batch: { multicall: true },
    });
  }
  return _client;
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd ~/Forge/agentguard && pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/indexer/src/lib/viem.ts
git commit -m "feat: add fallback RPC transport to viem client"
```

---

### Task 3: Create standard chain data provider

**Files:**
- Create: `apps/api/src/providers/standard/chainDataProvider.ts`

This replaces `alchemy_getAssetTransfers` with `eth_getLogs` and `alchemy_getTokenBalances` with viem multicall. These are standard JSON-RPC methods supported by any Ethereum node.

- [ ] **Step 1: Create the standard provider**

Create `apps/api/src/providers/standard/chainDataProvider.ts`:

```typescript
import {
  createPublicClient,
  http,
  fallback,
  parseAbiItem,
  formatEther,
  type PublicClient,
  type Log,
} from 'viem';
import { base } from 'viem/chains';
import type { ChainDataProvider, TransferRecord, TokenBalanceRecord } from '@chainward/common';
import { logger } from '../../lib/logger.js';

const ERC20_TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

/** Known tokens to check balances for. Add more as needed. */
const TRACKED_TOKENS: Array<{ address: `0x${string}`; decimals: number; symbol: string }> = [
  { address: '0x4200000000000000000000000000000000000006', decimals: 18, symbol: 'WETH' },
  { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, symbol: 'USDC' },
  { address: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb', decimals: 18, symbol: 'DAI' },
  { address: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', decimals: 6, symbol: 'USDbC' },
  { address: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22', decimals: 18, symbol: 'cbETH' },
  { address: '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452', decimals: 18, symbol: 'wstETH' },
  { address: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b', decimals: 18, symbol: 'VIRTUAL' },
];

const ERC20_BALANCE_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export class StandardChainDataProvider implements ChainDataProvider {
  private client: PublicClient;

  constructor(rpcUrl: string, fallbackUrl?: string) {
    const transports = [http(rpcUrl)];
    if (fallbackUrl) transports.push(http(fallbackUrl));

    this.client = createPublicClient({
      chain: base,
      transport: transports.length > 1 ? fallback(transports) : transports[0],
      batch: { multicall: true },
    });
  }

  async getTransferHistory(params: {
    address: string;
    direction: 'inbound' | 'outbound';
    fromBlock?: string;
    maxCount?: number;
    categories?: string[];
  }): Promise<TransferRecord[]> {
    const address = params.address as `0x${string}`;
    const fromBlock = params.fromBlock ? BigInt(params.fromBlock) : undefined;
    const maxCount = params.maxCount ?? 25;
    const transfers: TransferRecord[] = [];

    // Native ETH transfers via block range scan
    const categories = params.categories ?? ['external', 'erc20'];

    if (categories.includes('erc20')) {
      const logs = await this.client.getLogs({
        event: ERC20_TRANSFER_EVENT,
        args: params.direction === 'outbound' ? { from: address } : { to: address },
        fromBlock: fromBlock ?? 'earliest',
        toBlock: 'latest',
      });

      for (const log of logs.slice(0, maxCount)) {
        transfers.push(this.logToTransferRecord(log, 'erc20'));
      }
    }

    if (categories.includes('external')) {
      // For native transfers, we query recent blocks for transactions
      // This is limited compared to Alchemy's indexed transfer API,
      // but covers the common case of recent activity
      const currentBlock = await this.client.getBlockNumber();
      const lookback = BigInt(10000); // ~7 days on Base
      const startBlock = fromBlock ?? (currentBlock > lookback ? currentBlock - lookback : 0n);

      // Use eth_getLogs with no event signature to find internal transactions
      // Note: standard RPC can't efficiently index native transfers like Alchemy can.
      // For native transfer history, we rely on the transaction data already in the DB
      // from webhook events. This provider focuses on ERC20 transfers via logs.
      logger.debug(
        { address, direction: params.direction, startBlock: startBlock.toString() },
        'Standard provider: native transfer history limited to ERC20 logs + DB records',
      );
    }

    return transfers;
  }

  async getTokenBalances(address: string): Promise<TokenBalanceRecord[]> {
    const results = await this.client.multicall({
      contracts: TRACKED_TOKENS.map((token) => ({
        address: token.address,
        abi: ERC20_BALANCE_ABI,
        functionName: 'balanceOf',
        args: [address as `0x${string}`],
      })),
    });

    return results.map((result, i) => ({
      contractAddress: TRACKED_TOKENS[i].address,
      tokenBalance: result.status === 'success' ? `0x${(result.result as bigint).toString(16)}` : '0x0',
      error: result.status === 'failure' ? result.error.message : null,
    }));
  }

  async getNativeBalance(address: string): Promise<string> {
    const balance = await this.client.getBalance({ address: address as `0x${string}` });
    return `0x${balance.toString(16)}`;
  }

  private logToTransferRecord(log: Log<bigint, number, false>, category: string): TransferRecord {
    const args = (log as any).args;
    return {
      hash: log.transactionHash ?? '0x',
      blockNum: log.blockNumber?.toString() ?? '0',
      from: args?.from ?? '0x',
      to: args?.to ?? null,
      value: args?.value ? Number(formatEther(args.value)) : null,
      asset: null,
      category,
      rawContract: {
        rawValue: args?.value?.toString() ?? null,
        address: log.address ?? null,
        decimal: null,
      },
      metadata: null,
    };
  }
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd ~/Forge/agentguard && pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/providers/standard/chainDataProvider.ts
git commit -m "feat: add standard chain data provider using eth_getLogs and multicall"
```

---

### Task 4: Register standard provider in factory

**Files:**
- Modify: `apps/api/src/providers/index.ts`

- [ ] **Step 1: Update provider factory**

Replace `apps/api/src/providers/index.ts`:

```typescript
import type { ChainDataProvider, WebhookProvider } from '@chainward/common';
import { AlchemyWebhookProvider } from './alchemy/webhookProvider.js';
import { AlchemyChainDataProvider } from './alchemy/chainDataProvider.js';
import { StandardChainDataProvider } from './standard/chainDataProvider.js';

export type ProviderName = 'alchemy' | 'standard';

function getProviderName(): ProviderName {
  const name = process.env.CHAIN_PROVIDER ?? 'standard';
  const valid: ProviderName[] = ['alchemy', 'standard'];

  if (!valid.includes(name as ProviderName)) {
    throw new Error(
      `Unknown CHAIN_PROVIDER: "${name}". Valid options: ${valid.join(', ')}`,
    );
  }

  return name as ProviderName;
}

let _webhookProvider: WebhookProvider | null = null;
let _chainDataProvider: ChainDataProvider | null = null;

export function getWebhookProvider(): WebhookProvider {
  if (!_webhookProvider) {
    // Webhooks always use Alchemy regardless of CHAIN_PROVIDER
    _webhookProvider = new AlchemyWebhookProvider();
  }
  return _webhookProvider;
}

export function getChainDataProvider(): ChainDataProvider {
  if (!_chainDataProvider) {
    const name = getProviderName();
    const rpcUrl = process.env.BASE_RPC_URL;
    if (!rpcUrl) throw new Error('BASE_RPC_URL is required');
    const fallbackUrl = process.env.BASE_RPC_FALLBACK_URL;

    switch (name) {
      case 'alchemy':
        _chainDataProvider = new AlchemyChainDataProvider(rpcUrl);
        break;
      case 'standard':
        _chainDataProvider = new StandardChainDataProvider(rpcUrl, fallbackUrl);
        break;
    }
  }
  return _chainDataProvider;
}

export type { ChainDataProvider, WebhookProvider } from '@chainward/common';
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd ~/Forge/agentguard && pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/providers/index.ts
git commit -m "feat: register standard provider in factory, default to standard"
```

---

### Task 5: Replace Alchemy methods in indexer chain data provider

**Files:**
- Modify: `packages/indexer/src/lib/chainDataProvider.ts`

- [ ] **Step 1: Rewrite indexer provider with standard RPC**

Replace `packages/indexer/src/lib/chainDataProvider.ts`:

```typescript
import type { ChainDataProvider, TransferRecord, TokenBalanceRecord } from '@chainward/common';
import { parseAbiItem, formatEther, type Log } from 'viem';
import { getBaseClient } from './viem.js';
import { logger } from './logger.js';

const ERC20_TRANSFER_EVENT = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

export class IndexerChainDataProvider implements ChainDataProvider {
  async getTransferHistory(params: {
    address: string;
    direction: 'inbound' | 'outbound';
    fromBlock?: string;
    maxCount?: number;
    categories?: string[];
  }): Promise<TransferRecord[]> {
    const client = getBaseClient();
    const address = params.address as `0x${string}`;
    const fromBlock = params.fromBlock ? BigInt(params.fromBlock) : undefined;
    const maxCount = params.maxCount ?? 1000;
    const transfers: TransferRecord[] = [];

    const logs = await client.getLogs({
      event: ERC20_TRANSFER_EVENT,
      args: params.direction === 'outbound' ? { from: address } : { to: address },
      fromBlock: fromBlock ?? 'earliest',
      toBlock: 'latest',
    });

    for (const log of logs.slice(0, maxCount)) {
      const args = (log as any).args;
      transfers.push({
        hash: log.transactionHash ?? '0x',
        blockNum: log.blockNumber?.toString() ?? '0',
        from: args?.from ?? '0x',
        to: args?.to ?? null,
        value: args?.value ? Number(formatEther(args.value)) : null,
        asset: null,
        category: 'erc20',
        rawContract: {
          rawValue: args?.value?.toString() ?? null,
          address: log.address ?? null,
          decimal: null,
        },
        metadata: null,
      });
    }

    logger.debug(
      { address, direction: params.direction, count: transfers.length },
      'Fetched transfer history via eth_getLogs',
    );

    return transfers;
  }

  async getTokenBalances(_address: string): Promise<TokenBalanceRecord[]> {
    throw new Error('getTokenBalances not implemented in indexer — use API provider');
  }

  async getNativeBalance(_address: string): Promise<string> {
    throw new Error('getNativeBalance not implemented in indexer — use API provider');
  }
}
```

- [ ] **Step 2: Update backfill worker import**

In `packages/indexer/src/workers/backfill.ts`, change line 6 and line 35:

```typescript
// Line 6: change import
import { IndexerChainDataProvider } from '../lib/chainDataProvider.js';

// Line 35: change instantiation
const provider = new IndexerChainDataProvider();
```

Remove `env.BASE_RPC_URL` from the constructor call — the new provider uses the shared viem client.

- [ ] **Step 3: Verify typecheck passes**

Run: `cd ~/Forge/agentguard && pnpm typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/indexer/src/lib/chainDataProvider.ts packages/indexer/src/workers/backfill.ts
git commit -m "feat: replace Alchemy-specific methods in indexer with standard eth_getLogs"
```

---

### Task 6: Replace Alchemy call in ACP wallet tracer

**Files:**
- Modify: `packages/indexer/src/workers/acpWalletTracer.ts:142-170`

- [ ] **Step 1: Replace alchemy_getAssetTransfers with eth_getLogs**

In `packages/indexer/src/workers/acpWalletTracer.ts`, replace the `traceWallet` function's fetch call (lines ~147-166):

Replace the `alchemy_getAssetTransfers` payload and parsing with:

```typescript
import { parseAbiItem } from 'viem';
import { getBaseClient } from '../lib/viem.js';

// At the top of traceWallet function:
const client = getBaseClient();
const ERC20_TRANSFER = parseAbiItem(
  'event Transfer(address indexed from, address indexed to, uint256 value)',
);

const logs = await client.getLogs({
  event: ERC20_TRANSFER,
  args: { from: acpWallet as `0x${string}` },
  fromBlock: 'earliest',
  toBlock: 'latest',
});

// Map logs to the same shape the rest of the function expects
const transfers = logs.slice(0, 100).map((log) => {
  const args = (log as any).args;
  return {
    to: args?.to as string,
    value: args?.value ? Number(args.value) / 1e18 : null,
    asset: 'ERC20',
  };
});
```

Remove the `fetch` call to `rpcUrl` with `alchemy_getAssetTransfers`.

- [ ] **Step 2: Verify typecheck passes**

Run: `cd ~/Forge/agentguard && pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/indexer/src/workers/acpWalletTracer.ts
git commit -m "feat: replace Alchemy RPC in ACP wallet tracer with standard eth_getLogs"
```

---

### Task 7: Replace ethers with viem in contractCheck

**Files:**
- Modify: `apps/api/src/lib/contractCheck.ts`

This removes the ethers.js dependency for this file — everything else uses viem.

- [ ] **Step 1: Rewrite contractCheck with viem**

Replace `apps/api/src/lib/contractCheck.ts`:

```typescript
import { createPublicClient, http, fallback } from 'viem';
import { base } from 'viem/chains';
import { logger } from './logger.js';

let _client: ReturnType<typeof createPublicClient> | null = null;

function getClient() {
  if (!_client) {
    const rpcUrl = process.env.BASE_RPC_URL;
    const fallbackUrl = process.env.BASE_RPC_FALLBACK_URL;
    const transports = [http(rpcUrl)];
    if (fallbackUrl) transports.push(http(fallbackUrl));

    _client = createPublicClient({
      chain: base,
      transport: transports.length > 1 ? fallback(transports) : transports[0],
    });
  }
  return _client;
}

const KNOWN_WALLET_CONTRACTS = new Set([
  '0xd9db270c1b5e3bd161e8c8503c55ceabee709552',
  '0x41675c099f32341bf84bfc5382af534df5c7461a',
  '0x29fcb43b46531bca003ddc8fcb67ffe91900c762',
  '0x5ff137d4b0fdcd49dca30c7cf57e578a026d2789',
  '0x0000000071727de22e5e9d8baf0edac6f37da032',
]);

export interface ContractCheckResult {
  isContract: boolean;
  isKnownWallet: boolean;
}

export async function checkAddressType(address: string): Promise<ContractCheckResult> {
  try {
    const code = await getClient().getCode({ address: address as `0x${string}` });

    if (!code || code === '0x' || code === '0x0') {
      return { isContract: false, isKnownWallet: false };
    }

    const codeLower = code.toLowerCase();
    const isKnownWallet = [...KNOWN_WALLET_CONTRACTS].some((addr) =>
      codeLower.includes(addr.slice(2)),
    );

    return { isContract: true, isKnownWallet };
  } catch (err) {
    logger.warn({ err, address }, 'Failed to check address type, assuming EOA');
    return { isContract: false, isKnownWallet: false };
  }
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd ~/Forge/agentguard && pnpm typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/contractCheck.ts
git commit -m "refactor: replace ethers with viem in contractCheck, add fallback transport"
```

---

### Task 8: Update K8s secret and deploy

**Files:**
- No code changes — infrastructure only

- [ ] **Step 1: Update K8s secret with local node RPC**

```bash
kubectl -n chainward get secret chainward-secrets -o json | \
  jq '.data["BASE_RPC_URL"] = "'$(echo -n 'http://192.168.1.194:8545' | base64)'" |
      .data["BASE_RPC_FALLBACK_URL"] = "'$(echo -n 'https://base-mainnet.g.alchemy.com/v2/y9e786wEgAdGVXdzEV_r3' | base64)'" |
      .data["CHAIN_PROVIDER"] = "'$(echo -n 'standard' | base64)'"' | \
  kubectl apply -f -
```

- [ ] **Step 2: Update local .env**

In `~/Forge/agentguard/.env`, update:

```
BASE_RPC_URL=http://192.168.1.194:8545
BASE_RPC_FALLBACK_URL=https://base-mainnet.g.alchemy.com/v2/y9e786wEgAdGVXdzEV_r3
CHAIN_PROVIDER=standard
```

- [ ] **Step 3: Deploy**

```bash
cd ~/Forge/agentguard
./deploy/deploy.sh
```

- [ ] **Step 4: Verify pods are healthy**

```bash
kubectl -n chainward get pods
kubectl -n chainward logs -l app=api --tail=20
kubectl -n chainward logs -l app=indexer --tail=20
```

- [ ] **Step 5: Test RPC is hitting local node**

```bash
# Check cw-sentinel logs for incoming requests
ssh cw-sentinel "docker logs base-node-execution-1 2>&1 | tail -5"
```
