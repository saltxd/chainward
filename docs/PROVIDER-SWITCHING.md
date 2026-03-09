# Provider Switching Runbook

How to switch ChainWard from Alchemy to another RPC provider (e.g., QuickNode).

## Architecture

ChainWard uses two provider interfaces:

- **`WebhookProvider`** — manages webhook subscriptions, verifies signatures, normalizes payloads
- **`ChainDataProvider`** — wraps proprietary RPC methods (transfer history, token balances)

Standard JSON-RPC calls (`eth_getBalance`, `getTransaction`, etc.) go through **viem** and only need the `BASE_RPC_URL` changed.

## Current Provider: Alchemy

| Env Var | Purpose |
|---------|---------|
| `CHAIN_PROVIDER` | Provider name (default: `alchemy`) |
| `BASE_RPC_URL` | RPC endpoint URL |
| `ALCHEMY_API_KEY` | RPC authentication |
| `ALCHEMY_WEBHOOK_SIGNING_KEY` | Webhook signature verification |
| `ALCHEMY_AUTH_TOKEN` | Webhook address management (optional) |
| `ALCHEMY_WEBHOOK_ID` | Webhook ID for address updates (optional) |

## How to Add a New Provider

### 1. Create adapter files (< 1 hour)

Create two files:

```
apps/api/src/providers/<provider>/
  chainDataProvider.ts    # implements ChainDataProvider
  webhookProvider.ts      # implements WebhookProvider
```

Each file implements the interface from `@chainward/common`:

```typescript
import type { ChainDataProvider } from '@chainward/common';

export class QuickNodeChainDataProvider implements ChainDataProvider {
  // Map QuickNode's qn_getWalletTokenTransactions -> getTransferHistory()
  // Map QuickNode's qn_getWalletTokenBalance -> getTokenBalances()
  // Standard eth_getBalance -> getNativeBalance()
}
```

### 2. Register in factory

In `apps/api/src/providers/index.ts`:

```typescript
// Add to ProviderName type:
export type ProviderName = 'alchemy' | 'quicknode';

// Add to getWebhookProvider() switch:
case 'quicknode':
  _webhookProvider = new QuickNodeWebhookProvider();
  break;

// Add to getChainDataProvider() switch:
case 'quicknode':
  _chainDataProvider = new QuickNodeChainDataProvider(rpcUrl);
  break;
```

### 3. If using a separate indexer provider

Update `packages/indexer/src/lib/chainDataProvider.ts` with the new provider's `getTransferHistory()` implementation, or add a second class and select based on env var.

### 4. Update environment

```bash
# K8s ConfigMap
kubectl -n chainward edit configmap chainward-config
# Set: CHAIN_PROVIDER=quicknode

# K8s Secret (update RPC URL + any new provider keys)
kubectl -n chainward edit secret chainward-secrets
# Set: BASE_RPC_URL=https://example.quiknode.pro/...

# Restart deployments
kubectl -n chainward rollout restart deployment/api
kubectl -n chainward rollout restart deployment/indexer
```

## Emergency: Alchemy Down

### Quick mitigation (5 minutes)

1. **Switch RPC URL only** — if the issue is just Alchemy RPC:
   ```bash
   # Use any Base RPC endpoint (Infura, QuickNode, public)
   kubectl -n chainward set env deployment/api BASE_RPC_URL=https://base-mainnet.infura.io/v3/YOUR_KEY
   kubectl -n chainward set env deployment/indexer BASE_RPC_URL=https://base-mainnet.infura.io/v3/YOUR_KEY
   ```
   This fixes: balance polling, standard RPC calls via viem
   This does NOT fix: webhooks (need Alchemy webhook infrastructure), proprietary methods (getAssetTransfers, getTokenBalances)

2. **Disable webhooks temporarily** — if Alchemy webhooks are down:
   - Transactions won't be indexed in real-time
   - Historical data and balances still work
   - Alerts won't fire for new transactions

### Full provider switch (1-2 hours)

1. Write the adapter files (see "How to Add a New Provider" above)
2. Build and push new Docker images
3. Deploy with `CHAIN_PROVIDER=quicknode`
4. Set up the new provider's webhook/stream pointing to the webhook endpoint

## Provider-Specific Equivalents

| ChainWard Method | Alchemy | QuickNode |
|-----------------|---------|-----------|
| `getTransferHistory()` | `alchemy_getAssetTransfers` | `qn_getWalletTokenTransactions` |
| `getTokenBalances()` | `alchemy_getTokenBalances` | `qn_getWalletTokenBalance` |
| `getNativeBalance()` | `eth_getBalance` | `eth_getBalance` |
| Webhook setup | Alchemy Notify API | QuickNode Streams |
| Webhook verification | HMAC-SHA256 | Varies by provider |
