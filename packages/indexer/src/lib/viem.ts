import { createPublicClient, http, fallback, type PublicClient } from 'viem';
import { base } from 'viem/chains';
import { getEnv } from '../config.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: any = null;

export function getBaseClient(): PublicClient {
  if (!_client) {
    const env = getEnv();
    const transports = [http(env.BASE_RPC_URL)];
    if (env.BASE_RPC_FALLBACK_URL) {
      transports.push(http(env.BASE_RPC_FALLBACK_URL));
    }

    _client = createPublicClient({
      chain: base,
      transport: transports.length > 1 ? fallback(transports) : http(env.BASE_RPC_URL),
      batch: { multicall: true },
    });
  }
  return _client as PublicClient;
}
