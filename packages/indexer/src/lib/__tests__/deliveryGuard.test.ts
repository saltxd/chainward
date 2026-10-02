import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';

vi.mock('../logger.js', () => ({
  logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// Fake DNS for chosen names — stands in for an attacker-controlled resolver.
// Only deliveryGuard's own lookup is mocked; undici and net are untouched.
const fakeDns = new Map<string, Array<{ address: string; family: number }>>([
  ['rebind.example.com', [{ address: '127.0.0.1', family: 4 }]],
  ['mixed.example.com', [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.5', family: 4 }]],
  ['mapped.example.com', [{ address: '::ffff:169.254.169.254', family: 6 }]],
  ['public.example.com', [{ address: '93.184.216.34', family: 4 }, { address: '2606:2800:220:1::1', family: 6 }]],
]);

vi.mock('node:dns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:dns')>();
  return {
    ...actual,
    lookup: (hostname: string, options: object, callback: (...args: unknown[]) => void) => {
      const answer = fakeDns.get(hostname);
      if (!answer) return actual.lookup(hostname, options, callback as never);
      process.nextTick(() => callback(null, answer));
    },
  };
});

const {
  BlockedDestinationError,
  deliveryFetch,
  describeUrlForLog,
  guardedLookup,
  isBlockedAddress,
  isBlockedHostname,
  validateDeliveryUrl,
} = await import('../deliveryGuard.js');

describe('isBlockedAddress', () => {
  it.each([
    // IPv4
    '127.0.0.1', '127.255.255.254', '10.0.0.1', '10.255.255.255', '172.16.0.1', '172.31.255.255',
    '192.168.1.1', '169.254.169.254', '100.64.0.1', '100.127.255.255', '0.0.0.0', '0.1.2.3',
    '224.0.0.1', '239.255.255.255', '240.0.0.1', '255.255.255.255',
    // IPv6
    '::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'febf::1', 'ff02::1',
    // IPv4-mapped IPv6, dotted and hex forms
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:10.0.0.1', '::ffff:a00:1',
    '::ffff:169.254.169.254', '::ffff:100.64.0.1', '::ffff:192.168.1.1',
  ])('blocks %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '162.159.135.232', '100.128.0.1', '172.32.0.1', '2606:4700::6810:1', '::ffff:8.8.8.8'])(
    'allows public %s',
    (ip) => {
      expect(isBlockedAddress(ip)).toBe(false);
    },
  );

  it('refuses things that are not IPs', () => {
    expect(isBlockedAddress('example.com')).toBe(true);
  });
});

describe('isBlockedHostname', () => {
  it.each([
    'localhost', 'LOCALHOST', 'localhost.', 'api.localhost',
    'printer.local', 'metadata.google.internal', 'redis.chainward.svc',
    'chainward-api.chainward.svc.cluster.local', 'docs.k3s.nox',
    'redis', 'chainward-api', // single-label: resolved via cluster search domains
    '127.0.0.1', '10.1.2.3', '[::1]', '[::ffff:7f00:1]', '[fd00::1]',
  ])('blocks %s', (host) => {
    expect(isBlockedHostname(host)).toBe(true);
  });

  it.each(['discord.com', 'api.telegram.org', 'hooks.example.com', '8.8.8.8', '[2606:4700::6810:1]'])(
    'allows %s',
    (host) => {
      expect(isBlockedHostname(host)).toBe(false);
    },
  );
});

describe('validateDeliveryUrl', () => {
  it('accepts a public https URL', () => {
    expect(() => validateDeliveryUrl('https://discord.com/api/webhooks/1/abc')).not.toThrow();
  });

  it.each([
    'http://hooks.example.com/x', // not https
    'https://localhost/x',
    'https://127.0.0.1/x',
    'https://2130706433/x', // 127.0.0.1 in decimal — URL normalises it
    'https://0x7f.1/x',
    'https://[::ffff:127.0.0.1]/x',
    'https://169.254.169.254/latest/meta-data',
    'https://redis:6379/',
    'https://chainward-api.chainward.svc.cluster.local/api',
    'https://docs.k3s.nox/',
    'not a url',
  ])('rejects %s', (url) => {
    expect(() => validateDeliveryUrl(url)).toThrow(BlockedDestinationError);
  });
});

describe('guardedLookup', () => {
  function lookup(hostname: string, all: boolean) {
    return new Promise<{ err: Error | null; address: unknown; family: unknown }>((resolve) => {
      guardedLookup(hostname, { all }, (err, address, family) => resolve({ err, address, family }));
    });
  }

  it.each(['rebind.example.com', 'mixed.example.com', 'mapped.example.com'])(
    'refuses %s when any resolved address is private',
    async (host) => {
      const { err } = await lookup(host, true);
      expect(err).toBeInstanceOf(BlockedDestinationError);
      // The user-visible message must not leak the internal address.
      expect(err?.message).not.toMatch(/\d+\.\d+\.\d+\.\d+|::/);
    },
  );

  it('refuses blocked hostnames without resolving them', async () => {
    const { err } = await lookup('redis.chainward.svc.cluster.local', true);
    expect(err).toBeInstanceOf(BlockedDestinationError);
  });

  it('returns every address when net asks for all (autoSelectFamily)', async () => {
    const { err, address } = await lookup('public.example.com', true);
    expect(err).toBeNull();
    expect(address).toEqual(fakeDns.get('public.example.com'));
  });

  it('returns the first address when net asks for one', async () => {
    const { err, address, family } = await lookup('public.example.com', false);
    expect(err).toBeNull();
    expect(address).toBe('93.184.216.34');
    expect(family).toBe(4);
  });
});

describe('deliveryFetch', () => {
  let server: Server;
  let hits = 0;
  let port = 0;
  const request = { method: 'POST' as const, headers: {}, body: '{}' };

  beforeAll(async () => {
    server = createServer((_req, res) => {
      hits++;
      res.end('ok');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('rejects private URLs before connecting', async () => {
    for (const url of [
      `https://127.0.0.1:${port}/`,
      `https://localhost:${port}/`,
      `https://[::ffff:127.0.0.1]:${port}/`,
      `http://127.0.0.1:${port}/`,
    ]) {
      await expect(deliveryFetch(url, request)).rejects.toBeInstanceOf(BlockedDestinationError);
    }
    expect(hits).toBe(0);
  });

  it('checks DNS inside the connector, so a public-looking name that resolves inward never connects', async () => {
    // rebind.example.com passes every static check; only the dispatcher's
    // lookup can stop it. The error's cause proves that's what did.
    for (const host of ['rebind.example.com', 'mixed.example.com']) {
      const err = await deliveryFetch(`https://${host}:${port}/`, request).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).cause).toBeInstanceOf(BlockedDestinationError);
    }
    expect(hits).toBe(0);
  });
});

describe('describeUrlForLog', () => {
  it('redacts the Telegram bot token', () => {
    const out = describeUrlForLog('https://api.telegram.org/bot123456:AAH-secret_token/sendMessage');
    expect(out).toBe('api.telegram.org/bot<redacted>/sendMessage');
    expect(out).not.toContain('secret');
  });

  it('logs only the host for Discord webhooks', () => {
    expect(describeUrlForLog('https://discord.com/api/webhooks/123/secret-token')).toBe('discord.com');
  });

  it('logs only the host (and port) for user webhooks', () => {
    expect(describeUrlForLog('https://hooks.example.com:8443/t/secret?key=abc')).toBe('hooks.example.com:8443');
  });

  it('never echoes an unparseable URL', () => {
    expect(describeUrlForLog('bot-secret not a url')).toBe('<invalid url>');
  });
});
