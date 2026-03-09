import type { ChainDataProvider, WebhookProvider } from '@chainward/common';
import { AlchemyWebhookProvider } from './alchemy/webhookProvider.js';
import { AlchemyChainDataProvider } from './alchemy/chainDataProvider.js';

export type ProviderName = 'alchemy';

function getProviderName(): ProviderName {
  const name = process.env.CHAIN_PROVIDER ?? 'alchemy';
  const valid: ProviderName[] = ['alchemy'];

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
    const name = getProviderName();
    switch (name) {
      case 'alchemy':
        _webhookProvider = new AlchemyWebhookProvider();
        break;
    }
  }
  return _webhookProvider;
}

export function getChainDataProvider(): ChainDataProvider {
  if (!_chainDataProvider) {
    const name = getProviderName();
    const rpcUrl = process.env.BASE_RPC_URL;
    if (!rpcUrl) throw new Error('BASE_RPC_URL is required');

    switch (name) {
      case 'alchemy':
        _chainDataProvider = new AlchemyChainDataProvider(rpcUrl);
        break;
    }
  }
  return _chainDataProvider;
}

export type { ChainDataProvider, WebhookProvider } from '@chainward/common';
