import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// One alert can go to several channels. When one channel failed and another
// succeeded, the job used to complete: the failed channel was never retried.
// Now a transient failure fails the job so BullMQ retries it, the retry sends
// only to the channels still owed, and a channel that already received the
// alert never receives it twice. A destination that refused the alert for
// good (a blocked address, a 4xx) is not tried again.

const updates: Array<Record<string, unknown>> = [];

vi.mock('../../lib/db.js', () => ({
  getDb: () => ({
    update: () => ({
      set: (v: Record<string, unknown>) => ({
        where: async () => {
          updates.push(v);
        },
      }),
    }),
  }),
}));
vi.mock('../../lib/redis.js', () => ({ getRedis: () => ({}) }));
vi.mock('../../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../../lib/deliveryGuard.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/deliveryGuard.js')>();
  return { ...actual, deliveryFetch: vi.fn() };
});

import { deliverAlert, type DeliveryJobData } from '../alertDelivery.js';
import { BlockedDestinationError, DeliveryHttpError, deliveryFetch } from '../../lib/deliveryGuard.js';

const DISCORD = 'https://discord.com/api/webhooks/1/abc';
const WEBHOOK = 'https://hooks.example.com/alert';

const fetchMock = vi.mocked(deliveryFetch);

/** What each destination does, per call. */
let behaviour: Record<string, () => Promise<void>>;

const sentTo = (url: string) => fetchMock.mock.calls.filter(([u]) => u === url).length;

function makeJob(channels: string[]) {
  const job = {
    data: {
      alertConfigId: 7,
      alertType: 'large_transfer',
      severity: 'warning',
      title: 'Large transfer detected: $500.00',
      description: 'Transaction 0xabc... moved $500.00',
      triggerValue: 500,
      triggerTxHash: `0x${'ab'.repeat(32)}`,
      triggerUnit: 'usd',
      triggerThreshold: 25,
      eventTimestamp: '2026-11-09T12:00:00.000Z',
      agent: { name: 'Swap Agent', wallet: '0xagent', chain: 'base' },
      channels,
      webhookUrl: WEBHOOK,
      telegramChatId: null,
      discordWebhook: DISCORD,
      timestamp: '2026-11-09T12:00:00.000Z',
    } as DeliveryJobData,
    updateData: vi.fn(async (data: DeliveryJobData) => {
      job.data = data;
    }),
  };
  return job;
}

/** Run one attempt with the in-process backoff sleeps skipped. */
async function attempt(job: ReturnType<typeof makeJob>): Promise<unknown> {
  const settled = deliverAlert(job).then(
    () => 'ok',
    (err: unknown) => err,
  );
  await vi.runAllTimersAsync();
  return settled;
}

describe('deliverAlert retries', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    updates.length = 0;
    behaviour = {};
    fetchMock.mockImplementation(async (url: string) => behaviour[url]!());
  });
  afterEach(() => vi.useRealTimers());

  it('a retry sends only to the channel that failed, never again to the one that succeeded', async () => {
    const job = makeJob(['discord', 'webhook']);
    behaviour[DISCORD] = async () => undefined;
    behaviour[WEBHOOK] = async () => {
      throw new Error('fetch failed');
    };

    const first = await attempt(job);
    expect(first).toBeInstanceOf(Error); // BullMQ retries the job
    expect(sentTo(DISCORD)).toBe(1);

    behaviour[WEBHOOK] = async () => undefined;
    expect(await attempt(job)).toBe('ok');
    expect(sentTo(DISCORD)).toBe(1);
    expect(sentTo(WEBHOOK)).toBeGreaterThan(1);
  });

  it('saves a sent channel on the job before trying the next one', async () => {
    const job = makeJob(['discord', 'webhook']);
    behaviour[DISCORD] = async () => undefined;
    behaviour[WEBHOOK] = async () => {
      expect(job.data.sentChannels).toEqual(['discord']);
    };
    expect(await attempt(job)).toBe('ok');
    expect(job.updateData).toHaveBeenCalled();
  });

  it('records every channel sent across attempts on the alert event', async () => {
    const job = makeJob(['discord', 'webhook']);
    behaviour[DISCORD] = async () => undefined;
    behaviour[WEBHOOK] = async () => {
      throw new DeliveryHttpError(503, 'Service Unavailable');
    };
    await attempt(job);
    expect(updates.at(-1)).toMatchObject({ delivered: true, deliveryChannel: 'discord' });
    expect(String(updates.at(-1)!.deliveryError)).toContain('HTTP 503');

    behaviour[WEBHOOK] = async () => undefined;
    await attempt(job);
    expect(updates.at(-1)).toEqual({ delivered: true, deliveryChannel: 'discord,webhook', deliveryError: null });
    expect(sentTo(DISCORD)).toBe(1);
  });

  it('does not retry a 4xx: one request, and the job completes with the error recorded', async () => {
    const job = makeJob(['webhook']);
    behaviour[WEBHOOK] = async () => {
      throw new DeliveryHttpError(404, 'Not Found');
    };
    expect(await attempt(job)).toBe('ok');
    expect(sentTo(WEBHOOK)).toBe(1);
    expect(updates.at(-1)).toMatchObject({ delivered: false, deliveryChannel: null });
    expect(String(updates.at(-1)!.deliveryError)).toContain('HTTP 404');
  });

  it('does not retry a blocked destination', async () => {
    const job = makeJob(['discord']);
    behaviour[DISCORD] = async () => {
      throw new BlockedDestinationError('Webhook host resolves to a private or reserved address');
    };
    expect(await attempt(job)).toBe('ok');
    expect(sentTo(DISCORD)).toBe(1);
  });

  it('retries a 429 and a 5xx, which can succeed later', async () => {
    for (const status of [429, 500]) {
      const job = makeJob(['webhook']);
      behaviour[WEBHOOK] = async () => {
        throw new DeliveryHttpError(status, 'try later');
      };
      expect(await attempt(job)).toBeInstanceOf(Error);
    }
  });

  it('a retry does not try a destination that refused the alert for good', async () => {
    const job = makeJob(['discord', 'webhook']);
    behaviour[DISCORD] = async () => {
      throw new DeliveryHttpError(404, 'Unknown Webhook');
    };
    behaviour[WEBHOOK] = async () => {
      throw new Error('fetch failed');
    };
    expect(await attempt(job)).toBeInstanceOf(Error);
    expect(sentTo(DISCORD)).toBe(1);

    behaviour[WEBHOOK] = async () => undefined;
    expect(await attempt(job)).toBe('ok');
    expect(sentTo(DISCORD)).toBe(1);
    expect(updates.at(-1)).toMatchObject({ delivered: true, deliveryChannel: 'webhook' });
    expect(String(updates.at(-1)!.deliveryError)).toContain('HTTP 404');
  });
});
