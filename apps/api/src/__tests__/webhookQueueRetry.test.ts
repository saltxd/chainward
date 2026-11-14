import { describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';

// The indexer now fails a webhook job on a transient error (RPC timeout,
// database or Redis blip) so BullMQ retries it. The retry budget is set here,
// where the job is added: bounded, exponential, and long enough to outlast a
// short outage instead of 1 s + 2 s.

const addBulk = vi.hoisted(() => vi.fn(async () => []));

vi.mock('../lib/queue.js', () => ({ getQueues: () => ({ baseTxProcess: { addBulk } }) }));
vi.mock('../providers/index.js', () => ({
  getWebhookProvider: () => ({
    verifySignature: () => true,
    parsePayload: () => [
      {
        txHash: `0x${'ab'.repeat(32)}`,
        blockNumber: 100,
        fromAddress: '0x1111111111111111111111111111111111111111',
        toAddress: '0x2222222222222222222222222222222222222222',
        value: 0.5,
        asset: 'ETH',
        category: 'external',
        rawContract: { rawValue: '0x0', address: null, decimals: 18 },
        network: 'BASE_MAINNET',
      },
    ],
  }),
}));

import { webhooks } from '../routes/webhooks.js';

describe('POST /api/webhooks/alchemy queues each activity with a bounded retry budget', () => {
  it('sets attempts and exponential backoff on every job', async () => {
    const app = new Hono().route('/api/webhooks', webhooks);
    const res = await app.request('/api/webhooks/alchemy', {
      method: 'POST',
      headers: { 'x-alchemy-signature': 'sig' },
      body: '{}',
    });
    expect(res.status).toBe(200);

    const jobs = (addBulk.mock.calls[0] as unknown as [Array<{ opts: { attempts: number; backoff: unknown; jobId: string } }>])[0];
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.opts).toMatchObject({ attempts: 5, backoff: { type: 'exponential', delay: 2_000 } });
    expect(jobs[0]!.opts.jobId).toMatch(/^tx-0x(ab){32}-[0-9a-f]{16}$/);
  });
});
