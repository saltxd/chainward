import { describe, expect, it } from 'vitest';
import { encodeAbiParameters, keccak256, toHex } from 'viem';
import {
  AGENT_WALLET_KEY_TOPIC,
  BOARD_MAX_ROWS,
  CAMPAIGN_MARKETPLACES,
  ERC721_TRANSFER_TOPIC,
  JOB_COMPLETED_TOPIC,
  METADATA_SET_TOPIC,
  ORDER_SETTLED_TOPIC,
  REGISTERED_TOPIC,
  SET_AND_EARN_BOARD_LIMITS,
  URI_UPDATED_TOPIC,
  applyHireLogs,
  applyRegistryLogs,
  assembleSetAndEarnBoard,
  classifyMarketplace,
  hiresByAgent,
  inlineCardName,
  jobKey,
  type AgentRegistration,
  type AgentVerdict,
  type BoardHire,
  type LogWithData,
} from '../src/set-and-earn-board.js';
import {
  BSC_IDENTITY_REGISTRY,
  ERC8183_BSC_KERNEL,
  JOB_CREATED_TOPIC,
  ORDER_CREATED_TOPIC,
  SET_AND_EARN_START_BLOCK,
  TERMIX_BSC_ESCROWS,
} from '../src/hire-sources.js';
import { HIRE_LIMITS } from '../src/hire-check.js';

const REGISTRY = BSC_IDENTITY_REGISTRY.toLowerCase();
const ESCROW = TERMIX_BSC_ESCROWS[0]!.toLowerCase();
const KERNEL = ERC8183_BSC_KERNEL.toLowerCase();
const ZERO = '0x0000000000000000000000000000000000000000';
const topic = (a: string | number | bigint) =>
  '0x' + (typeof a === 'string' ? a.toLowerCase().replace(/^0x/, '') : BigInt(a).toString(16)).padStart(64, '0');
const addr = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;
const B = SET_AND_EARN_START_BLOCK;

let logIndex = 0;
function log(address: string, topics: string[], data: string, block: number, tx = `0xtx${block}`): LogWithData {
  return { address, topics, data, blockNumber: toHex(block), transactionHash: tx, logIndex: toHex(logIndex++) };
}
const registered = (id: number, owner: string, uri: string, block = B + 10) =>
  log(REGISTRY, [REGISTERED_TOPIC, topic(id), topic(owner)], encodeAbiParameters([{ type: 'string' }], [uri]), block);
const walletSet = (id: number, wallet: string | null, block = B + 10) =>
  log(
    REGISTRY,
    [METADATA_SET_TOPIC, topic(id), AGENT_WALLET_KEY_TOPIC],
    encodeAbiParameters([{ type: 'string' }, { type: 'bytes' }], ['agentWallet', (wallet ?? '0x') as `0x${string}`]),
    block,
  );
const orderCreated = (order: number, hirer: string, agentId: number, block: number, escrow = ESCROW) =>
  log(escrow, [ORDER_CREATED_TOPIC, topic(order), topic(hirer), topic(agentId)], '0x', block);
const orderSettled = (order: number, block: number, escrow = ESCROW) =>
  log(escrow, [ORDER_SETTLED_TOPIC, topic(order)], '0x', block);
const jobCreated = (job: number, hirer: string, provider: string, block: number) =>
  log(KERNEL, [JOB_CREATED_TOPIC, topic(job), topic(hirer), topic(provider)], '0x', block);
const jobCompleted = (job: number, block: number) => log(KERNEL, [JOB_COMPLETED_TOPIC, topic(job), topic(addr(0xee))], '0x', block);

const card = (o: unknown) => 'data:application/json;base64,' + Buffer.from(JSON.stringify(o)).toString('base64');

describe('event topics', () => {
  it('are the keccak of the registry, TermiX and ERC-8183 event signatures', () => {
    const k = (s: string) => keccak256(toHex(s));
    expect(REGISTERED_TOPIC).toBe(k('Registered(uint256,string,address)'));
    expect(URI_UPDATED_TOPIC).toBe(k('URIUpdated(uint256,string,address)'));
    expect(METADATA_SET_TOPIC).toBe(k('MetadataSet(uint256,string,string,bytes)'));
    expect(AGENT_WALLET_KEY_TOPIC).toBe(k('agentWallet'));
    expect(ERC721_TRANSFER_TOPIC).toBe(k('Transfer(address,address,uint256)'));
    expect(ORDER_SETTLED_TOPIC).toBe(k('OrderSettled(bytes32,bool,uint256,uint256,uint256)'));
    expect(JOB_COMPLETED_TOPIC).toBe(k('JobCompleted(uint256,address,bytes32)'));
  });
});

describe('classifyMarketplace', () => {
  it('matches the campaign marketplaces by agentURI host, as the week-one decode did', () => {
    expect(classifyMarketplace('https://api.termix.ai/agents/1/card.json')).toBe('termix');
    expect(classifyMarketplace('https://www.dolphinamp.xyz/a/9')).toBe('dolphin');
    expect(classifyMarketplace('https://agentsouk.io/x')).toBe('agent_souk');
    expect(classifyMarketplace('https://hellofugu.ai/x')).toBe('hellofugu');
    expect(classifyMarketplace('https://kattegat.app/x')).toBe('kattegat');
    expect(classifyMarketplace('https://marque.trade/x')).toBe('marque');
    expect(classifyMarketplace('https://pokter.xyz/x')).toBe('pokter');
    expect(classifyMarketplace('https://agent-atlas.com/x')).toBe('agent_atlas');
    expect(classifyMarketplace('https://mandatemarkets.com/x')).toBe('mandate');
    expect(CAMPAIGN_MARKETPLACES).toHaveLength(9);
  });
  it('is case-insensitive and takes the first campaign host it finds, in the decode\'s order', () => {
    expect(classifyMarketplace('HTTPS://TERMIX.AI/x?ref=dolphinamp')).toBe('termix');
  });
  it('says none for an empty agentURI and other for anything else', () => {
    expect(classifyMarketplace('')).toBe('none');
    expect(classifyMarketplace('ipfs://bafy')).toBe('other');
    expect(classifyMarketplace('https://evoevo.ai/agent/1')).toBe('other');
    expect(classifyMarketplace(card({ name: 'Ave.ai Trading Agent' }))).toBe('other');
  });
});

describe('inlineCardName', () => {
  it('reads the name from a base64, URL-encoded or raw JSON inline card', () => {
    expect(inlineCardName(card({ name: 'Plinth keeper' }))).toBe('Plinth keeper');
    expect(inlineCardName('data:application/json,' + encodeURIComponent(JSON.stringify({ name: 'Mayor Tom' })))).toBe('Mayor Tom');
    expect(inlineCardName('  {"name":"Brain on BNB"}')).toBe('Brain on BNB');
  });
  it('is null for a hosted card, a nameless card or a card that does not parse', () => {
    expect(inlineCardName('https://termix.ai/a.json')).toBeNull();
    expect(inlineCardName(card({ description: 'x' }))).toBeNull();
    expect(inlineCardName('data:application/json;base64,!!!')).toBeNull();
    expect(inlineCardName('{not json')).toBeNull();
  });
  it('caps a long name at 120 characters', () => {
    expect(inlineCardName(card({ name: 'n'.repeat(500) }))).toHaveLength(120);
  });
});

describe('applyRegistryLogs', () => {
  it('records each agent registered from Set and Earn\'s first block, with its owner, card name and marketplace', () => {
    const regs = new Map<number, AgentRegistration>();
    const changed = applyRegistryLogs(regs, [
      registered(361189, addr(1), card({ name: 'One' }), B),
      registered(361190, addr(2), 'https://termix.ai/a/361190.json', B + 5),
      registered(361000, addr(3), 'https://termix.ai/old.json', B - 1),
    ]);
    expect([...changed].sort()).toEqual([361189, 361190]);
    expect(regs.get(361189)).toEqual({
      agent_id: 361189,
      owner: addr(1),
      agent_wallet: null,
      agent_uri: card({ name: 'One' }),
      name: 'One',
      marketplace: 'other',
      registered_block: B,
      registered_at: null,
    });
    expect(regs.get(361190)?.marketplace).toBe('termix');
    expect(regs.has(361000)).toBe(false);
  });

  it('applies URI updates, transfers and agent-wallet changes in block order, for known agents only', () => {
    const regs = new Map<number, AgentRegistration>();
    // A registering tx emits Transfer (mint), Registered, then MetadataSet("agentWallet").
    const logs = [
      log(REGISTRY, [ERC721_TRANSFER_TOPIC, topic(ZERO), topic(addr(1)), topic(5)], '0x', B + 1),
      registered(5, addr(1), '', B + 1),
      walletSet(5, addr(0xa1), B + 1),
      log(REGISTRY, [URI_UPDATED_TOPIC, topic(5), topic(addr(1))], encodeAbiParameters([{ type: 'string' }], ['https://dolphinamp.xyz/a/5']), B + 2),
      log(REGISTRY, [ERC721_TRANSFER_TOPIC, topic(addr(1)), topic(addr(9)), topic(5)], '0x', B + 3),
      walletSet(5, null, B + 3),
      log(REGISTRY, [ERC721_TRANSFER_TOPIC, topic(addr(1)), topic(addr(9)), topic(77)], '0x', B + 3),
      log(REGISTRY, [METADATA_SET_TOPIC, topic(5), keccak256(toHex('platform'))], encodeAbiParameters([{ type: 'string' }, { type: 'bytes' }], ['platform', toHex('EvoEvo')]), B + 4),
    ];
    // Logs arrive in chunk order, not block order (planLogChunks walks backwards).
    applyRegistryLogs(regs, [...logs].reverse());
    // The transfer empties the agent wallet (the registry emits MetadataSet with empty bytes).
    const r = regs.get(5)!;
    expect(r.marketplace).toBe('dolphin');
    expect(r.agent_uri).toBe('https://dolphinamp.xyz/a/5');
    expect(r.owner).toBe(addr(9));
    expect(r.agent_wallet).toBeNull();
    expect(regs.has(77)).toBe(false);
  });

  it('keeps the agent wallet set at registration', () => {
    const regs = new Map<number, AgentRegistration>();
    applyRegistryLogs(regs, [registered(6, addr(1), '', B + 1), walletSet(6, addr(0xb2), B + 1)]);
    expect(regs.get(6)?.agent_wallet).toBe(addr(0xb2));
    expect(regs.get(6)?.marketplace).toBe('none');
  });

  it('ignores registrations after the campaign\'s last block, but keeps updating the agents it has', () => {
    const regs = new Map<number, AgentRegistration>();
    applyRegistryLogs(
      regs,
      [
        registered(8, addr(1), '', B + 100),
        registered(9, addr(2), '', B + 200),
        log(REGISTRY, [ERC721_TRANSFER_TOPIC, topic(addr(1)), topic(addr(3)), topic(8)], '0x', B + 300),
      ],
      { lastBlock: B + 150 },
    );
    expect([...regs.keys()]).toEqual([8]);
    expect(regs.get(8)?.owner).toBe(addr(3));
  });

  it('stores at most 256 characters of a long agentURI but classifies the whole of it', () => {
    const regs = new Map<number, AgentRegistration>();
    applyRegistryLogs(regs, [registered(7, addr(1), 'https://x.example/' + 'a'.repeat(400) + 'termix')]);
    expect(regs.get(7)?.agent_uri).toHaveLength(256);
    expect(regs.get(7)?.marketplace).toBe('termix');
  });
});

describe('applyHireLogs', () => {
  const campaign = new Set([361189, 361190]);
  const isCampaignAgent = (id: number) => campaign.has(id);

  it('keeps TermiX orders for campaign agents and every ERC-8183 job, as hire events', () => {
    const { hires } = applyHireLogs({
      logs: [
        orderCreated(1, addr(0x11), 361189, B + 20),
        orderCreated(2, addr(0x12), 1234, B + 21),
        jobCreated(56900, addr(0x13), addr(0xaa), B + 22),
        orderCreated(3, addr(0x14), 361190, B - 5),
      ],
      isCampaignAgent,
      knownJobs: new Set(),
    });
    expect(hires).toHaveLength(2);
    expect(hires[0]).toMatchObject({
      source: 'termix_escrow',
      hirer: addr(0x11),
      block: B + 20,
      contract: ESCROW,
      job: topic(1),
      agent_id: 361189,
      provider: null,
    });
    expect(hires[1]).toMatchObject({ source: 'erc8183_shared', hirer: addr(0x13), contract: KERNEL, job: topic(56900), agent_id: null, provider: addr(0xaa) });
  });

  it('records a completion for a tracked hire, including one created in an earlier run, and ignores the rest', () => {
    const { completions } = applyHireLogs({
      logs: [
        orderSettled(1, B + 40),
        orderCreated(1, addr(0x11), 361189, B + 20),
        orderSettled(99, B + 41),
        jobCompleted(56900, B + 42),
        jobCompleted(56000, B + 43),
      ],
      isCampaignAgent,
      knownJobs: new Set([jobKey(KERNEL, topic(56900))]),
    });
    expect(completions.sort()).toEqual([jobKey(ESCROW, topic(1)), jobKey(KERNEL, topic(56900))].sort());
  });
});

// ─── Board assembly ───────────────────────────────────────────────────────────

const reg = (id: number, over: Partial<AgentRegistration> = {}): AgentRegistration => ({
  agent_id: id,
  owner: addr(id),
  agent_wallet: addr(id),
  agent_uri: 'https://termix.ai/a.json',
  name: null,
  marketplace: 'termix',
  registered_block: B + id,
  registered_at: '2026-10-02T00:00:00.000Z',
  ...over,
});
let txn = 0;
const termixHire = (agentId: number, hirer: string, order = ++txn): BoardHire => ({
  source: 'termix_escrow',
  hirer,
  block: B + 100 + order,
  tx: `0xh${order}`,
  log_index: 0,
  contract: ESCROW,
  job: topic(order),
  agent_id: agentId,
  provider: null,
});
const kernelHire = (provider: string, hirer: string, job = ++txn): BoardHire => ({
  source: 'erc8183_shared',
  hirer,
  block: B + 100 + job,
  tx: `0xk${job}`,
  log_index: 1,
  contract: KERNEL,
  job: topic(job),
  agent_id: null,
  provider,
});

describe('hiresByAgent', () => {
  it('counts TermiX hires by agent id and ERC-8183 hires for every listed agent the provider owns or uses as its agent wallet', () => {
    const regs = new Map([
      [1, reg(1, { owner: addr(0xa0), agent_wallet: addr(0xa0) })],
      [2, reg(2, { owner: addr(0xa0), agent_wallet: addr(0xa0) })],
      [3, reg(3, { owner: addr(0xb0), agent_wallet: addr(0xb1) })],
    ]);
    const settled = termixHire(1, addr(0x11));
    const hires = [settled, termixHire(1, addr(0x11)), termixHire(9, addr(0x12)), kernelHire(addr(0xa0), addr(0x13)), kernelHire(addr(0xb1), addr(0x14))];
    const stats = hiresByAgent(regs, hires, new Set([jobKey(settled.contract, settled.job)]));
    expect(stats.get(1)).toMatchObject({ hires_total: 3, completed: 1, distinct_hirers: 2, by_source: { termix_escrow: 2, erc8183_shared: 1 } });
    expect(stats.get(2)).toMatchObject({ hires_total: 1, completed: 0, distinct_hirers: 1 });
    expect(stats.get(3)).toMatchObject({ hires_total: 1, distinct_hirers: 1, by_source: { termix_escrow: 0, erc8183_shared: 1 } });
    expect(stats.has(9)).toBe(false);
  });
});

describe('assembleSetAndEarnBoard', () => {
  const asOf = { block: B + 900_000, time: '2026-10-05T21:00:00.000Z' };
  const summary = (independent: number, linked = 0, inconclusive = 0) => ({
    owner_linked: linked,
    inconclusive,
    independent_within_limits: independent,
    passes_three_independent: independent >= 3,
  });

  it('lists hired agents by hires then id, with verdict columns per status, and totals over every agent', () => {
    const regs = new Map([
      [10, reg(10, { name: 'Ten' })],
      [11, reg(11, { marketplace: 'dolphin' })],
      [12, reg(12, { marketplace: 'other' })],
      [13, reg(13, { marketplace: 'none' })],
      [14, reg(14)],
    ]);
    const hires = [
      ...[0x21, 0x22, 0x23].map((h) => termixHire(10, addr(h))),
      ...[0x31, 0x32, 0x33].map((h) => termixHire(11, addr(h))),
      termixHire(12, addr(0x41)),
      termixHire(12, addr(0x41)),
      termixHire(14, addr(0x51)),
      termixHire(14, addr(0x52)),
      termixHire(14, addr(0x53)),
    ];
    const verdicts = new Map<number, AgentVerdict>([
      [10, { status: 'checked', summary: summary(3), checked_at: '2026-10-05T21:05:00.000Z' }],
      [11, { status: 'checked', summary: summary(1, 2), checked_at: '2026-10-05T21:06:00.000Z' }],
      [14, { status: 'error', summary: null, checked_at: null }],
    ]);
    const board = assembleSetAndEarnBoard({ registrations: regs, hires, completions: new Set(), verdicts, asOf, generatedAt: '2026-10-05T21:10:00.000Z' });

    expect(board.window).toEqual({ from_block: B, start: '2026-10-01T00:00:00Z', end: '2026-11-05T23:59:59Z' });
    expect(board.as_of).toEqual(asOf);
    expect(board.rows.map((r) => r.agent_id)).toEqual([10, 11, 14, 12]);
    expect(board.rows[0]).toEqual({
      agent_id: 10,
      name: 'Ten',
      owner: addr(10),
      marketplace: 'termix',
      registered_at: '2026-10-02T00:00:00.000Z',
      hires_total: 3,
      completed: 0,
      distinct_hirers: 3,
      by_source: { termix_escrow: 3, erc8183_shared: 0 },
      verdict_status: 'checked',
      owner_linked: 0,
      independent_within_limits: 3,
      inconclusive: 0,
      passes_three_independent: true,
      checked_at: '2026-10-05T21:05:00.000Z',
    });
    expect(board.rows[1]).toMatchObject({ verdict_status: 'checked', owner_linked: 2, passes_three_independent: false });
    expect(board.rows[2]).toMatchObject({ verdict_status: 'error', owner_linked: null, independent_within_limits: null, passes_three_independent: null, checked_at: null });
    expect(board.rows[3]).toMatchObject({
      agent_id: 12,
      hires_total: 2,
      distinct_hirers: 1,
      verdict_status: 'fewer_than_3_hirers',
      owner_linked: null,
      passes_three_independent: false,
    });
    expect(board.totals).toEqual({
      agents_registered: 5,
      agents_on_campaign_marketplaces: 3,
      agents_with_hires: 4,
      hires: { total: 11, by_source: { termix_escrow: 11, erc8183_shared: 0 } },
      agents_with_3_distinct_hirers: 3,
      agents_passing: 1,
    });
  });

  it('marks an agent with 3+ distinct hirers and no verdict yet as pending', () => {
    const regs = new Map([[10, reg(10)]]);
    const hires = [0x21, 0x22, 0x23].map((h) => termixHire(10, addr(h)));
    const board = assembleSetAndEarnBoard({ registrations: regs, hires, completions: new Set(), verdicts: new Map(), asOf, generatedAt: 'g' });
    expect(board.rows[0]).toMatchObject({ verdict_status: 'pending', passes_three_independent: null });
  });

  it('counts an ERC-8183 hire once in the totals even when it counts for several of the provider\'s agents', () => {
    const regs = new Map([
      [1, reg(1, { owner: addr(0xa0), agent_wallet: null })],
      [2, reg(2, { owner: addr(0xa0), agent_wallet: null })],
    ]);
    const board = assembleSetAndEarnBoard({
      registrations: regs,
      hires: [kernelHire(addr(0xa0), addr(0x13)), kernelHire(addr(0xff), addr(0x14))],
      completions: new Set(),
      verdicts: new Map(),
      asOf,
      generatedAt: 'g',
    });
    expect(board.rows.map((r) => r.hires_total)).toEqual([1, 1]);
    expect(board.totals.hires).toEqual({ total: 1, by_source: { termix_escrow: 0, erc8183_shared: 1 } });
    expect(board.totals.agents_with_hires).toBe(2);
  });

  it(`caps the rows at ${BOARD_MAX_ROWS} while the totals cover every agent`, () => {
    const regs = new Map<number, AgentRegistration>();
    const hires: BoardHire[] = [];
    for (let id = 1; id <= 4; id++) {
      regs.set(id, reg(id));
      hires.push(termixHire(id, addr(0x100 + id)));
    }
    const board = assembleSetAndEarnBoard({ registrations: regs, hires, completions: new Set(), verdicts: new Map(), asOf, generatedAt: 'g', maxRows: 2 });
    expect(board.rows.map((r) => r.agent_id)).toEqual([1, 2]);
    expect(board.totals.agents_with_hires).toBe(4);
  });

  it('carries the hire check\'s limits plus the board\'s own, and a method', () => {
    const board = assembleSetAndEarnBoard({ registrations: new Map(), hires: [], completions: new Set(), verdicts: new Map(), asOf, generatedAt: 'g' });
    expect(board.limits).toEqual(SET_AND_EARN_BOARD_LIMITS);
    for (const l of HIRE_LIMITS) expect(board.limits).toContain(l);
    expect(board.limits.join(' ')).toMatch(/addresses, not people/);
    expect(board.limits.join(' ')).toMatch(/never a safety verdict/i);
    expect(board.method).toMatch(/125,000,755/);
    expect(board.rows).toEqual([]);
    expect(board.generated_at).toBe('g');
  });
});
