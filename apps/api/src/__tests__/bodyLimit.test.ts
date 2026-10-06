import { describe, expect, it, vi } from 'vitest';

// The full API middleware stack (createApp), not a hand-built router: the 1 MB
// bodyLimit is mounted there, and its HTTPException must reach the client as 413.
const redis = vi.hoisted(() => ({
  get: vi.fn(async () => null),
  set: vi.fn(async () => 'OK'),
  pipeline: vi.fn(() => {
    const p = {
      zremrangebyscore: () => p,
      zcard: () => p,
      zadd: () => p,
      expire: () => p,
      exec: async () => [
        [null, 0],
        [null, 0],
        [null, 1],
        [null, 1],
      ],
    };
    return p;
  }),
}));
vi.mock('../lib/redis.js', () => ({ getRedis: () => redis }));

import { createApp } from '../app.js';

interface ErrorBody {
  success: false;
  error: { code: string; message: string };
}

describe('request bodies over 1 MB', () => {
  const app = createApp({ corsOrigins: ['https://chainward.ai'], x402Check: null });
  const big = `{"target":"${'a'.repeat(1_100_000)}"}`;

  it('answer 413 with the standard error body when Content-Length says so', async () => {
    const res = await app.request('/api/risk/check', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': String(big.length) },
      body: big,
    });
    expect(res.status).toBe(413);
    const body = (await res.json()) as ErrorBody;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(typeof body.error.message).toBe('string');
  });

  it('answer 413 when the body is streamed without a Content-Length', async () => {
    const bytes = new TextEncoder().encode(big);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 64 * 1024) controller.enqueue(bytes.subarray(i, i + 64 * 1024));
        controller.close();
      },
    });
    const res = await app.request(
      new Request('http://localhost/api/risk/check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: stream,
        duplex: 'half',
      } as RequestInit),
    );
    expect(res.status).toBe(413);
    expect(((await res.json()) as ErrorBody).error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
