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
let _fallbackChainDataProvider: ChainDataProvider | null = null;

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

/**
 * A ChainDataProvider bound to BASE_RPC_FALLBACK_URL, used when the primary node's
 * head is stale (the EL-sync wedge — node answers, head frozen). Always the standard
 * (viem eth_getLogs + multicall + eth_getBalance) impl: those are plain RPC methods
 * every Base endpoint supports, so it works regardless of CHAIN_PROVIDER and whether
 * the fallback URL is an Alchemy or public RPC. Throws if no fallback is configured.
 */
export function getFallbackChainDataProvider(): ChainDataProvider {
  if (!_fallbackChainDataProvider) {
    const fallbackUrl = process.env.BASE_RPC_FALLBACK_URL;
    if (!fallbackUrl) {
      throw new Error('BASE_RPC_FALLBACK_URL is required for the fallback chain data provider');
    }
    _fallbackChainDataProvider = new StandardChainDataProvider(fallbackUrl);
  }
  return _fallbackChainDataProvider;
}

export type { ChainDataProvider, WebhookProvider } from '@chainward/common';
