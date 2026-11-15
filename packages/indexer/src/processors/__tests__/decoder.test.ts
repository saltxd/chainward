import { afterEach, describe, expect, it, vi } from 'vitest';

// Contract calls bring custom selectors the decoder does not know, so 4byte is
// asked more often. A hung 4byte request must not hold a worker slot.

vi.mock('../../lib/redis.js', () => ({ getRedis: () => ({ get: async () => null, setex: async () => 'OK' }) }));
vi.mock('../../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { decodeMethod } from '../decoder.js';

const UNKNOWN_SELECTOR_INPUT = '0x372500ab';

describe('decodeMethod 4byte lookup', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('gives the 4byte request a deadline', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response(JSON.stringify({ results: [{ text_signature: 'claimRewards()' }] }));
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await decodeMethod(UNKNOWN_SELECTOR_INPUT)).toEqual({ methodId: '0x372500ab', methodName: 'claimRewards' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to unknown when the request is aborted at its deadline', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
      }),
    );
    expect(await decodeMethod(UNKNOWN_SELECTOR_INPUT)).toEqual({ methodId: '0x372500ab', methodName: 'unknown' });
  });
});
