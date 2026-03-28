import { createPublicClient, http, fallback, type PublicClient } from 'viem';
import { base } from 'viem/chains';
import { getEnv } from '../config.js';
import { logger } from './logger.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: any = null;

export function getBaseClient(): PublicClient {
  if (!_client) {
    const env = getEnv();
    const primary = http(env.BASE_RPC_URL, { timeout: 5_000 });

    let transport;
    if (env.BASE_RPC_FALLBACK_URL) {
      const secondary = http(env.BASE_RPC_FALLBACK_URL, { timeout: 10_000 });
      transport = fallback([primary, secondary], { rank: false });
    } else {
      transport = primary;
    }

    _client = createPublicClient({
      chain: base,
      transport,
      batch: { multicall: true },
    });

    // Log fallback events to track sentinel stalls
    if (env.BASE_RPC_FALLBACK_URL && _client.transport?.onResponse) {
      _client.transport.onResponse((args: { method: string; status: string; error?: Error; transport: { value?: { url?: string } } }) => {
        if (args.status === 'error') {
          logger.warn({
            method: args.method,
            url: args.transport?.value?.url,
            error: args.error?.message?.slice(0, 200),
          }, 'RPC fallback: sentinel failed, trying Alchemy');
        }
      });
    }
  }
  return _client as PublicClient;
}
