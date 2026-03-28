import { createPublicClient, http, fallback, type PublicClient } from 'viem';
import { base } from 'viem/chains';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: any = null;

export function getBaseClient(): PublicClient {
  if (!_client) {
    const primary = http(process.env.BASE_RPC_URL, { timeout: 5_000 });
    const fb = process.env.BASE_RPC_FALLBACK_URL;
    _client = createPublicClient({
      chain: base,
      transport: fb ? fallback([primary, http(fb, { timeout: 10_000 })], { rank: false }) : primary,
      batch: { multicall: true },
    });
  }
  return _client as PublicClient;
}
