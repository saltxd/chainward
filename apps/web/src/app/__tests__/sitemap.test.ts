import { afterEach, describe, expect, it, vi } from 'vitest';
import sitemap from '../sitemap';

// The sitemap lists agent pages only for agents that moved money in the last
// 30 days, and no longer lists the retired /hyperliquid page.

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sitemap', () => {
  it('lists active agent pages only and leaves out /hyperliquid', async () => {
    const recent = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const stale = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/api/observatory/sitemap')) {
          return new Response(
            JSON.stringify({
              success: true,
              data: [
                { slug: 'larry', lastActiveAt: recent, updatedAt: recent },
                { slug: 'idle-agent', lastActiveAt: stale, updatedAt: stale },
              ],
            }),
          );
        }
        return new Response(JSON.stringify({ success: true, data: { reports: [] } }));
      }),
    );

    const urls = (await sitemap()).map((e) => e.url);
    expect(urls).toContain('https://chainward.ai/base');
    expect(urls).toContain('https://chainward.ai/rugcheck');
    expect(urls).toContain('https://chainward.ai/base/larry');
    expect(urls).not.toContain('https://chainward.ai/base/idle-agent');
    expect(urls.some((u) => u.includes('/hyperliquid'))).toBe(false);
    expect(urls.some((u) => u.includes('/base/digest'))).toBe(false);
  });
});
