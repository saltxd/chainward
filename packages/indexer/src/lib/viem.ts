import { createPublicClient, http, type PublicClient, type HttpTransport, type Chain } from 'viem';
import { base } from 'viem/chains';
import { getEnv } from '../config.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _client: any = null;

export function getBaseClient(): PublicClient<HttpTransport, Chain> {
  if (!_client) {
    _client = createPublicClient({
      chain: base,
      transport: http(getEnv().BASE_RPC_URL),
      batch: { multicall: true },
    });
  }
  return _client as PublicClient<HttpTransport, Chain>;
}
