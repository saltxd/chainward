import { afterEach, describe, expect, it, vi } from 'vitest';

// 86 Virtuals agents got mangled slugs ("Captain Dackie" → aptain-ackie). After
// the fix the API answers an old slug with 301 + movedTo, and the page moves the
// browser to the current URL.

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  permanentRedirect: (url: string) => {
    throw new Error(`PERMANENT_REDIRECT:${url}`);
  },
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

async function render(slug: string): Promise<string> {
  const { default: AgentPage } = await import('../[slug]/page');
  try {
    await AgentPage({ params: Promise.resolve({ slug }) });
    return 'rendered';
  } catch (err) {
    return (err as Error).message;
  }
}

describe('/base/[slug]', () => {
  it('moves an old slug permanently to the current one, without following the API redirect', async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify({ success: false, error: 'agent moved', movedTo: 'captain-dackie' }), {
          status: 301,
          headers: { location: '/api/observatory/agent/captain-dackie' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    expect(await render('aptain-ackie')).toBe('PERMANENT_REDIRECT:/base/captain-dackie');
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ redirect: 'manual' });
  });

  it('is a 404 for an unknown slug', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 404 })));
    expect(await render('nobody-here')).toBe('NEXT_NOT_FOUND');
  });

  it('gives an agent page its canonical URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ success: true, data: { slug: 'larry', agentName: 'Larry', health: null, acp: null } })),
      ),
    );
    const { generateMetadata } = await import('../[slug]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'larry' }) });
    expect(meta.alternates?.canonical).toBe('https://chainward.ai/base/larry');
  });

  it('titles an agent page with the question, not a health score', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              success: true,
              data: {
                slug: 'larry',
                agentName: 'Larry',
                health: { score: 72, uptimePct: 90, gasEfficiency: 1, failureRate: 0, consistency: 1 },
                acp: { revenue: 1234.4, jobs: 56 },
              },
            }),
          ),
      ),
    );
    const { generateMetadata } = await import('../[slug]/page');
    const meta = await generateMetadata({ params: Promise.resolve({ slug: 'larry' }) });
    expect(meta.title).toBe('Should you pay Larry? AI agent on Base');
    expect(String(meta.description)).toContain('Pay or Hold');
    for (const text of [String(meta.title), String(meta.description)]) {
      expect(text).not.toMatch(/health|\/100|\u2014/i);
    }
  });

  it('is a 404, not a crash, when the API is down', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );
    expect(await render('larry')).toBe('NEXT_NOT_FOUND');
  });
});
