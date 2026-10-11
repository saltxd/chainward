import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

// Stale public pages: redirected, or kept working but out of the index.

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
  permanentRedirect: (url: string) => {
    throw new Error(`PERMANENT_REDIRECT:${url}`);
  },
  redirect: (url: string) => {
    throw new Error(`TEMPORARY_REDIRECT:${url}`);
  },
}));

const APP = fileURLToPath(new URL('..', import.meta.url));
const WALLET = '0xD8B7A2572571527E71B03879D38B403BE5ABE38E';

async function outcome(run: () => unknown): Promise<string> {
  try {
    await run();
    return 'rendered';
  } catch (err) {
    return (err as Error).message;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('/agent/[wallet]', () => {
  it('moves permanently to the report, keeping a non-Base chain', async () => {
    const { default: Page } = await import('../agent/[wallet]/page');
    const page = (wallet: string, chain?: string) => () =>
      Page({ params: Promise.resolve({ wallet }), searchParams: Promise.resolve({ chain }) });

    expect(await outcome(page(WALLET))).toBe(`PERMANENT_REDIRECT:/report/${WALLET.toLowerCase()}`);
    expect(await outcome(page(WALLET, 'bsc'))).toBe(`PERMANENT_REDIRECT:/report/${WALLET.toLowerCase()}?chain=bsc`);
  });

  it('is a 404 for something that is not a wallet', async () => {
    const { default: Page } = await import('../agent/[wallet]/page');
    expect(
      await outcome(() => Page({ params: Promise.resolve({ wallet: 'nope' }), searchParams: Promise.resolve({}) })),
    ).toBe('NEXT_NOT_FOUND');
  });

  it('no longer has its own layout or client page body', () => {
    expect(existsSync(`${APP}/agent/[wallet]/layout.tsx`)).toBe(false);
  });
});

describe('/register, /wallet', () => {
  it('redirect permanently', async () => {
    const register = await import('../(auth)/register/page');
    const wallet = await import('../wallet/page');
    const walletAddress = await import('../wallet/[address]/page');
    expect(await outcome(() => register.default())).toBe('PERMANENT_REDIRECT:/login');
    expect(await outcome(() => wallet.default())).toBe('PERMANENT_REDIRECT:/');
    expect(await outcome(() => walletAddress.default({ params: Promise.resolve({ address: WALLET }) }))).toBe(
      `PERMANENT_REDIRECT:/report/${WALLET.toLowerCase()}`,
    );
  });

  it('/register has no stale layout of its own', () => {
    expect(existsSync(`${APP}/(auth)/register/layout.tsx`)).toBe(false);
  });
});

describe('noindex pages', () => {
  it('/base/digest is kept out of the index and keeps working', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    const { generateMetadata } = await import('../base/digest/page');
    const meta = await generateMetadata();
    expect(meta.robots).toMatchObject({ index: false });
    expect(meta.alternates?.canonical).toBeUndefined();
  });

  it('/hyperliquid, /deck/bnb and /base/digest/snippets stay noindex', async () => {
    const pages = await Promise.all([
      import('../hyperliquid/page'),
      import('../deck/bnb/page'),
      import('../base/digest/snippets/page'),
    ]);
    for (const p of pages) {
      expect(p.metadata.robots).toMatchObject({ index: false });
    }
    expect(pages[0].metadata.alternates?.canonical).toBeUndefined();
  });
});
