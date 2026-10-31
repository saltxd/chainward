import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../server.js';

// check_counterparty through a real MCP client and server. The ChainWard API is
// faked at fetch; what's under test is which API routes the tool calls for a chain.
const WALLET = '0xb709860b8a1ce20019f3786d6982f773912bd286';
const API = 'https://api.test';

type Route = (url: URL, method: string, body: unknown) => { status: number; body: unknown } | undefined;

let calls: string[] = [];
let route: Route = () => undefined;
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? 'GET').toUpperCase();
    // GETs are recorded bare so path-only assertions stay readable; other verbs carry theirs.
    calls.push(`${method === 'GET' ? '' : `${method} `}${url.pathname}${url.search}`);
    const sent = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    const hit = route(url, method, sent) ?? { status: 404, body: { success: false, error: { code: 'NOT_FOUND', message: 'not found' } } };
    return new Response(JSON.stringify(hit.body), { status: hit.status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

async function callCheck(args: Record<string, unknown>, opts: Record<string, unknown> = {}) {
  // checkPollMs: 0 so the queued-poll tests don't actually wait.
  const server = createServer({ baseUrl: API, checkPollMs: 0, ...opts });
  const client = new Client({ name: 'test', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const res = await client.callTool({ name: 'check_counterparty', arguments: args });
    const text = (res.content as Array<{ type: string; text: string }>).map((c) => c.text).join('\n');
    return { isError: res.isError === true, text };
  } finally {
    await client.close();
  }
}

const bscReport = { address: WALLET, chain: 'bsc', band: 'mixed', flags: [{ id: 'dormant_wallet' }] };

describe('check_counterparty chain argument', () => {
  it('reads the BNB Chain report with chain=bsc, and skips the Base-only attestation', async () => {
    route = (url) =>
      url.pathname === `/api/risk/report/${WALLET}` && url.searchParams.get('chain') === 'bsc'
        ? { status: 200, body: { success: true, data: bscReport } }
        : undefined;

    const res = await callCheck({ wallet: WALLET, chain: 'bsc' });

    assert.deepEqual(calls, [`/api/risk/report/${WALLET}?chain=bsc`]);
    assert.equal(res.isError, false);
    const parsed = JSON.parse(res.text) as Record<string, unknown>;
    assert.equal(parsed.chain, 'bsc');
    assert.equal(parsed.attested_on_chain, false);
  });

  it('runs the check on the right chain when BNB Chain has no report yet', async () => {
    route = (url, method, body) =>
      url.pathname === '/api/risk/check' && method === 'POST'
        ? {
            status: 200,
            body: {
              success: true,
              data: (body as { chain?: string }).chain === 'bsc'
                ? { status: 'ready', report: bscReport }
                : { status: 'no_history' },
            },
          }
        : undefined;

    const res = await callCheck({ wallet: WALLET, chain: 'bsc' });

    assert.deepEqual(calls, [`/api/risk/report/${WALLET}?chain=bsc`, 'POST /api/risk/check']);
    assert.equal(res.isError, false);
    assert.match(res.text, /"chain": "bsc"/);
  });

  it('defaults to Base: attestation, then report, then it runs the check', async () => {
    route = () => undefined;
    const res = await callCheck({ wallet: WALLET });
    assert.deepEqual(calls, [
      `/api/risk/attestation/${WALLET}`,
      `/api/risk/report/${WALLET}`,
      'POST /api/risk/check',
    ]);
    assert.equal(res.isError, true);
  });

  it('rejects a chain it does not support', async () => {
    const res = await callCheck({ wallet: WALLET, chain: 'eth' });
    assert.equal(res.isError, true);
    assert.deepEqual(calls, []);
  });
});

// Before this, an address nobody had checked got prose telling the caller to go
// paste it into a web page — a dead end for the agent the tool exists to serve.
describe('check_counterparty runs a check when there is no report yet', () => {
  const baseReport = { address: WALLET, chain: 'base', verdict: { label: 'hold' } };

  it('returns the report when the check comes back ready', async () => {
    route = (url, method) =>
      url.pathname === '/api/risk/check' && method === 'POST'
        ? { status: 200, body: { success: true, data: { status: 'ready', report: baseReport } } }
        : undefined;

    const res = await callCheck({ wallet: WALLET });

    assert.equal(res.isError, false);
    assert.match(res.text, /"label": "hold"/);
    assert.equal(calls.at(-1), 'POST /api/risk/check');
  });

  it('polls check/:id until a queued check is ready', async () => {
    let polls = 0;
    route = (url, method) => {
      if (url.pathname === '/api/risk/check' && method === 'POST') {
        return { status: 202, body: { success: true, data: { status: 'queued', check_id: 'chk_1' } } };
      }
      if (url.pathname === '/api/risk/check/chk_1') {
        polls += 1;
        return polls < 2
          ? { status: 200, body: { success: true, data: { status: 'pending' } } }
          : { status: 200, body: { success: true, data: { status: 'ready', report: baseReport } } };
      }
      return undefined;
    };

    const res = await callCheck({ wallet: WALLET });

    assert.equal(res.isError, false);
    assert.match(res.text, /"label": "hold"/);
    assert.equal(polls, 2);
  });

  it('says so plainly when the address has no on-chain history', async () => {
    route = (url, method) =>
      url.pathname === '/api/risk/check' && method === 'POST'
        ? { status: 200, body: { success: true, data: { status: 'no_history' } } }
        : undefined;

    const res = await callCheck({ wallet: WALLET });

    assert.equal(res.isError, false);
    assert.match(res.text, /no on-chain history/i);
    assert.doesNotMatch(res.text, /paste the address/i);
  });

  it('names the paid route when the free check budget is spent', async () => {
    route = (url, method) =>
      url.pathname === '/api/risk/check' && method === 'POST'
        ? { status: 429, body: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests.' } } }
        : undefined;

    const res = await callCheck({ wallet: WALLET });

    assert.equal(res.isError, true);
    assert.match(res.text, /api\.chainward\.ai\/api\/risk\/counterparty/);
    assert.match(res.text, /\$0\.05/);
  });

  it('gives up with the check id rather than polling forever', async () => {
    route = (url, method) => {
      if (url.pathname === '/api/risk/check' && method === 'POST') {
        return { status: 202, body: { success: true, data: { status: 'queued', check_id: 'chk_2' } } };
      }
      if (url.pathname === '/api/risk/check/chk_2') {
        return { status: 200, body: { success: true, data: { status: 'pending' } } };
      }
      return undefined;
    };

    const res = await callCheck({ wallet: WALLET }, { checkPollTries: 3 });

    assert.equal(calls.filter((c) => c === '/api/risk/check/chk_2').length, 3);
    assert.match(res.text, /chk_2/);
    assert.match(res.text, /still running/i);
  });
});

describe('check_counterparty description', () => {
  it('names the machine labels and the texts a buyer sees, not the old three-word framing', async () => {
    const server = createServer({ baseUrl: API });
    const client = new Client({ name: 'test', version: '0.0.0' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const { tools } = await client.listTools();
      const desc = tools.find((t) => t.name === 'check_counterparty')?.description ?? '';
      assert.match(desc, /pay \/ hold \/ unknown/);
      assert.match(desc, /Pay, Hold, Inactive, No track record or Couldn't check/);
      assert.doesNotMatch(desc, /Pay, Hold or Unknown|signal band|\bsafe\b|—/);
    } finally {
      await client.close();
    }
  });
});
