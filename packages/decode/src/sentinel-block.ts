export interface SentinelBlock {
  number: number;
  hash: string;
}

export interface SentinelBlockInput {
  number: string; // hex from eth_blockNumber
  hash: string;   // from eth_getBlockByNumber
}

export function parseSentinelBlock(input: SentinelBlockInput): SentinelBlock {
  return {
    number: parseInt(input.number, 16),
    hash: input.hash,
  };
}

// Live RPC fetch — used in production, not tests.
export async function fetchCurrentBlock(rpcUrl: string): Promise<SentinelBlock> {
  const headers = { 'Content-Type': 'application/json' };
  const blockNumberResp = await fetch(rpcUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
  });
  const blockNumberJson: any = await blockNumberResp.json();
  const number: string = blockNumberJson.result;

  const blockResp = await fetch(rpcUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_getBlockByNumber', params: [number, false], id: 1 }),
  });
  const blockJson: any = await blockResp.json();
  return parseSentinelBlock({ number, hash: blockJson.result.hash });
}
