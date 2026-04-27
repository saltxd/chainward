import { createPublicClient, http, fallback, type PublicClient } from 'viem';
import { base } from 'viem/chains';
import { getEnv } from '../config.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: any = null;

export function getBaseClient(): PublicClient {
  if (!_client) {
    const env = getEnv();
    const primary = http(env.BASE_RPC_URL, { timeout: 5_000 });
    const tertiary = http(env.BASE_RPC_TERTIARY_URL, { timeout: 15_000 });

    let transport;
    if (env.BASE_RPC_FALLBACK_URL) {
      const secondary = http(env.BASE_RPC_FALLBACK_URL, { timeout: 10_000 });
      transport = fallback([primary, secondary, tertiary], { rank: false });
    } else {
      transport = fallback([primary, tertiary], { rank: false });
    }

    _client = createPublicClient({
      chain: base,
      transport,
      batch: { multicall: true },
    });
  }
  return _client as PublicClient;
}
