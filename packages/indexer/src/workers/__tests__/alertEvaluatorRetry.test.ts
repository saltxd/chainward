import { beforeEach, describe, expect, it, vi } from 'vitest';
import { agentRegistry, alertConfigs, alertEvents } from '@chainward/db';

// The evaluator claims an alert (an alert_events row plus last_triggered) and
// then queues its delivery. A failure in between used to be caught and logged:
// the job completed, and on any later run the claim and the cooldown both said
// "already fired", so the alert was never delivered. Now the job fails and is
// retried, and the retry queues the delivery of the alert already claimed
// instead of claiming a second one.

interface EventRow {
  timestamp: Date;
  alertConfigId: number;
  severity: string;
  title: string;
  description: string | null;
  triggerValue: string | null;
  triggerTxHash: string | null;
  delivered: boolean;
  deliveryChannel: string | null;
  deliveryError: string | null;
}

const state = {
  configs: [] as Array<Record<string, unknown>>,
  events: [] as EventRow[],
  /** How many of the next claims fail (a deadlock, a dropped connection). */
  claimFailures: 0,
};

const queued: Array<{ name: string; data: Record<string, unknown>; opts?: Record<string, unknown> }> = [];
const queueAdd = vi.fn(async (name: string, data: Record<string, unknown>, opts?: Record<string, unknown>) => {
  queued.push({ name, data, opts });
});

function rowsOf(table: unknown, params: unknown[]): unknown[] {
  if (table === alertConfigs) return state.configs;
  // The evaluator looks events up by (alert config, trigger tx hash).
  if (table === alertEvents) {
    return state.events.filter((e) => params.includes(e.alertConfigId) && params.includes(e.triggerTxHash));
  }
  if (table === agentRegistry) return [{ agentName: 'Swap Agent' }];
  return [];
}

/**
 * Drizzle-shaped select: from(table).where(..).limit(n), awaitable at any step.
 * Events are filtered by the values bound in the WHERE clause; other tables
 * return all their rows, so each test holds only its own configs.
 */
function select() {
  let table: unknown;
  let params: unknown[] = [];
  const rows = () => rowsOf(table, params);
  const query = {
    from(t: unknown) {
      table = t;
      return query;
    },
    where(condition: unknown) {
      params = sqlParams(condition);
      return query;
    },
    orderBy: () => query,
    limit: async () => rows(),
    then: (resolve: (v: unknown[]) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(rows()).then(resolve, reject),
  };
  return query;
}

/** claimAlertEvent's transaction: lock the config, check for a duplicate, insert, set last_triggered. */
async function transaction<T>(fn: (trx: unknown) => Promise<T>): Promise<T> {
  if (state.claimFailures > 0) {
    state.claimFailures--;
    throw new Error('deadlock detected');
  }
  let call = 0;
  let claimedFor: number | undefined;
  const trx = {
    execute: async () => {
      call++;
      if (call === 1) return [{ enabled: true, cooldown_seconds: 300, last_triggered: null }];
      return [];
    },
    insert: () => ({
      values: (v: Omit<EventRow, 'deliveryChannel' | 'deliveryError'>) => ({
        returning: async () => {
          claimedFor = v.alertConfigId;
          state.events.push({ ...v, deliveryChannel: null, deliveryError: null });
          return [{ timestamp: v.timestamp }];
        },
      }),
    }),
    update: () => ({
      set: (v: { lastTriggered: Date }) => ({
        where: async () => {
          const config = state.configs.find((c) => c.id === claimedFor);
          if (config) config.lastTriggered = v.lastTriggered;
        },
      }),
    }),
  };
  return fn(trx);
}

vi.mock('../../lib/db.js', () => ({ getDb: () => ({ select, transaction }) }));
vi.mock('../../lib/redis.js', () => ({ getRedis: () => ({}) }));
vi.mock('../../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../../lib/queue.js', () => ({
  createQueue: () => ({ add: queueAdd, close: async () => undefined }),
}));

import { evaluateTxAlerts, deliveryJobId } from '../alertEvaluator.js';
import { sqlParams } from './sqlParams.js';

const TX_HASH = `0x${'cd'.repeat(32)}`;

function config(id: number, over: Record<string, unknown> = {}) {
  return {
    id,
    userId: 'user-1',
    walletAddress: '0xagent',
    chain: 'base',
    alertType: 'large_transfer',
    thresholdValue: '25',
    thresholdUnit: 'usd',
    lookbackWindow: null,
    channels: ['discord'],
    webhookUrl: null,
    telegramChatId: null,
    discordWebhook: 'https://discord.com/api/webhooks/1/abc',
    enabled: true,
    cooldown: '00:05:00',
    lastTriggered: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

const job = {
  type: 'tx-triggered' as const,
  walletAddress: '0xagent',
  chain: 'base',
  txHash: TX_HASH,
  amountUsd: '500.00',
  gasCostUsd: '0.01',
  status: 'confirmed',
  contractAddress: '0xrouter',
  direction: 'out',
  timestamp: '2026-11-09T12:00:00.000Z',
};

describe('evaluateTxAlerts retries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queued.length = 0;
    state.configs = [config(1)];
    state.events = [];
    state.claimFailures = 0;
  });

  it('fails the job when the delivery cannot be queued after the alert was claimed', async () => {
    queueAdd.mockRejectedValueOnce(new Error('Redis connection lost'));
    await expect(evaluateTxAlerts(job)).rejects.toThrow(/Redis connection lost/);
    expect(state.events).toHaveLength(1);
  });

  it('a retry queues the delivery of the alert the failed attempt claimed, and claims no second alert', async () => {
    queueAdd.mockRejectedValueOnce(new Error('Redis connection lost'));
    await expect(evaluateTxAlerts(job)).rejects.toThrow();

    await evaluateTxAlerts(job);

    expect(state.events).toHaveLength(1);
    expect(queued).toHaveLength(1);
    const event = state.events[0]!;
    expect(queued[0]!.opts?.jobId).toBe(deliveryJobId(1, event.timestamp.toISOString(), TX_HASH));
    expect(queued[0]!.data).toMatchObject({
      alertConfigId: 1,
      eventTimestamp: event.timestamp.toISOString(),
      title: event.title,
      triggerTxHash: TX_HASH,
      triggerValue: 500,
      channels: ['discord'],
    });
  });

  it('queues one alert under one delivery job id however often the evaluation runs', async () => {
    await evaluateTxAlerts(job);
    await evaluateTxAlerts(job); // a rerun before the delivery worker got to it
    expect(state.events).toHaveLength(1);
    const ids = queued.map((q) => q.opts?.jobId);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(1);
  });

  it('does not queue a delivery again once the delivery worker has handled the alert', async () => {
    await evaluateTxAlerts(job);
    state.events[0]!.delivered = true;
    state.events[0]!.deliveryChannel = 'discord';
    queued.length = 0;

    await evaluateTxAlerts(job);
    expect(queued).toEqual([]);
  });

  it('does not queue a delivery again for an alert whose delivery failed with an error recorded', async () => {
    await evaluateTxAlerts(job);
    state.events[0]!.deliveryError = 'webhook: HTTP 404: Not Found';
    queued.length = 0;

    await evaluateTxAlerts(job);
    expect(queued).toEqual([]);
  });

  it('does not queue a delivery again for an alert claimed more than 15 minutes ago', async () => {
    queueAdd.mockRejectedValueOnce(new Error('Redis connection lost'));
    await expect(evaluateTxAlerts(job)).rejects.toThrow();
    state.events[0]!.timestamp = new Date(Date.now() - 16 * 60_000);

    await evaluateTxAlerts(job);
    expect(queued).toEqual([]);
  });

  it('gives two transactions claimed in the same millisecond their own delivery jobs', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-14T00:00:00.000Z'));
    try {
      state.configs = [config(1, { cooldown: '00:00:00' })];
      const otherTx = `0x${'ef'.repeat(32)}`;
      await evaluateTxAlerts(job);
      await evaluateTxAlerts({ ...job, txHash: otherTx });

      expect(state.events.map((e) => e.timestamp.getTime())).toEqual([
        Date.parse('2026-11-14T00:00:00.000Z'),
        Date.parse('2026-11-14T00:00:00.000Z'),
      ]);
      expect(queued.map((q) => q.data.triggerTxHash)).toEqual([TX_HASH, otherTx]);
      expect(new Set(queued.map((q) => q.opts?.jobId)).size).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('queues the delivery with bounded exponential retries', async () => {
    await evaluateTxAlerts(job);
    expect(queued[0]!.opts).toMatchObject({ attempts: 4, backoff: { type: 'exponential' } });
  });

  it('evaluates the other alert configs before failing the job', async () => {
    state.configs = [config(1), config(2)];
    state.claimFailures = 1; // config 1's claim fails
    await expect(evaluateTxAlerts(job)).rejects.toThrow(/deadlock/);
    expect(queued.map((q) => q.data.alertConfigId)).toEqual([2]);
  });

  it('drops a malformed job with a log line instead of retrying it', async () => {
    await expect(evaluateTxAlerts({ ...job, txHash: undefined as unknown as string })).resolves.toBeUndefined();
    await expect(evaluateTxAlerts({ ...job, timestamp: 'not a date' })).resolves.toBeUndefined();
    expect(queued).toEqual([]);
    expect(state.events).toEqual([]);
  });
});
