import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../server.js';

// rug_check through a real MCP client and server. The ChainWard API is faked at fetch;
// under test: the free route it calls, and what an agent gets back when the answer is a
// token, a wallet, or a used-up free allowance.
const TOKEN = '0x4ed4e862860bed51a9570b96d89af5e1b0efefed';
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

async function callRugCheck(args: Record<string, unknown>) {
  const server = createServer({ baseUrl: API });
  const client = new Client({ name: 'test', version: '0.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  try {
    const res = await client.callTool({ name: 'rug_check', arguments: args });
    const text = (res.content as Array<{ type: string; text: string }>).map((c) => c.text).join('\n');
    return { isError: res.isError === true, text };
  } finally {
    await client.close();
  }
}

const reviewReport = {
  token: TOKEN,
  chain: 'base',
  verdict: { label: 'review', reason: 'The wallet that launched it was first seen less than a day before the launch.' },
  flags: ['new_creator'],
  limits: 'On-chain only. Not a honeypot or contract-code audit.',
};

describe('rug_check', () => {
  it('reads the free rug check for the token and returns its verdict', async () => {
    route = (url) => (url.pathname === `/api/risk/token-report/${TOKEN}` ? { status: 200, body: { success: true, data: reviewReport } } : undefined);

    const res = await callRugCheck({ address: TOKEN });

    assert.deepEqual(calls, [`/api/risk/token-report/${TOKEN}`]);
    assert.equal(res.isError, false);
    const parsed = JSON.parse(res.text) as { verdict: { label: string; reason: string } };
    assert.equal(parsed.verdict.label, 'review');
    assert.match(parsed.verdict.reason, /first seen less than a day/);
  });

  it('points a wallet to check_counterparty instead', async () => {
    // The live API answers a non-token with verdict review and the flag not_a_token (or not_a_contract).
    route = () => ({ status: 200, body: { success: true, data: { ...reviewReport, verdict: { label: 'review', reason: 'This contract does not answer totalSupply(), so it is not an ERC-20 token.' }, flags: ['not_a_token'] } } });

    const res = await callRugCheck({ address: TOKEN });

    assert.equal(res.isError, false);
    assert.match(res.text, /not_a_token/);
    assert.match(res.text, /check_counterparty/);
  });

  it('names the paid route when the free hourly checks are used up', async () => {
    route = () => ({ status: 429, body: { success: false, error: { code: 'FREE_HOURLY_LIMIT', message: 'Free checks for this hour are used up.' } } });

    const res = await callRugCheck({ address: TOKEN });

    assert.equal(res.isError, true);
    assert.match(res.text, /https:\/\/api\.chainward\.ai\/api\/risk\/rugcheck\?address=0x4ed4e862860bed51a9570b96d89af5e1b0efefed/);
    assert.match(res.text, /\$0\.02/);
  });

  it('asks to retry when the check is still running', async () => {
    route = () => ({ status: 504, body: { success: false, error: { code: 'TIMEOUT', message: 'The check is still running.' } } });

    const res = await callRugCheck({ address: TOKEN });

    assert.equal(res.isError, true);
    assert.match(res.text, /try again in a minute/i);
  });

  it('refuses anything that is not an address, without calling the API', async () => {
    const res = await callRugCheck({ address: 'DEGEN' });

    assert.equal(res.isError, true);
    assert.deepEqual(calls, []);
  });
});
