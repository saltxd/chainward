import { describe, expect, it } from 'vitest';
import { checkEndpoint, type EndpointCheck } from '../src/classify.js';
import { diffEndpoint, type WatchEvent } from '../src/diff.js';
import type { ProbeRecord } from '../src/probe.js';
import { eventText, explain, mergeEvents, renderChangeReport, renderCheckReport, type ChangeItem } from '../src/report.js';
import { FIXTURE_NAMES, at, fixture, tokens } from './helpers.js';

const URL = 'https://api.example.com/v1/quote';
const as = (name: string, iso: string): ProbeRecord => ({ ...at(fixture(name), iso), url: URL, method: 'GET', request: { headers: fixture('v1-names-in-v2').request.headers } });

async function breakBetween(before: string, after: string): Promise<{ items: ChangeItem[]; check: EndpointCheck }> {
  const d1 = diffEndpoint(undefined, await checkEndpoint(as(before, '2026-10-22T06:00:02Z'), tokens()));
  const check = await checkEndpoint(as(after, '2026-10-23T06:00:02Z'), tokens());
  const { events } = diffEndpoint(d1.next, check);
  return { items: events.map((event: WatchEvent) => ({ event, check })), check };
}

// The copy rules of chainward.ai/x402/watch, applied to everything the job writes.
function assertCopyRules(text: string) {
  expect(text).not.toContain('—');
  expect(text).not.toMatch(/\b(safe|scam|fraud)\w*/i);
}

describe('the change report', () => {
  it('reads like the sample alert on the watch page', async () => {
    const { items } = await breakBetween('valid-base-usdc', 'v1-names-in-v2');
    const merged = mergeEvents(items);
    expect(merged).toHaveLength(1);
    expect(eventText(merged[0]!, tokens())[0]).toBe(
      "At 06:00 UTC our standard buyer requested GET https://api.example.com/v1/quote. The 402 offered only 'base' under x402Version 2, so the buyer found no network it could match and stopped. Yesterday it passed. Fix: use the CAIP-2 id 'eip155:8453'.",
    );
  });

  it('shows the request we sent and what came back, field by field', async () => {
    const { items } = await breakBetween('valid-base-usdc', 'v1-names-in-v2');
    const text = eventText(mergeEvents(items)[0]!, tokens()).join('\n');
    expect(text).toContain('Request we sent\n  GET https://api.example.com/v1/quote\n  user-agent: chainward-x402-lint/1.0 (+https://chainward.ai)');
    expect(text).toContain('What came back\n  402 Payment Required\n  PAYMENT-REQUIRED header, decoded:\n    x402Version: 2');
    expect(text).toContain('    accepts[0].network: "base"');
  });

  it('writes a subject and a quiet-endpoint line, and how to stop', async () => {
    const { items } = await breakBetween('valid-base-usdc', 'wrong-domain-base-usdc');
    const report = renderChangeReport(
      {
        subscriber: { id: 's001' },
        hosts: ['api.example.com'],
        at: '2026-10-23T06:00:30.000Z',
        items,
        steady: { passing: 4, failing: [{ key: 'POST https://api.example.com/v1/balances', since: '2026-10-21T06:00:00Z', outcome: 'OVER_AUTHORIZE_VALIDITY_OVER_1_DAY' }], notJudged: 0 },
      },
      tokens(),
    );
    expect(report.split('\n')[0]).toBe('Subject: x402 watch: api.example.com, 1 endpoint broke');
    expect(report).toContain("with extra {name 'USDC', version '2'}, but the token's own EIP-712 domain is {name 'USD Coin', version '2'}");
    expect(report).toContain("Fix: set extra.name to 'USD Coin' and extra.version to '2'");
    expect(report).toContain('Unchanged since the last run: 4 endpoints still pass; POST https://api.example.com/v1/balances still fails (a payment valid for more than a day, since Oct 21).');
    expect(report).toContain('To stop the watch, reply "stop".');
    assertCopyRules(report);
  });

  it('says when it works again, and since when it had failed', async () => {
    const { items } = await breakBetween('validity-seven-days', 'valid-base-usdc');
    const report = renderChangeReport({ subscriber: { id: 's001' }, hosts: ['api.example.com'], at: '2026-10-23T06:00:30.000Z', items, steady: { passing: 0, failing: [], notJudged: 0 } }, tokens());
    expect(report.split('\n')[0]).toBe('Subject: x402 watch: api.example.com, 1 endpoint recovered');
    expect(report).toContain('The buyer signed a valid payment: 0.04 USDC on Base, valid for 120 seconds. It had failed since Oct 22 (a payment valid for more than a day).');
    assertCopyRules(report);
  });
});

describe('the field to fix', () => {
  it.each([
    ['validity-unix-time', /looks like a Unix time.*Fix: maxTimeoutSeconds is a duration in seconds, not a timestamp/],
    ['validity-seven-days', /stays valid for 7\.0 days.*Fix: set maxTimeoutSeconds to the time a payment may take, for example 300/],
    ['asset-not-a-contract', /no contract at that address.*\(USDC on Base is 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913\)/],
    ['v2-body-only', /JSON body only.*Fix: send the challenge in the PAYMENT-REQUIRED header/],
    ['no-x402-challenge', /The host's own error header says DEPLOYMENT_DISABLED/],
  ])('%s', async (name, pattern) => {
    const c = await checkEndpoint(fixture(name), tokens());
    const e = explain(c, c.units[0]!, tokens());
    expect(`${e.what} Fix: ${e.fix}`).toMatch(pattern);
  });
});

describe('the first check', () => {
  it('covers every endpoint, the offers on their own, and the next step', async () => {
    const checks = [];
    for (const n of FIXTURE_NAMES) checks.push(await checkEndpoint(fixture(n), tokens()));
    const report = renderCheckReport({ target: 'api.example.com', at: '2026-10-21T19:03:00.000Z', checks, notProbed: [{ url: 'https://api.example.com/v1/lookup/{ip}', reason: 'a path template: send us an example URL' }] }, tokens());
    expect(report).toContain('Summary: 10 endpoints checked. 7 would make a standard buyer\'s payment fail. 3 pass, and on 2 of those an offer fails on its own.');
    expect(report).toContain('GET https://api.example.com/v1/ticket: passes; 1 offer fails on its own');
    expect(report).toContain('and replayed the 402 as a buyer that pays only in USDC on World Chain (eip155:480)');
    expect(report).toContain('accepts[1] DAI on Base (eip155:8453): token has no EIP-3009 and the offer does not use permit2');
    expect(report).toContain('Listed but not requested\n  https://api.example.com/v1/lookup/{ip}: a path template');
    expect(report).toContain('$10 a month in USDC on Base, paid to the address on chainward.ai/x402/watch');
    assertCopyRules(report);
  });
});
