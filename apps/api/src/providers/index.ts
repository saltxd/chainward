import type { ChainDataProvider, WebhookProvider } from '@chainward/common';
import { AlchemyWebhookProvider } from './alchemy/webhookProvider.js';
import { AlchemyChainDataProvider } from './alchemy/chainDataProvider.js';
import { StandardChainDataProvider } from './standard/chainDataProvider.js';

export type ProviderName = 'alchemy' | 'standard';

function getProviderName(): ProviderName {
  const name = process.env.CHAIN_PROVIDER ?? 'alchemy';
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
