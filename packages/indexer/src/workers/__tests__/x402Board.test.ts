import { afterEach, describe, expect, it, vi } from 'vitest';

// The weekly x402 board against a fake x402scan and a fake Base (Alchemy JSON-RPC),
// with an in-memory Redis. The seller is a Meridian ring wallet: every payment it
// receives or makes goes through Meridian's proxy, so the board must use the same
// proxy-aware check as the paid route to see the loop.
vi.mock('../../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const store = vi.hoisted(() => new Map<string, string>());
vi.mock('../../lib/redis.js', () => ({
  getRedis: () => ({
    set: async (k: string, v: string) => {
      store.set(k, v);
      return 'OK';
    },
  }),
}));

import { buildX402Board, X402_BOARD_LATEST_KEY, type BoardRow } from '../x402Board.js';

const MERIDIAN = '0x8e7769d440b3460b92159dd9c6d17302b036e2d6';
const SELLER = '0x00000000000000000000000000000000000000a1';
const PEERS = ['0x00000000000000000000000000000000000000b2', '0x00000000000000000000000000000000000000c3'];

interface Leg {
  from: string;
  to: string;
  value: number;
  hash: string;
}
interface Settled {
  tx_hash: string;
  sender: string;
  recipient: string;
  amount: number;
  decimals: number;
  facilitator_id: string;
}

function ringChain() {
  const legs: Leg[] = [];
  const settled: Settled[] = [];
  let n = 0;
  const pay = (payer: string, payee: string, usd: number) => {
    const hash = `0x${(++n).toString(16).padStart(64, '0')}`;
    legs.push({ from: payer, to: MERIDIAN, value: usd * 1.01, hash }, { from: MERIDIAN, to: payee, value: usd, hash });
    settled.push({ tx_hash: hash, sender: payer, recipient: payee, amount: Math.round(usd * 1e6), decimals: 6, facilitator_id: 'mrdn' });
  };
  for (let i = 0; i < 4; i++) {
    for (const p of PEERS) {
      pay(p, SELLER, 40);
      pay(SELLER, p, 40);
    }
  }
  // Meridian's other customers make the proxy a high-throughput address.
  for (let i = 0; i < 1000; i++) legs.push({ from: `0xother${i}`, to: MERIDIAN, value: 1, hash: `0xf${i}` });
  return { legs, settled };
}

function stubNetwork(chain: ReturnType<typeof ringChain>) {
  const trpc = (json: unknown) => new Response(JSON.stringify({ result: { data: { json } } }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: { body?: string }) => {
      if (url.startsWith('https://www.x402scan.com/api/trpc/')) {
        const proc = url.split('/api/trpc/')[1]!.split('?')[0];
        const input = JSON.parse(decodeURIComponent(url.split('?input=')[1]!)).json;
        if (proc === 'public.sellers.all.list') {
          return trpc({
            items: [{ recipient: SELLER, tx_count: 8, total_amount: 320e6, unique_buyers: 2, facilitator_ids: ['mrdn'], latest_block_timestamp: '2026-10-05T00:00:00Z' }],
          });
        }
        if (proc === 'public.origins.list.origins') return trpc([]);
        if (proc === 'public.transfers.list') {
          const to: string | undefined = input.recipients?.include?.[0];
          const from: string | undefined = input.senders?.include?.[0];
          return trpc({ items: chain.settled.filter((s) => (to ? s.recipient === to : s.sender === from)), hasNextPage: false });
        }
        throw new Error(`unexpected x402scan call ${proc}`);
      }
      const { method, params } = JSON.parse(init!.body!) as { method: string; params: Array<Record<string, string> | string> };
      const rpc = (result: unknown) => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }));
      if (method === 'eth_blockNumber') return rpc('0x3000000');
      if (method === 'alchemy_getAssetTransfers') {
        const q = params[0] as Record<string, string>;
        return rpc({ transfers: chain.legs.filter((l) => (q.toAddress ? l.to === q.toAddress : l.from === q.fromAddress)) });
      }
      if (method === 'eth_getTransactionReceipt') {
        const word = (a: string) => '0x' + a.replace(/^0x/, '').padStart(64, '0');
        const logs = chain.legs
          .filter((l) => l.hash === params[0])
          .map((l) => ({
            address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
            topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', word(l.from), word(l.to)],
            data: '0x' + Math.round(l.value * 1e6).toString(16),
          }));
        return rpc({ logs });
      }
      throw new Error(`unexpected RPC ${method}`);
    }),
  );
}

describe('buildX402Board', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    store.clear();
  });

  it('names the payers behind a Meridian proxy and flags the ring wallet', async () => {
    vi.stubEnv('SELLER_DEMAND_RPC_URL', 'https://base-mainnet.g.alchemy.com/v2/test-key');
    stubNetwork(ringChain());
    await buildX402Board();
    const board = JSON.parse(store.get(X402_BOARD_LATEST_KEY)!) as { rows: BoardRow[] };
    const report = board.rows[0]!.report!;
    expect(report.proxied_payers).toMatchObject([
      { proxy: MERIDIAN, name: 'Meridian', payers_resolved: 2, coverage_share: 1, source: 'x402scan', payers_funded_by_seller: 2 },
    ]);
    expect(report.signals.map((s) => s.id)).toEqual(expect.arrayContaining(['buyers_funded_by_seller', 'money_flows_back']));
  }, 15_000);
});
