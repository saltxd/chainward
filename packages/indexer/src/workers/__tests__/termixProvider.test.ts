import { beforeEach, describe, expect, it, vi } from 'vitest';

// The TermiX provider worker against a fake TermiX backend, a fake BNB Chain
// signer and an in-memory Redis. No network. The fake backend plays TermiX's
// indexer: an order moves PENDING_ACCEPT -> IN_PROGRESS -> DELIVERED -> SETTLED
// only once the matching transaction has "mined", as on the real platform.

vi.mock('../../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
const queue = vi.hoisted(() => ({
  add: vi.fn(async (..._args: unknown[]) => ({})),
  getRepeatableJobs: vi.fn(async () => [{ key: 'old-repeat' }]),
  removeRepeatableByKey: vi.fn(async (_key: string) => true),
  close: vi.fn(async () => undefined),
}));
vi.mock('bullmq', () => ({
  Queue: vi.fn(function Queue() {
    return queue;
  }),
  Worker: vi.fn(),
}));

import { HIRE_LIMITS, HIRE_METHOD, HireCheckError, type HireAgentInput, type HireReport } from '@chainward/decode';
import { TERMIX_SELECTORS, type TermixOrder } from '@chainward/common';
import type Redis from 'ioredis';
import {
  TERMIX_ORDER_KEY,
  redisStore,
  runTermixProvider,
  setupTermixProviderSchedule,
  termixProviderConfig,
  type TermixProviderDeps,
} from '../termixProvider.js';
import { hireSummary } from '../../lib/termixDeliverable.js';

const OUR_WALLET = '0xf7ee65130fb2b3bb42cc5cbfed085d7d482667cd';
const AGENT_CUID = 'cmuy3jo13xl0ozw01mxvtcpj6';
const USDT_ESCROW = '0xCE02f987D8b8AF694E13C8a843Db9c77caBF544c';
const BUYER = { id: 'cmbuyeraccount01', walletAddress: '0x730641307e973bc9ac0fcf65275d7d8cce0a2873', handle: 'user-0a2873' };
const KEY = '11'.repeat(32);

// ─── In-memory Redis (get / set with EX, PX, NX / del) ────────────────────────

class FakeRedis {
  strings = new Map<string, string>();
  async get(k: string) {
    return this.strings.get(k) ?? null;
  }
  async set(k: string, v: string, ...args: Array<string | number>) {
    if (args.includes('NX') && this.strings.has(k)) return null;
    this.strings.set(k, v);
    return 'OK';
  }
  async del(k: string) {
    return this.strings.delete(k) ? 1 : 0;
  }
}

// ─── Fake TermiX backend + chain ──────────────────────────────────────────────

const chainOrderId = (n: number) => `0x${n.toString(16).padStart(64, '0')}`;

interface FakeOrder extends TermixOrder {
  messages: Array<Record<string, unknown>>;
  artifacts: Array<{ id: string; sha256: string }>;
}

function makeOrder(n: number, overrides: Partial<FakeOrder> = {}): FakeOrder {
  return {
    id: `order${n}`,
    chainOrderId: chainOrderId(n),
    escrowContract: USDT_ESCROW,
    status: 'PENDING_ACCEPT',
    budget: '0.25',
    currency: 'USDT',
    listingId: 'listing1',
    redoUsed: false,
    deliveryHash: null,
    deadlines: { deliveryDueAt: '2026-10-08T12:00:00.000Z', challengeWindowEndsAt: '2026-10-09T12:00:00.000Z' },
    conversationId: `conv${n}`,
    buyer: BUYER,
    seller: { id: AGENT_CUID, agentTokenId: '365669', handle: '365669' },
    listing: { id: 'listing1', skillTag: 'set-and-earn-hire-check', title: 'Set and Earn hire check' },
    availableActions: {},
    createdAt: `2026-10-07T10:0${n}:00.000Z`,
    messages: [],
    artifacts: [],
    ...overrides,
  };
}

const buyerSays = (text: string, at = '2026-10-07T10:00:30.000Z') => ({
  id: `m-${text.length}-${at}`,
  kind: 'TEXT',
  text,
  createdAt: at,
  from: { accountId: BUYER.id, walletAddress: BUYER.walletAddress, handle: BUYER.handle },
});

function hireReport(target: HireAgentInput): HireReport {
  const id = target.kind === 'id' ? target.id : 1;
  return {
    chain: 'bsc',
    agent_id: id,
    agent_ids: [id],
    owner: '0x15d08640aeefbdce11930d9c9a30884011f654f6',
    agent_wallet: null,
    window_days: 30,
    hires: { total: 4, distinct_hirers: 3, by_source: { termix_escrow: 4, erc8183_shared: 0 } },
    hirers: [],
    summary: { owner_linked: 0, inconclusive: 0, independent_within_limits: 3, passes_three_independent: true },
    method: HIRE_METHOD,
    limits: HIRE_LIMITS,
    as_of: { block: 126_000_000, time: '2026-10-07T12:00:00.000Z' },
  };
}

function world(orders: FakeOrder[]) {
  const byId = new Map(orders.map((o) => [o.id, o]));
  const sent: Array<{ to: string; data: string; hash: string }> = [];
  const receipts = new Map<string, 'success' | 'reverted' | 'pending'>();
  /** What a mined tx does to the order once TermiX's indexer sees it. */
  const effects = new Map<string, () => void>();
  let txn = 0;
  let artifactN = 0;
  const intentOverride: { accept?: Record<string, unknown> } = {};

  const intent = (action: keyof typeof TERMIX_SELECTORS, o: FakeOrder, extra = '') => ({
    action,
    chainId: 56,
    contract: USDT_ESCROW,
    callData: `${TERMIX_SELECTORS[action]}${o.chainOrderId!.slice(2)}${extra}`,
    value: '0',
    status: 'PREPARED',
    nonceKey: `${action}-${o.id}`,
  });
  const need = (id: string) => {
    const o = byId.get(id);
    if (!o) throw Object.assign(new Error('not found'), { status: 404 });
    return o;
  };
  const view = (o: FakeOrder): TermixOrder => {
    const { messages: _m, artifacts: _a, ...rest } = o;
    return structuredClone(rest);
  };

  const api = {
    walletAddress: OUR_WALLET,
    contractsConfig: vi.fn(async () => ({
      chainId: 56,
      protocolFeeBps: 200,
      settlementCurrencies: [
        { symbol: 'USDC', decimals: 18, address: '0x8AC7', protocolFeeBps: 200, providerLockBps: 0, contracts: { escrow: '0x6A52ba4C84b348FaEAe13dDC7A97b4F6af23913C', staking: '0x', campaignVault: '0x' } },
        { symbol: 'USDT', decimals: 18, address: '0x55d3', protocolFeeBps: 200, providerLockBps: 0, contracts: { escrow: USDT_ESCROW, staking: '0x', campaignVault: '0x' } },
      ],
    })),
    agentByHandle: vi.fn(async (_h: string) => ({ seller: { id: AGENT_CUID, agentTokenId: '365669', ownerAddress: '0xf7Ee65130Fb2B3bb42Cc5cbFED085d7D482667cD' } })),
    providerOrders: vi.fn(async (_q: { providerAgentId: string; page?: number; pageSize?: number }) => ({
      items: [...byId.values()].map(view),
      page: 1,
      totalPages: 1,
    })),
    order: vi.fn(async (id: string) => view(need(id))),
    conversationMessages: vi.fn(async (convId: string) => ({ items: [...byId.values()].find((o) => o.conversationId === convId)?.messages ?? [] })),
    sendMessage: vi.fn(async (convId: string, text: string, from: string) => {
      const o = [...byId.values()].find((x) => x.conversationId === convId)!;
      o.messages.push({ id: `ours-${o.messages.length}`, kind: 'TEXT', text, fromProviderAgentId: from, from: { accountId: 'our-account', walletAddress: OUR_WALLET } });
      return {};
    }),
    prepareProviderAccept: vi.fn(async (id: string) => intentOverride.accept ?? intent('acceptOrder', need(id))),
    deliveryUploadUrl: vi.fn(async (id: string, f: { fileName: string }) => ({
      uploadUrl: `https://s3.example/put/${id}/${f.fileName}`,
      s3Key: `orders/${id}/${f.fileName}`,
      publicUrl: `https://cdn.example/${id}/${f.fileName}`,
    })),
    putUpload: vi.fn(async (..._args: unknown[]) => undefined),
    deliveryArtifacts: vi.fn(async (id: string) => ({ items: need(id).artifacts })),
    registerArtifact: vi.fn(async (id: string, a: { sha256: string }) => {
      const art = { id: `art${++artifactN}`, sha256: a.sha256 };
      need(id).artifacts.push(art);
      return { id: art.id };
    }),
    prepareSubmitDelivery: vi.fn(async (id: string, _b: { artifactIds: string[]; note?: string }) => intent('submitDelivery', need(id), 'cd'.repeat(32))),
    prepareClaimAfterTimeout: vi.fn(async (id: string) => intent('claimAfterTimeout', need(id))),
  };

  const chain = {
    address: OUR_WALLET,
    balanceWei: vi.fn(async () => 1_667_296_792_558_605n),
    gasPriceWei: vi.fn(async () => 60_000_000n),
    send: vi.fn(async (tx: { to: string; data: string }) => {
      const hash = `0x${(++txn).toString(16).padStart(64, '0')}`;
      sent.push({ ...tx, hash });
      receipts.set(hash, 'success');
      const order = [...byId.values()].find((o) => tx.data.includes(o.chainOrderId!.slice(2)))!;
      if (tx.data.startsWith(TERMIX_SELECTORS.acceptOrder)) effects.set(hash, () => (order.status = 'IN_PROGRESS'));
      if (tx.data.startsWith(TERMIX_SELECTORS.submitDelivery)) effects.set(hash, () => ((order.status = 'DELIVERED'), (order.deliveryHash = '0xcd')));
      if (tx.data.startsWith(TERMIX_SELECTORS.claimAfterTimeout)) effects.set(hash, () => (order.status = 'SETTLED'));
      return hash as `0x${string}`;
    }),
    receipt: vi.fn(async (hash: string) => {
      const r = receipts.get(hash) ?? 'pending';
      if (r === 'success') {
        effects.get(hash)?.();
        effects.delete(hash);
      }
      return r;
    }),
  };

  const runHireCheck = vi.fn(async (t: HireAgentInput) => hireReport(t));
  return { byId, api, chain, runHireCheck, sent, receipts, effects, intentOverride };
}

type World = ReturnType<typeof world>;
let redis: FakeRedis;

function deps(w: World, overrides: Partial<TermixProviderDeps> = {}): TermixProviderDeps {
  return {
    api: w.api,
    chain: w.chain,
    runHireCheck: w.runHireCheck,
    store: redisStore(redis as unknown as Redis),
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    now: () => new Date('2026-10-07T12:00:00.000Z'),
    sleep: async () => undefined,
    agentTokenId: '365669',
    maxJobsPerRun: 3,
    ...overrides,
  };
}

const sentActions = (w: World) =>
  w.sent.map((s) => (Object.entries(TERMIX_SELECTORS).find(([, sel]) => s.data.startsWith(sel)) ?? ['?'])[0]);

beforeEach(() => {
  redis = new FakeRedis();
  vi.clearAllMocks();
});

// ─── config + schedule ────────────────────────────────────────────────────────

describe('termixProviderConfig', () => {
  const alchemy = { SELLER_DEMAND_RPC_URL: 'https://base-mainnet.g.alchemy.com/v2/k' };

  it('is off unless TERMIX_PROVIDER_ENABLED=true', () => {
    expect(termixProviderConfig({ ...alchemy, TERMIX_PROVIDER_PRIVATE_KEY: KEY })).toMatchObject({ enabled: false, reason: expect.stringMatching(/TERMIX_PROVIDER_ENABLED/) });
  });

  it('is off without a signing key, and never echoes a bad key', () => {
    const r = termixProviderConfig({ ...alchemy, TERMIX_PROVIDER_ENABLED: 'true', TERMIX_PROVIDER_PRIVATE_KEY: 'zz-not-a-key-zz' });
    expect(r).toMatchObject({ enabled: false, reason: expect.stringMatching(/TERMIX_PROVIDER_PRIVATE_KEY/) });
    expect(JSON.stringify(r)).not.toContain('zz-not-a-key-zz');
    expect(termixProviderConfig({ ...alchemy, TERMIX_PROVIDER_ENABLED: 'true' }).enabled).toBe(false);
  });

  it('is off without the Alchemy BNB RPC the hire check needs', () => {
    expect(termixProviderConfig({ TERMIX_PROVIDER_ENABLED: 'true', TERMIX_PROVIDER_PRIVATE_KEY: KEY })).toMatchObject({
      enabled: false,
      reason: expect.stringMatching(/Alchemy/),
    });
  });

  it('is on with the flag, a key and the RPC, with bounded defaults', () => {
    const r = termixProviderConfig({ ...alchemy, TERMIX_PROVIDER_ENABLED: 'true', TERMIX_PROVIDER_PRIVATE_KEY: `"0x${KEY}"` });
    expect(r.enabled).toBe(true);
    if (!r.enabled) return;
    expect(r.config.privateKey).toBe(`0x${KEY}`);
    expect(r.config.agentTokenId).toBe('365669');
    expect(r.config.maxJobsPerRun).toBe(3);
    expect(r.config.alchemyUrl).toBe('https://bnb-mainnet.g.alchemy.com/v2/k');
    expect(termixProviderConfig({ ...alchemy, TERMIX_PROVIDER_ENABLED: 'true', TERMIX_PROVIDER_PRIVATE_KEY: KEY, TERMIX_MAX_JOBS_PER_RUN: '500' })).toMatchObject({
      config: { maxJobsPerRun: 10 },
    });
  });
});

describe('setupTermixProviderSchedule', () => {
  it('repeats every 2 minutes when enabled', async () => {
    await setupTermixProviderSchedule(redis as unknown as Redis, {
      TERMIX_PROVIDER_ENABLED: 'true',
      TERMIX_PROVIDER_PRIVATE_KEY: KEY,
      SELLER_DEMAND_RPC_URL: 'https://base-mainnet.g.alchemy.com/v2/k',
    });
    expect(queue.removeRepeatableByKey).toHaveBeenCalledWith('old-repeat');
    expect(queue.add).toHaveBeenCalledWith('termix-provider', {}, expect.objectContaining({ repeat: { every: 120_000 } }));
  });

  it('clears the schedule and adds nothing when disabled', async () => {
    await setupTermixProviderSchedule(redis as unknown as Redis, {});
    expect(queue.removeRepeatableByKey).toHaveBeenCalledWith('old-repeat');
    expect(queue.add).not.toHaveBeenCalled();
  });
});

// ─── job lifecycle ────────────────────────────────────────────────────────────

describe('runTermixProvider', () => {
  it('checks, accepts, delivers and messages an order whose note names an agent', async () => {
    const w = world([makeOrder(1, { messages: [buyerSays('please check agent 332962')] })]);
    const summary = await runTermixProvider(deps(w));

    expect(w.runHireCheck).toHaveBeenCalledWith({ kind: 'id', id: 332962 });
    expect(sentActions(w)).toEqual(['acceptOrder', 'submitDelivery']);
    expect(w.byId.get('order1')!.status).toBe('DELIVERED');
    // Both files uploaded and registered, then submitted by id with the summary as the note.
    expect(w.api.putUpload).toHaveBeenCalledTimes(2);
    const submit = w.api.prepareSubmitDelivery.mock.calls[0]!;
    expect(submit[1].artifactIds).toEqual(['art1', 'art2']);
    expect(submit[1].note).toBe(hireSummary(hireReport({ kind: 'id', id: 332962 })));
    // The buyer gets the summary in the thread.
    const ours = w.byId.get('order1')!.messages.filter((m) => m.fromProviderAgentId === AGENT_CUID);
    expect(ours).toHaveLength(1);
    expect(String(ours[0]!.text)).toContain('Not a safety verdict');
    expect(summary).toMatchObject({ accepted: 1, delivered: 1, errors: 0 });
  });

  it('never delivers twice: a second run does nothing on a delivered order', async () => {
    const w = world([makeOrder(1, { messages: [buyerSays('#332962')] })]);
    await runTermixProvider(deps(w));
    vi.clearAllMocks();
    await runTermixProvider(deps(w));
    expect(w.chain.send).not.toHaveBeenCalled();
    expect(w.api.registerArtifact).not.toHaveBeenCalled();
    expect(w.api.sendMessage).not.toHaveBeenCalled();
  });

  it('asks once for input, accepts nothing, and delivers after the buyer replies', async () => {
    const w = world([makeOrder(1)]);
    const first = await runTermixProvider(deps(w));
    expect(w.chain.send).not.toHaveBeenCalled();
    expect(w.runHireCheck).not.toHaveBeenCalled();
    expect(w.api.sendMessage).toHaveBeenCalledTimes(1);
    expect(w.api.sendMessage.mock.calls[0]![1]).toMatch(/agent id/);
    expect(first).toMatchObject({ waiting_input: 1, accepted: 0 });

    await runTermixProvider(deps(w));
    expect(w.api.sendMessage).toHaveBeenCalledTimes(1);

    w.byId.get('order1')!.messages.push(buyerSays('0x15d08640aeefbdce11930d9c9a30884011f654f6', '2026-10-07T11:00:00.000Z'));
    await runTermixProvider(deps(w));
    expect(w.runHireCheck).toHaveBeenCalledWith({ kind: 'owner', address: '0x15d08640aeefbdce11930d9c9a30884011f654f6' });
    expect(sentActions(w)).toEqual(['acceptOrder', 'submitDelivery']);
  });

  it('reads only what the buyer wrote, not our own messages or the listing copy', async () => {
    const w = world([
      makeOrder(1, {
        scope: 'Send an ERC-8004 agent id on BNB Chain (for example 361259)',
        messages: [{ id: 'sys', kind: 'TEXT', text: 'agent 361259', from: { accountId: 'our-account', walletAddress: OUR_WALLET } }],
      }),
    ]);
    await runTermixProvider(deps(w));
    expect(w.runHireCheck).not.toHaveBeenCalled();
    expect(w.chain.send).not.toHaveBeenCalled();
  });

  it('refuses an agent that does not exist, with a message, and never accepts it', async () => {
    const w = world([makeOrder(1, { messages: [buyerSays('agent 999999999')] })]);
    w.runHireCheck.mockRejectedValue(new HireCheckError('AGENT_NOT_FOUND', 'No ERC-8004 agent #999999999 on BNB Chain'));
    const summary = await runTermixProvider(deps(w));
    expect(w.chain.send).not.toHaveBeenCalled();
    expect(w.api.sendMessage.mock.calls[0]![1]).toMatch(/No ERC-8004 agent #999999999 on BNB Chain/);
    expect(summary).toMatchObject({ refused: 1 });

    await runTermixProvider(deps(w));
    expect(w.runHireCheck).toHaveBeenCalledTimes(1);
    expect(w.api.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('leaves the order unaccepted when the check fails, and retries next run', async () => {
    const w = world([makeOrder(1, { messages: [buyerSays('agent 332962')] })]);
    w.runHireCheck.mockRejectedValueOnce(new Error('alchemy 429'));
    const first = await runTermixProvider(deps(w));
    expect(w.chain.send).not.toHaveBeenCalled();
    expect(first).toMatchObject({ errors: 1, accepted: 0 });
    expect(JSON.parse((await redis.get(TERMIX_ORDER_KEY('order1')))!)).toMatchObject({ attempts: 1, lastError: expect.stringContaining('alchemy 429') });

    await runTermixProvider(deps(w));
    expect(sentActions(w)).toEqual(['acceptOrder', 'submitDelivery']);
  });

  it('does not re-send an accept that is still pending, and delivers once it lands', async () => {
    const w = world([makeOrder(1, { messages: [buyerSays('agent 332962')] })]);
    w.chain.receipt.mockResolvedValue('pending');
    await runTermixProvider(deps(w));
    expect(sentActions(w)).toEqual(['acceptOrder']);

    await runTermixProvider(deps(w));
    expect(sentActions(w)).toEqual(['acceptOrder']);

    w.chain.receipt.mockImplementation(async (hash: string) => {
      w.effects.get(hash)?.();
      w.effects.delete(hash);
      return 'success';
    });
    await runTermixProvider(deps(w));
    expect(sentActions(w)).toEqual(['acceptOrder', 'submitDelivery']);
    expect(w.byId.get('order1')!.status).toBe('DELIVERED');
  });

  it('does not re-submit when TermiX has not indexed a mined delivery yet', async () => {
    const w = world([makeOrder(1, { messages: [buyerSays('agent 332962')] })]);
    // The submit mines, but TermiX's indexer lags: the order stays IN_PROGRESS.
    w.chain.send.mockImplementationOnce(async (tx) => {
      w.sent.push({ ...tx, hash: '0xaccept' });
      w.receipts.set('0xaccept', 'success');
      w.effects.set('0xaccept', () => (w.byId.get('order1')!.status = 'IN_PROGRESS'));
      return '0xaccept';
    });
    w.chain.send.mockImplementationOnce(async (tx) => {
      w.sent.push({ ...tx, hash: '0xsubmit' });
      w.receipts.set('0xsubmit', 'success');
      return '0xsubmit';
    });
    await runTermixProvider(deps(w));
    expect(w.byId.get('order1')!.status).toBe('IN_PROGRESS');
    await runTermixProvider(deps(w));
    await runTermixProvider(deps(w));
    expect(sentActions(w)).toEqual(['acceptOrder', 'submitDelivery']);
  });

  it('claims a delivered order once the challenge window has passed, and not before', async () => {
    const w = world([makeOrder(1, { status: 'DELIVERED', deliveryHash: '0xcd' })]);
    await runTermixProvider(deps(w));
    expect(w.chain.send).not.toHaveBeenCalled();

    const later = () => new Date('2026-10-09T12:05:00.000Z');
    const summary = await runTermixProvider(deps(w, { now: later }));
    expect(sentActions(w)).toEqual(['claimAfterTimeout']);
    expect(summary).toMatchObject({ claimed: 1 });
    expect(w.byId.get('order1')!.status).toBe('SETTLED');

    await runTermixProvider(deps(w, { now: later }));
    expect(sentActions(w)).toEqual(['claimAfterTimeout']);
  });

  it('handles at most maxJobsPerRun orders a run, oldest first', async () => {
    const w = world([1, 2, 3, 4, 5].map((n) => makeOrder(n, { messages: [buyerSays(`agent ${330000 + n}`)] })));
    await runTermixProvider(deps(w, { maxJobsPerRun: 2 }));
    expect(w.runHireCheck.mock.calls.map((c) => c[0])).toEqual([
      { kind: 'id', id: 330001 },
      { kind: 'id', id: 330002 },
    ]);
    expect(sentActions(w).filter((a) => a === 'submitDelivery')).toHaveLength(2);
  });

  it('refuses to sign an intent that is not the call it asked for', async () => {
    const w = world([makeOrder(1, { messages: [buyerSays('agent 332962')] })]);
    w.intentOverride.accept = { action: 'acceptOrder', chainId: 56, contract: USDT_ESCROW, callData: `0x095ea7b3${'00'.repeat(64)}`, value: '0' };
    const summary = await runTermixProvider(deps(w));
    expect(w.chain.send).not.toHaveBeenCalled();
    expect(summary).toMatchObject({ errors: 1, accepted: 0 });
  });

  it('does not accept when the wallet cannot pay the gas to deliver and claim', async () => {
    const w = world([makeOrder(1, { messages: [buyerSays('agent 332962')] })]);
    w.chain.balanceWei.mockResolvedValue(1_000_000_000n);
    await runTermixProvider(deps(w));
    expect(w.chain.send).not.toHaveBeenCalled();
  });

  it('stops before touching orders when the key does not own the agent', async () => {
    const w = world([makeOrder(1, { messages: [buyerSays('agent 332962')] })]);
    w.api.agentByHandle.mockResolvedValue({ seller: { id: AGENT_CUID, agentTokenId: '365669', ownerAddress: '0x000000000000000000000000000000000000dEaD' } });
    await expect(runTermixProvider(deps(w))).rejects.toThrow(/does not own agent 365669/);
    expect(w.api.providerOrders).not.toHaveBeenCalled();
  });

  it('re-runs the check and delivers again once after a redo, never a third time', async () => {
    const w = world([makeOrder(1, { messages: [buyerSays('agent 332962')] })]);
    await runTermixProvider(deps(w));
    const o = w.byId.get('order1')!;
    o.status = 'IN_PROGRESS';
    o.redoUsed = true;
    await runTermixProvider(deps(w));
    expect(w.runHireCheck).toHaveBeenCalledTimes(2);
    expect(sentActions(w)).toEqual(['acceptOrder', 'submitDelivery', 'submitDelivery']);
    o.status = 'IN_PROGRESS';
    await runTermixProvider(deps(w));
    expect(sentActions(w)).toEqual(['acceptOrder', 'submitDelivery', 'submitDelivery']);
  });

  it('skips the run while another holds the lock', async () => {
    const w = world([makeOrder(1, { messages: [buyerSays('agent 332962')] })]);
    await redis.set('termix:provider:lock', 'other', 'PX', 600_000, 'NX');
    const summary = await runTermixProvider(deps(w));
    expect(summary).toMatchObject({ skipped: 'locked' });
    expect(w.api.providerOrders).not.toHaveBeenCalled();
  });

  it('ignores orders for another seller', async () => {
    const w = world([makeOrder(1, { seller: { id: 'someone-else' }, messages: [buyerSays('agent 332962')] })]);
    await runTermixProvider(deps(w));
    expect(w.runHireCheck).not.toHaveBeenCalled();
    expect(w.chain.send).not.toHaveBeenCalled();
  });

  it('still messages the summary when the delivery lands a run later', async () => {
    const w = world([makeOrder(1, { messages: [buyerSays('agent 332962')] })]);
    let submitLanded = false;
    w.chain.receipt.mockImplementation(async (hash: string) => {
      const isSubmit = w.sent.find((s) => s.hash === hash)?.data.startsWith(TERMIX_SELECTORS.submitDelivery);
      if (isSubmit && !submitLanded) return 'pending';
      w.effects.get(hash)?.();
      w.effects.delete(hash);
      return 'success';
    });
    await runTermixProvider(deps(w));
    expect(sentActions(w)).toEqual(['acceptOrder', 'submitDelivery']);
    expect(w.api.sendMessage).not.toHaveBeenCalled();

    submitLanded = true;
    await runTermixProvider(deps(w));
    expect(sentActions(w)).toEqual(['acceptOrder', 'submitDelivery']);
    expect(w.api.sendMessage).toHaveBeenCalledTimes(1);
    expect(w.api.sendMessage.mock.calls[0]![1]).toContain('Not a safety verdict');
  });

  it('stops retrying a call that keeps reverting', async () => {
    const w = world([makeOrder(1, { messages: [buyerSays('agent 332962')] })]);
    w.chain.receipt.mockResolvedValue('reverted');
    for (let i = 0; i < 5; i++) await runTermixProvider(deps(w));
    expect(sentActions(w)).toEqual(['acceptOrder', 'acceptOrder']);
  });

  it('does not submit after the delivery deadline has passed', async () => {
    const w = world([makeOrder(1, { status: 'IN_PROGRESS', messages: [buyerSays('agent 332962')] })]);
    await runTermixProvider(deps(w, { now: () => new Date('2026-10-08T12:30:00.000Z') }));
    expect(w.chain.send).not.toHaveBeenCalled();
  });

  it('reads a bounded number of orders a run even when none needs work', async () => {
    const w = world(Array.from({ length: 60 }, (_, i) => makeOrder(i + 1)));
    await runTermixProvider(deps(w, { maxJobsPerRun: 3 }));
    expect(w.api.order.mock.calls.length).toBeLessThanOrEqual(30);
  });
});
