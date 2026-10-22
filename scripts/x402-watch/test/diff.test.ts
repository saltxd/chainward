import { describe, expect, it } from 'vitest';
import { checkEndpoint, type EndpointCheck } from '../src/classify.js';
import { diffEndpoint, transition, type EndpointState } from '../src/diff.js';
import type { ProbeRecord } from '../src/probe.js';
import { at, fixture, tokens } from './helpers.js';

const DAY1 = '2026-10-22T06:00:01Z';
const DAY2 = '2026-10-23T06:00:01Z';
const DAY3 = '2026-10-24T06:00:01Z';
const URL = 'https://api.example.com/v1/quote';

/** Every fixture probed at the same URL, so one endpoint can move between them day to day. */
const as = (name: string, iso: string): ProbeRecord => ({ ...at(fixture(name), iso), url: URL, method: 'GET', request: { headers: {} } });
const check = (name: string, iso: string): Promise<EndpointCheck> => checkEndpoint(as(name, iso), tokens());

async function run(days: [string, string][]): Promise<{ events: ReturnType<typeof diffEndpoint>['events'][]; state: EndpointState | undefined }> {
  let state: EndpointState | undefined;
  const events = [];
  for (const [name, iso] of days) {
    const r = diffEndpoint(state, await check(name, iso));
    events.push(r.events);
    state = r.next;
  }
  return { events, state };
}

describe('diff', () => {
  it('records a baseline on the first run and says nothing', async () => {
    const { events, state } = await run([['v1-names-in-v2', DAY1]]);
    expect(events[0]).toEqual([]);
    expect(state!.units.standard).toMatchObject({ outcome: 'FAIL_V1_NETWORK_NAMES_IN_V2', since: DAY1 });
    expect(state!.lastProbedDay).toBe('2026-10-22');
  });

  it('says nothing while the outcome holds', async () => {
    const { events, state } = await run([
      ['valid-base-usdc', DAY1],
      ['valid-base-usdc', DAY2],
      ['valid-base-usdc', DAY3],
    ]);
    expect(events.flat()).toEqual([]);
    expect(state!.units.standard).toMatchObject({ since: DAY1, lastSeen: DAY3 });
  });

  it('reports a break, with what it was before', async () => {
    const { events } = await run([
      ['valid-base-usdc', DAY1],
      ['v1-names-in-v2', DAY2],
    ]);
    const std = events[1]!.find((e) => e.unitKey === 'standard')!;
    expect(std).toMatchObject({
      kind: 'breaks',
      endpointKey: `GET ${URL}`,
      prev: { outcome: 'SIGNS_VALID_AUTHORIZATION', since: DAY1 },
      cur: { outcome: 'FAIL_V1_NETWORK_NAMES_IN_V2' },
      at: DAY2,
    });
  });

  it('reports a recovery, with how long it was broken', async () => {
    const { events, state } = await run([
      ['wrong-domain-base-usdc', DAY1],
      ['wrong-domain-base-usdc', DAY2],
      ['valid-base-usdc', DAY3],
    ]);
    expect(events[1]).toEqual([]);
    const std = events[2]!.find((e) => e.unitKey === 'standard')!;
    expect(std).toMatchObject({ kind: 'recovers', prev: { outcome: 'FAIL_WRONG_EIP712_DOMAIN', since: DAY1 }, cur: { outcome: 'SIGNS_VALID_AUTHORIZATION' } });
    expect(state!.units.standard).toMatchObject({ outcome: 'SIGNS_VALID_AUTHORIZATION', since: DAY3 });
  });

  it('reports a failure that changed reason as a new break', async () => {
    const { events } = await run([
      ['wrong-domain-base-usdc', DAY1],
      ['validity-seven-days', DAY2],
    ]);
    expect(events[1]!.find((e) => e.unitKey === 'standard')).toMatchObject({
      kind: 'breaks',
      prev: { outcome: 'FAIL_WRONG_EIP712_DOMAIN' },
      cur: { outcome: 'OVER_AUTHORIZE_VALIDITY_OVER_1_DAY' },
    });
  });

  it('reports an endpoint that stops answering 402, and its return', async () => {
    const gone = (iso: string): ProbeRecord => ({ ...as('valid-base-usdc', iso), status: 404, headers: {}, bodyText: 'not found' });
    const r1 = diffEndpoint(undefined, await check('valid-base-usdc', DAY1));
    const r2 = diffEndpoint(r1.next, await checkEndpoint(gone(DAY2), tokens()));
    expect(r2.events).toEqual([expect.objectContaining({ kind: 'breaks', unitKey: 'standard', cur: { outcome: 'NO_402_RESPONSE', detail: 'HTTP 404' } })]);
    // The offer buyer could not run today: its last state is kept, not reported as gone.
    expect(r2.next.units['offer:eip155:8453:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913:eip3009']).toMatchObject({ outcome: 'SIGNS_VALID_AUTHORIZATION' });
    const r3 = diffEndpoint(r2.next, await check('valid-base-usdc', DAY3));
    expect(r3.events).toEqual([expect.objectContaining({ kind: 'recovers', unitKey: 'standard' })]);
    expect(r3.next.units.standard!.since).toBe(DAY3);
  });

  it('reports a broken offer next to a working one, without the standard buyer', async () => {
    // Day 1: only Base, which passes. Day 2: World Chain is added with the wrong token name.
    const base = as('second-chain-wrong-domain', DAY1);
    const header = JSON.parse(Buffer.from(base.headers!['payment-required']!, 'base64').toString());
    const onlyBase = { ...base, headers: { ...base.headers, 'payment-required': Buffer.from(JSON.stringify({ ...header, accepts: header.accepts.slice(0, 1) })).toString('base64') } };
    const r1 = diffEndpoint(undefined, await checkEndpoint(onlyBase, tokens()));
    const r2 = diffEndpoint(r1.next, await check('second-chain-wrong-domain', DAY2));
    expect(r2.events).toEqual([
      expect.objectContaining({ kind: 'breaks', unitKey: 'offer:eip155:480:0x79a02482a880bce3f13e09da970dc34db4cd24d1:eip3009', prev: null, cur: expect.objectContaining({ outcome: 'FAIL_WRONG_EIP712_DOMAIN' }) }),
    ]);
    // Day 3: the broken offer is dropped from the 402: its failure is gone.
    const r3 = diffEndpoint(r2.next, await checkEndpoint({ ...onlyBase, sentAt: DAY3 }, tokens()));
    expect(r3.events).toEqual([expect.objectContaining({ kind: 'recovers', unitKey: 'offer:eip155:480:0x79a02482a880bce3f13e09da970dc34db4cd24d1:eip3009', cur: null })]);
    expect(Object.keys(r3.next.units)).not.toContain('offer:eip155:480:0x79a02482a880bce3f13e09da970dc34db4cd24d1:eip3009');
  });

  it('names the transition by where it lands', () => {
    expect(transition('SIGNS_VALID_AUTHORIZATION', 'FAIL_WRONG_EIP712_DOMAIN')).toBe('breaks');
    expect(transition('FAIL_WRONG_EIP712_DOMAIN', 'SIGNS_VALID_AUTHORIZATION')).toBe('recovers');
    expect(transition('FAIL_WRONG_EIP712_DOMAIN', 'POLICY_OVER_1_USD_DEFAULT_CAP')).toBe('changes');
    expect(transition('SIGNS_VALID_AUTHORIZATION', 'POLICY_OVER_1_USD_DEFAULT_CAP')).toBe('changes');
    expect(transition('NO_402_RESPONSE', 'SIGNS_VALID_AUTHORIZATION')).toBe('recovers');
  });

  it('treats a passing payment whose token domain could not be read as unchanged', async () => {
    const r1 = diffEndpoint(undefined, await check('valid-base-usdc', DAY1));
    const noFacts = await checkEndpoint(as('valid-base-usdc', DAY2), {});
    expect(noFacts.units[0]!.outcome).toBe('SIGNS_DOMAIN_UNVERIFIED');
    expect(diffEndpoint(r1.next, noFacts).events).toEqual([]);
  });
});
