import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateMetadata } from '../page';

// A shared rug check link previews as a rug check: the server render reads the rug check
// already in the cache (never the chain) and names the address, not the token's own name.

const TOKEN = `0x${'7'.repeat(40)}`;
const CHECK = {
  token: TOKEN,
  chain: 'base',
  verdict: { label: 'review', reason: 'The wallet that launched it was first seen less than a day before the launch.' },
  token_info: { name: 'SAFE verified by ChainWard', symbol: 'SAFE', decimals: 18, total_supply: 1 },
  launch: null,
  creator: null,
  supply: { mints_after_launch: 0, minted_after_launch: null, to_creator: 0, minted_to_creator: null, capped: false },
  flags: ['new_creator'],
  as_of_block: 1,
  limits: 'x',
};

const meta = (chain?: string) =>
  generateMetadata({ params: Promise.resolve({ address: TOKEN }), searchParams: Promise.resolve(chain ? { chain } : {}) });

afterEach(() => vi.unstubAllGlobals());

describe('report page metadata', () => {
  it('previews a cached rug check as a rug check, not indexed', async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        seen.push(url);
        if (url.includes('/api/risk/token-report/')) return new Response(JSON.stringify({ success: true, data: CHECK }));
        return new Response('{}', { status: 404 });
      }),
    );
    const m = await meta();
    expect(seen.find((u) => u.includes('/api/risk/token-report/'))).toMatch(/\?cached=1$/);
    expect(m.title).toBe('Rug check: 0x7777…7777 on Base (Review)');
    expect(String(m.description)).toContain('first seen less than a day');
    expect(JSON.stringify(m)).not.toMatch(/SAFE/);
    expect(m.robots).toEqual({ index: false, follow: true });
  });

  it('falls back to the wallet preview when no rug check is cached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })));
    const m = await meta();
    expect(String(m.title)).not.toMatch(/^Rug check/);
  });

  it('does not ask for a rug check on BNB Chain', async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        seen.push(url);
        return new Response('{}', { status: 404 });
      }),
    );
    await meta('bsc');
    expect(seen.some((u) => u.includes('token-report'))).toBe(false);
  });
});
