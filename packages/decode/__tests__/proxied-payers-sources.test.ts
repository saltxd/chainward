import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FACILITATOR_PROXIES,
  PROXY_FACILITATORS,
  alchemyReceiptSource,
  x402scanSettlementSource,
} from '../src/proxied-payers.js';

const MERIDIAN = '0x8e7769d440b3460b92159dd9c6d17302b036e2d6';
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const MRDN = '0xe57e601c06689d3e2bf7db7bebb14b4ff28400c6';
const word = (a: string) => '0x' + a.replace(/^0x/, '').padStart(64, '0');

describe('facilitator proxy registry', () => {
  it('names the proxies the research verified on receipts', () => {
    expect(FACILITATOR_PROXIES).toEqual(
      expect.arrayContaining([
        { address: MERIDIAN, name: 'Meridian', facilitator: 'mrdn' },
        { address: '0x9c955c40dc98fce89a133f402ffbf94070e6e299', name: 'Fluxa', facilitator: 'fluxa' },
      ]),
    );
    for (const p of FACILITATOR_PROXIES) expect(p.address).toBe(p.address.toLowerCase());
    expect(PROXY_FACILITATORS).toEqual({ mrdn: 'Meridian', fluxa: 'Fluxa' });
  });
});

describe('x402scanSettlementSource', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stub(body: unknown, status = 200) {
    const urls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        urls.push(url);
        return { ok: status < 400, status, json: async () => body };
      }),
    );
    return urls;
  }
  const input = (url: string) => JSON.parse(decodeURIComponent(url.split('?input=')[1]!)).json;

  it("asks for the address's settlements by the given facilitators, newest first, and maps payer and payee", async () => {
    const urls = stub({
      result: {
        data: {
          json: {
            items: [
              { tx_hash: '0xAA', sender: '0x13DB', recipient: '0xa6a9', amount: 46697747, decimals: 6, facilitator_id: 'mrdn' },
            ],
            hasNextPage: false,
          },
        },
      },
    });
    const rows = await x402scanSettlementSource()('in', '0xA6A9', ['mrdn', 'fluxa']);
    expect(urls[0]).toMatch(/^https:\/\/www\.x402scan\.com\/api\/trpc\/public\.transfers\.list\?input=/);
    expect(input(urls[0]!)).toEqual({
      chain: 'base',
      timeframe: 30,
      recipients: { include: ['0xa6a9'] },
      facilitatorIds: ['mrdn', 'fluxa'],
      sorting: { id: 'block_timestamp', desc: true },
      pagination: { page: 0, page_size: 1000 },
    });
    expect(rows).toEqual([{ tx: '0xaa', payer: '0x13db', payee: '0xa6a9', usd: 46.697747, facilitator: 'mrdn' }]);
  });

  it("filters on the payer for an address's outgoing settlements", async () => {
    const urls = stub({ result: { data: { json: { items: [], hasNextPage: false } } } });
    await x402scanSettlementSource()('out', '0xS', ['mrdn']);
    expect(input(urls[0]!)).toMatchObject({ senders: { include: ['0xs'] } });
    expect(input(urls[0]!)).not.toHaveProperty('recipients');
  });

  it('throws when x402scan answers an error, so the check can fall back to receipts', async () => {
    stub({ error: { json: { message: 'boom' } } }, 500);
    await expect(x402scanSettlementSource()('in', '0xs', ['mrdn'])).rejects.toThrow(/x402scan/);
  });
});

describe('alchemyReceiptSource', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the receipt's USDC transfers and nothing else", async () => {
    const calls: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: { body: string }) => {
        calls.push(JSON.parse(init.body));
        return {
          status: 200,
          json: async () => ({
            result: {
              logs: [
                { address: USDC, topics: [TRANSFER, word('0x13db4caf175f23f1429c2df6b333350c24705192'), word(MERIDIAN)], data: '0x' + (47169441).toString(16) },
                { address: USDC.toUpperCase().replace('0X', '0x'), topics: [TRANSFER, word(MERIDIAN), word('0xa6a90366a307080bccb859642d3378121fe8809d')], data: '0x' + (46697747).toString(16) },
                { address: MRDN, topics: [TRANSFER, word(MERIDIAN), word('0x13db4caf175f23f1429c2df6b333350c24705192')], data: '0x01' },
                { address: USDC, topics: ['0xother'], data: '0x01' },
              ],
            },
          }),
        };
      }),
    );
    const legs = await alchemyReceiptSource('https://alchemy.test')('0xTX');
    expect(calls[0]).toMatchObject({ method: 'eth_getTransactionReceipt', params: ['0xTX'] });
    expect(legs).toEqual([
      { from: '0x13db4caf175f23f1429c2df6b333350c24705192', to: MERIDIAN, usd: 47.169441, hash: '0xtx' },
      { from: MERIDIAN, to: '0xa6a90366a307080bccb859642d3378121fe8809d', usd: 46.697747, hash: '0xtx' },
    ]);
  });

  it('throws on a missing receipt', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ status: 200, json: async () => ({ result: null }) })));
    await expect(alchemyReceiptSource('https://alchemy.test')('0xtx')).rejects.toThrow(/receipt/);
  });
});
