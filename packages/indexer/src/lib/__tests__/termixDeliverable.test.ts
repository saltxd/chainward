import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { HIRE_LIMITS, HIRE_METHOD, type HireReport } from '@chainward/decode';
import { ASK_FOR_INPUT_MESSAGE, buildHireDeliverable, hireSummary, parseHireTarget } from '../termixDeliverable.js';

const OWNER = '0x15d08640aeefbdce11930d9c9a30884011f654f6';

function report(overrides: Partial<HireReport> = {}): HireReport {
  return {
    chain: 'bsc',
    agent_id: 332962,
    agent_ids: [332962],
    owner: OWNER,
    agent_wallet: OWNER,
    window_days: 30,
    hires: { total: 5, distinct_hirers: 4, by_source: { termix_escrow: 5, erc8183_shared: 0 } },
    hirers: [],
    summary: { owner_linked: 1, inconclusive: 0, independent_within_limits: 3, passes_three_independent: true },
    method: HIRE_METHOD,
    limits: HIRE_LIMITS,
    as_of: { block: 126_000_000, time: '2026-10-07T12:00:00.000Z' },
    ...overrides,
  };
}

describe('parseHireTarget', () => {
  it.each([
    [['332962'], { kind: 'id', id: 332962 }],
    [['#332962'], { kind: 'id', id: 332962 }],
    [['please check agent 332962 thanks'], { kind: 'id', id: 332962 }],
    [['Agent ID: 332962'], { kind: 'id', id: 332962 }],
    [['https://termix.ai/agents/332962'], { kind: 'id', id: 332962 }],
    [[`owner is ${OWNER.toUpperCase().replace('0X', '0x')}`], { kind: 'owner', address: OWNER }],
    // The same target said twice is one target.
    [['agent 332962', 'yes, #332962'], { kind: 'id', id: 332962 }],
  ])('reads %j', (texts, target) => {
    expect(parseHireTarget(texts)).toEqual({ ok: true, target });
  });

  it('does not read counts or a tx hash as targets', () => {
    expect(parseHireTarget(['I need 3 hires in 30 days, tx 0x' + 'ab'.repeat(32)])).toMatchObject({ ok: false, reason: 'none' });
  });

  it('asks again when there is nothing to check', () => {
    const r = parseHireTarget([]);
    expect(r).toMatchObject({ ok: false, reason: 'none' });
  });

  it('refuses two different targets rather than guessing', () => {
    expect(parseHireTarget(['agent 332962 or agent 361259'])).toMatchObject({ ok: false, reason: 'ambiguous' });
    expect(parseHireTarget([`agent 332962`, OWNER])).toMatchObject({ ok: false, reason: 'ambiguous' });
  });

  it('refuses a placeholder address', () => {
    expect(parseHireTarget(['0x0000000000000000000000000000000000000001'])).toMatchObject({ ok: false, reason: 'placeholder' });
  });
});

describe('hireSummary', () => {
  it('states the counts, the bar and the limits in one paragraph', () => {
    const s = hireSummary(report());
    expect(s).toContain('agent 332962');
    expect(s).toContain('5 hires from 4 distinct wallets');
    expect(s).toContain('1 linked to the owner');
    expect(s).toContain('3 with no link found');
    expect(s).toMatch(/meets the 3-independent-hirer bar as this check measures it/);
    expect(s).toMatch(/not proven independence/);
    expect(s).toMatch(/Not a safety verdict\.$/);
    expect(s).not.toMatch(/\n/);
  });

  it('says plainly when the bar is not met or there are no hires', () => {
    expect(
      hireSummary(report({ summary: { owner_linked: 3, inconclusive: 1, independent_within_limits: 0, passes_three_independent: false } })),
    ).toMatch(/does not meet the 3-independent-hirer bar/);
    expect(
      hireSummary(
        report({
          hires: { total: 0, distinct_hirers: 0, by_source: { termix_escrow: 0, erc8183_shared: 0 } },
          summary: { owner_linked: 0, inconclusive: 0, independent_within_limits: 0, passes_three_independent: false },
        }),
      ),
    ).toMatch(/No hires found/);
  });

  it('names an owner-address check by the address and its agents', () => {
    const s = hireSummary(report({ agent_id: null, agent_ids: [1, 2] }));
    expect(s).toContain(`agents 1 and 2 owned by ${OWNER}`);
  });

  it('never calls anything safe and uses no em dashes', () => {
    for (const r of [report(), report({ summary: { owner_linked: 4, inconclusive: 0, independent_within_limits: 0, passes_three_independent: false } })]) {
      const s = hireSummary(r);
      expect(s).not.toMatch(/\bsafe\b|\bscam\b|\bfraud/i);
      expect(s).not.toMatch(/—/);
    }
  });
});

describe('buildHireDeliverable', () => {
  const d = buildHireDeliverable({ orderId: 'ord1', target: { kind: 'id', id: 332962 }, report: report() });

  it('ships the JSON report and a markdown summary, each with its sha256', () => {
    expect(d.files.map((f) => [f.fileName, f.contentType])).toEqual([
      ['chainward-hire-check-332962.json', 'application/json'],
      ['chainward-hire-check-332962-summary.md', 'text/markdown'],
    ]);
    for (const f of d.files) {
      expect(f.sha256).toBe(`0x${createHash('sha256').update(f.bytes).digest('hex')}`);
      expect(f.sizeBytes).toBe(f.bytes.length);
    }
  });

  it('carries the report exactly as the x402 check returns it, limits included', () => {
    const json = JSON.parse(new TextDecoder().decode(d.files[0]!.bytes));
    expect(json.report).toEqual(report());
    expect(json.report.limits).toEqual(HIRE_LIMITS);
    expect(json.report.method).toBe(HIRE_METHOD);
    expect(json.source).toBe('https://api.chainward.ai/api/risk/hires?agent=332962&chain=bsc');
    expect(json.order_id).toBe('ord1');
    expect(json.summary).toBe(hireSummary(report()));
    expect(json.disclaimer).toMatch(/Not a safety verdict/);
  });

  it('puts every limit in the markdown summary too', () => {
    const md = new TextDecoder().decode(d.files[1]!.bytes);
    for (const l of HIRE_LIMITS) expect(md).toContain(l);
    expect(md).not.toMatch(/—/);
  });

  it('is byte-identical for the same report (a retry re-registers the same artifacts)', () => {
    const again = buildHireDeliverable({ orderId: 'ord1', target: { kind: 'id', id: 332962 }, report: report() });
    expect(again.files.map((f) => f.sha256)).toEqual(d.files.map((f) => f.sha256));
  });

  it('keeps the delivery note to the summary', () => {
    expect(d.note).toBe(hireSummary(report()));
    expect(d.message).toContain(hireSummary(report()));
  });
});

describe('ASK_FOR_INPUT_MESSAGE', () => {
  it('says what to send and that nothing is accepted until then', () => {
    expect(ASK_FOR_INPUT_MESSAGE).toMatch(/agent id/);
    expect(ASK_FOR_INPUT_MESSAGE).toMatch(/0x/);
    expect(ASK_FOR_INPUT_MESSAGE).not.toMatch(/—/);
  });
});
