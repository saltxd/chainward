import { describe, expect, it, vi } from 'vitest';
import {
  BSC_IDENTITY_REGISTRY,
  ERC8183_BSC_KERNEL,
  HireCheckError,
  JOB_CREATED_TOPIC,
  ORDER_CREATED_TOPIC,
  SET_AND_EARN_START_BLOCK,
  TERMIX_BSC_ESCROWS,
  bscFundingGraph,
  decodeHireLog,
  hireWindow,
  runHireCheck,
  scanHireLogs,
} from '../src/hire-sources.js';
import type { FundingGraph } from '../src/hire-check.js';
import type { RpcCall } from '../src/rpc-fixtures.js';

const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const topic = (a: string | number | bigint) =>
  '0x' + (typeof a === 'string' ? a.toLowerCase().replace(/^0x/, '') : BigInt(a).toString(16)).padStart(64, '0');
const addr = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;
const OWNER = addr(0xaa);
const HIRER_A = addr(0x1);
const HIRER_B = addr(0x2);

describe('hireWindow', () => {
  it('never starts before Set and Earn\'s first block', () => {
    expect(hireWindow(125_500_000)).toEqual({ from: SET_AND_EARN_START_BLOCK, to: 125_500_000 });
  });
  it('covers 30 days at ~0.45 s blocks once the campaign is older than that', () => {
    expect(hireWindow(140_000_000)).toEqual({ from: 140_000_000 - 30 * 192_000, to: 140_000_000 });
  });
});

describe('decodeHireLog', () => {
  it('reads the client of a TermiX OrderCreated as the hirer', () => {
    expect(
      decodeHireLog({
        address: TERMIX_BSC_ESCROWS[0]!.toLowerCase(),
        topics: [ORDER_CREATED_TOPIC, '0x' + '11'.repeat(32), topic(HIRER_A), topic(332962)],
        blockNumber: '0x10',
        transactionHash: '0xt1',
        logIndex: '0x0',
      }),
    ).toEqual({ source: 'termix_escrow', hirer: HIRER_A, block: 16, tx: '0xt1' });
  });
  it('reads the client of an ERC-8183 JobCreated as the hirer', () => {
    expect(
      decodeHireLog({
        address: ERC8183_BSC_KERNEL.toLowerCase(),
        topics: [JOB_CREATED_TOPIC, topic(56900), topic(HIRER_B), topic(OWNER)],
        blockNumber: '0x20',
        transactionHash: '0xt2',
        logIndex: '0x1',
      }),
    ).toEqual({ source: 'erc8183_shared', hirer: HIRER_B, block: 32, tx: '0xt2' });
  });
  it('ignores anything else', () => {
    expect(decodeHireLog({ address: '0x1', topics: [TRANSFER], blockNumber: '0x1', transactionHash: '0x', logIndex: '0x0' })).toBeNull();
  });
});

describe('scanHireLogs', () => {
  it('splits the range into chunks no wider than the endpoint allows and passes the filter through', async () => {
    const seen: Array<{ fromBlock: string; toBlock: string; address: unknown; topics: unknown }> = [];
    const rpcCall: RpcCall = async (_url, method, params) => {
      expect(method).toBe('eth_getLogs');
      seen.push(params[0] as never);
      return [];
    };
    await scanHireLogs({
      rpcs: [{ url: 'https://a.test', logChunkBlocks: 10 }],
      rpcCall,
      address: ['0xe1'],
      topics: [ORDER_CREATED_TOPIC, null, null, [topic(1)]],
      fromBlock: 100,
      toBlock: 125,
    });
    expect(seen.map((s) => [Number(s.fromBlock), Number(s.toBlock)]).sort((a, b) => a[0]! - b[0]!)).toEqual([
      [100, 105],
      [106, 115],
      [116, 125],
    ]);
    expect(seen[0]?.address).toEqual(['0xe1']);
    expect(seen[0]?.topics).toEqual([ORDER_CREATED_TOPIC, null, null, [topic(1)]]);
  });

  it('moves a failing chunk to the fallback endpoint', async () => {
    const urls: string[] = [];
    const rpcCall: RpcCall = async (url) => {
      urls.push(url);
      if (url === 'https://a.test') throw new Error('eth_getLogs: 503');
      return [{ address: '0xe1', topics: [], blockNumber: '0x1', transactionHash: '0x', logIndex: '0x0' }];
    };
    const logs = await scanHireLogs({
      rpcs: [
        { url: 'https://a.test', logChunkBlocks: 1000 },
        { url: 'https://b.test', logChunkBlocks: 1000 },
      ],
      rpcCall,
      address: ['0xe1'],
      topics: [ORDER_CREATED_TOPIC],
      fromBlock: 1,
      toBlock: 10,
    });
    expect(logs).toHaveLength(1);
    expect(urls).toContain('https://b.test');
  });

  it('fails the scan when a chunk cannot be read anywhere (an incomplete hire count is never returned)', async () => {
    const rpcCall: RpcCall = async () => {
      throw new Error('eth_getLogs: 503');
    };
    await expect(
      scanHireLogs({ rpcs: [{ url: 'https://a.test', logChunkBlocks: 1000 }], rpcCall, address: ['0xe1'], topics: [], fromBlock: 1, toBlock: 10 }),
    ).rejects.toThrow(/503/);
  });
});

describe('bscFundingGraph', () => {
  it('treats an EIP-7702 delegated wallet as a wallet, not a contract', async () => {
    const code: Record<string, string> = {
      '0xeoa': '0x',
      '0x7702': '0xef0100' + '12'.repeat(20),
      '0xc': '0x6080604052',
    };
    const rpcCall: RpcCall = async (_url, method, params) => {
      if (method === 'eth_getCode') return code[params[0] as string];
      throw new Error('unexpected ' + method);
    };
    const g = bscFundingGraph({ alchemyUrl: 'https://alchemy.test', rpcUrl: 'https://rpc.test', rpcCall, windowFromBlock: 1 });
    expect(await g.isContract('0xeoa')).toBe(false);
    expect(await g.isContract('0x7702')).toBe(false);
    expect(await g.isContract('0xc')).toBe(true);
  });

  it('calls a wallet with 100,000+ sent transactions a hub without asking Alchemy', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const rpcCall: RpcCall = async (_url, method) => {
      if (method === 'eth_getTransactionCount') return '0x186a0';
      throw new Error('unexpected ' + method);
    };
    const g = bscFundingGraph({ alchemyUrl: 'https://alchemy.test', rpcUrl: 'https://rpc.test', rpcCall, windowFromBlock: 1 });
    expect(await g.isHub('0xhot')).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('calls a wallet with 1,000 stablecoin inflows in the window a hub (the seller check rule)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        status: 200,
        json: async () => ({ result: { transfers: Array.from({ length: 1000 }, (_, i) => ({ from: addr(i), to: '0xhub', value: 1 })) } }),
      })),
    );
    const rpcCall: RpcCall = async () => '0x5';
    const g = bscFundingGraph({ alchemyUrl: 'https://alchemy.test', rpcUrl: 'https://rpc.test', rpcCall, windowFromBlock: 1 });
    expect(await g.isHub('0xhub')).toBe(true);
    vi.unstubAllGlobals();
  });
});

// A fake BSC: the registry, two hire contracts and block headers, all answered from memory.
function fakeChain(opts: {
  owners: Record<string, string>;
  wallets?: Record<string, string>;
  registryBalance?: Record<string, number>;
  transfersIn?: Record<string, number[]>;
  termix?: Array<{ agent: number; client: string; block: number }>;
  kernel?: Array<{ provider: string; client: string; block: number }>;
}) {
  const calls: Array<{ method: string; params: unknown[] }> = [];
  const rpcCall: RpcCall = async (_url, method, params) => {
    calls.push({ method, params });
    if (method === 'eth_getBlockByNumber') {
      const n = Number(params[0]);
      return { number: params[0], timestamp: '0x' + (1_790_812_800 + n).toString(16) };
    }
    if (method === 'eth_call') {
      const { to, data } = params[0] as { to: string; data: string };
      expect(to.toLowerCase()).toBe(BSC_IDENTITY_REGISTRY.toLowerCase());
      const arg = data.slice(10);
      if (data.startsWith('0x6352211e')) {
        const owner = opts.owners[String(BigInt('0x' + arg))];
        if (!owner) throw new Error('eth_call: execution reverted');
        return topic(owner);
      }
      if (data.startsWith('0x00339509')) return topic(opts.wallets?.[String(BigInt('0x' + arg))] ?? '0x0');
      if (data.startsWith('0x70a08231')) return '0x' + (opts.registryBalance?.['0x' + arg.slice(24)] ?? 0).toString(16).padStart(64, '0');
      throw new Error('unexpected eth_call ' + data.slice(0, 10));
    }
    if (method === 'eth_getLogs') {
      const f = params[0] as { address: string | string[]; topics: Array<string | string[] | null>; fromBlock: string; toBlock: string };
      const [from, to] = [Number(f.fromBlock), Number(f.toBlock)];
      const inRange = (b: number) => b >= from && b <= to;
      const any = (t: string | string[] | null | undefined, v: string) => t == null || (Array.isArray(t) ? t.includes(v) : t === v);
      const log = (address: string, topics: string[], block: number, i: number) => ({
        address,
        topics,
        blockNumber: '0x' + block.toString(16),
        transactionHash: `0xtx${block}${i}`,
        logIndex: '0x0',
      });
      if (f.topics[0] === TRANSFER) {
        const ownerTopic = f.topics[2] as string;
        const owner = '0x' + ownerTopic.slice(26);
        return (opts.transfersIn?.[owner] ?? [])
          .map((id, i) => log(BSC_IDENTITY_REGISTRY, [TRANSFER, topic('0x0'), ownerTopic, topic(id)], from, i))
          .filter((l) => inRange(Number(l.blockNumber)));
      }
      if (f.topics[0] === ORDER_CREATED_TOPIC) {
        return (opts.termix ?? [])
          .filter((o) => inRange(o.block) && any(f.topics[3], topic(o.agent)))
          .map((o, i) => log(TERMIX_BSC_ESCROWS[0]!, [ORDER_CREATED_TOPIC, '0x' + '11'.repeat(32), topic(o.client), topic(o.agent)], o.block, i));
      }
      if (f.topics[0] === JOB_CREATED_TOPIC) {
        return (opts.kernel ?? [])
          .filter((j) => inRange(j.block) && any(f.topics[3], topic(j.provider)))
          .map((j, i) => log(ERC8183_BSC_KERNEL, [JOB_CREATED_TOPIC, topic(i), topic(j.client), topic(j.provider)], j.block, i));
      }
    }
    throw new Error('unexpected ' + method);
  };
  return { rpcCall, calls };
}

const emptyGraph: FundingGraph = {
  firstFunder: async () => null,
  hasTransfer: async () => false,
  isHub: async () => false,
  isContract: async () => false,
};
const HEAD = 125_600_000;
const base = { head: HEAD, alchemyUrl: 'https://alchemy.test', rpcs: [{ url: 'https://rpc.test', logChunkBlocks: 1_000_000 }] };

describe('runHireCheck', () => {
  it('resolves an agent id to its owner and wallet, and collects hires from both sources', async () => {
    const { rpcCall } = fakeChain({
      owners: { '332962': OWNER },
      wallets: { '332962': OWNER },
      termix: [
        { agent: 332962, client: HIRER_A, block: 125_100_000 },
        { agent: 332962, client: HIRER_A, block: 125_200_000 },
        { agent: 999, client: HIRER_B, block: 125_200_000 },
        // Before Set and Earn: outside the window.
        { agent: 332962, client: HIRER_B, block: 124_000_000 },
      ],
      kernel: [{ provider: OWNER, client: HIRER_B, block: 125_300_000 }],
    });
    const graph: FundingGraph = { ...emptyGraph, firstFunder: async (_k, a) => (a === HIRER_B ? { from: OWNER, block: 0 } : null) };
    const report = await runHireCheck({ ...base, agent: { kind: 'id', id: 332962 }, rpcCall, graph });

    expect(report).toMatchObject({
      chain: 'bsc',
      agent_id: 332962,
      owner: OWNER,
      agent_wallet: OWNER,
      hires: { total: 3, distinct_hirers: 2, by_source: { termix_escrow: 2, erc8183_shared: 1 } },
      summary: { owner_linked: 1, inconclusive: 1, independent_within_limits: 0, passes_three_independent: false },
    });
    expect(report.hirers.map((h) => [h.address, h.hires, h.verdict])).toEqual([
      [HIRER_A, 2, 'inconclusive'],
      [HIRER_B, 1, 'owner_funded'],
    ]);
    // First-hire time comes from the block header.
    expect(report.hirers[0]!.first_hire_at).toBe(new Date((1_790_812_800 + 125_100_000) * 1000).toISOString());
    expect(report.as_of.block).toBeLessThanOrEqual(HEAD);
  });

  it('falls back to the next public RPC for registry reads and headers when the first is down', async () => {
    const { rpcCall: chain } = fakeChain({
      owners: { '332962': OWNER },
      termix: [{ agent: 332962, client: HIRER_A, block: 125_100_000 }],
    });
    const rpcCall: RpcCall = async (url, method, params, t) => {
      if (url === 'https://down.test') throw new Error('fetch failed');
      return chain(url, method, params, t);
    };
    const report = await runHireCheck({
      ...base,
      rpcs: [
        { url: 'https://down.test', logChunkBlocks: 1_000_000 },
        { url: 'https://rpc.test', logChunkBlocks: 1_000_000 },
      ],
      agent: { kind: 'id', id: 332962 },
      rpcCall,
      graph: emptyGraph,
    });
    expect(report.owner).toBe(OWNER);
    expect(report.hires.total).toBe(1);
  });

  it('throws AGENT_NOT_FOUND for an id the registry does not know', async () => {
    const { rpcCall } = fakeChain({ owners: {} });
    await expect(runHireCheck({ ...base, agent: { kind: 'id', id: 5 }, rpcCall, graph: emptyGraph })).rejects.toMatchObject({
      code: 'AGENT_NOT_FOUND',
    });
    await expect(runHireCheck({ ...base, agent: { kind: 'id', id: 5 }, rpcCall, graph: emptyGraph })).rejects.toBeInstanceOf(HireCheckError);
  });

  it('finds an owner address\'s agents from registry transfers to it in 60 days, keeping only those it still owns', async () => {
    const alchemy: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: { body: string }) => {
        expect(url).toBe('https://alchemy.test');
        alchemy.push(JSON.parse(init.body).params[0]);
        return {
          status: 200,
          json: async () => ({
            result: {
              transfers: [7, 8, 7].map((id) => ({ from: addr(0), to: OWNER, value: null, erc721TokenId: topic(id) })),
            },
          }),
        };
      }),
    );
    const { rpcCall, calls } = fakeChain({
      owners: { '7': OWNER, '8': addr(0xbb) },
      wallets: { '7': addr(0xcc) },
      registryBalance: { [OWNER]: 1 },
      termix: [{ agent: 7, client: HIRER_A, block: 125_100_000 }],
      kernel: [{ provider: addr(0xcc), client: HIRER_B, block: 125_100_001 }],
    });
    const report = await runHireCheck({ ...base, agent: { kind: 'owner', address: OWNER.toUpperCase().replace('0X', '0x') }, rpcCall, graph: emptyGraph });
    vi.unstubAllGlobals();

    expect(report.agent_ids).toEqual([7]);
    expect(report.agent_id).toBe(7);
    expect(report.agent_wallet).toBe(addr(0xcc));
    expect(report.hires.total).toBe(2);
    // One indexed lookup instead of a 60-day chunked log scan.
    expect(alchemy).toHaveLength(1);
    expect(alchemy[0]).toMatchObject({
      category: ['erc721'],
      contractAddresses: [BSC_IDENTITY_REGISTRY],
      toAddress: OWNER,
      fromBlock: '0x' + (report.as_of.block - 60 * 192_000).toString(16),
    });
    const logFilters = calls.filter((c) => c.method === 'eth_getLogs').map((c) => (c.params[0] as { topics: string[] }).topics[0]);
    expect(logFilters).not.toContain(TRANSFER);
  });

  it('skips the agent lookup for an owner that holds no agents, but still reads its ERC-8183 hires', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { rpcCall, calls } = fakeChain({
      owners: {},
      kernel: [{ provider: OWNER, client: HIRER_A, block: 125_100_000 }],
    });
    const report = await runHireCheck({ ...base, agent: { kind: 'owner', address: OWNER }, rpcCall, graph: emptyGraph });
    vi.unstubAllGlobals();

    expect(report.agent_ids).toEqual([]);
    expect(report.agent_id).toBeNull();
    expect(report.hires.by_source).toEqual({ termix_escrow: 0, erc8183_shared: 1 });
    expect(fetchSpy).not.toHaveBeenCalled();
    const logFilters = calls.filter((c) => c.method === 'eth_getLogs').map((c) => (c.params[0] as { topics: string[] }).topics[0]);
    expect(logFilters).not.toContain(ORDER_CREATED_TOPIC);
  });
});
