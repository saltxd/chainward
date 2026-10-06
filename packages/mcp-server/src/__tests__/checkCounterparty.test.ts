import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../server.js';

// check_counterparty through a real MCP client and server. The ChainWard API is
// faked at fetch; what's under test is which API routes the tool calls for a chain.
const WALLET = '0xb709860b8a1ce20019f3786d6982f773912bd286';
const API = 'https://api.test';

type Route = (url: URL) => { status: number; body: unknown } | undefined;

let calls: string[] = [];
let route: Route = () => undefined;
const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    calls.push(`${url.pathname}${url.search}`);
    const hit = route(url) ?? { status: 404, body: { success: false, error: { code: 'NOT_FOUND', message: 'not found' } } };
    return new Response(JSON.stringify(hit.body), { status: hit.status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

async function callCheck(args: Record<string, unknown>) {
  const server = createServer({ baseUrl: API });
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

  it('points a BNB Chain address with no report at the BNB Chain check', async () => {
    route = () => undefined;
    const res = await callCheck({ wallet: WALLET, chain: 'bsc' });
    assert.match(res.text, /https:\/\/chainward\.ai\/\?chain=bsc/);
    assert.doesNotMatch(res.text, /attested on Base/);
  });

  it('defaults to Base: the attestation first, then the Base report', async () => {
    route = () => undefined;
    const res = await callCheck({ wallet: WALLET });
    assert.deepEqual(calls, [`/api/risk/attestation/${WALLET}`, `/api/risk/report/${WALLET}`]);
    assert.match(res.text, /no report/);
  });

  it('rejects a chain it does not support', async () => {
    const res = await callCheck({ wallet: WALLET, chain: 'eth' });
    assert.equal(res.isError, true);
    assert.deepEqual(calls, []);
  });
});
