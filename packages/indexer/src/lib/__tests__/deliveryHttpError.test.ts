import { describe, expect, it, vi } from 'vitest';

// Alert delivery retries a 429 or a 5xx but not other 4xx answers, so
// deliveryFetch has to say which status the destination answered with.

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('undici', async (importOriginal) => {
  const actual = await importOriginal<typeof import('undici')>();
  return {
    ...actual,
    fetch: vi.fn(async () => new Response('gone', { status: 404, statusText: 'Not Found' })),
  };
});

import { DeliveryHttpError, deliveryFetch } from '../deliveryGuard.js';

describe('deliveryFetch on a non-2xx answer', () => {
  it('throws a DeliveryHttpError carrying the status', async () => {
    const err = await deliveryFetch('https://hooks.example.com/alert', {
      method: 'POST',
      headers: {},
      body: '{}',
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DeliveryHttpError);
    expect((err as DeliveryHttpError).status).toBe(404);
    expect((err as Error).message).toBe('HTTP 404: Not Found');
  });
});
