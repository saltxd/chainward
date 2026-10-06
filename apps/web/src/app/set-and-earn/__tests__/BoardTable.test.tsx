import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BoardTable } from '../BoardTable';
import type { SetAndEarnRow } from '@/lib/setAndEarn';

const base: SetAndEarnRow = {
  agent_id: 361259,
  name: 'Plinth keeper',
  owner: '0x' + 'a'.repeat(40),
  marketplace: 'termix',
  registered_at: '2026-10-03T10:00:00.000Z',
  registered_during_campaign: true,
  hires_total: 4,
  completed: 3,
  distinct_hirers: 3,
  by_source: { termix_escrow: 4, erc8183_shared: 0 },
  verdict_status: 'checked',
  owner_linked: 0,
  independent_within_limits: 3,
  inconclusive: 0,
  passes_three_independent: true,
  checked_at: '2026-10-06T06:00:00.000Z',
};

describe('BoardTable', () => {
  it('links each agent to BscScan and shows hires, hirers, independent hirers and the verdict', () => {
    const html = renderToStaticMarkup(
      <BoardTable
        generatedAt="2026-10-06T06:30:00.000Z"
        rows={[
          base,
          { ...base, agent_id: 362889, name: null, marketplace: 'dolphin', hires_total: 1, completed: 0, distinct_hirers: 1, verdict_status: 'fewer_than_3_hirers', owner_linked: null, independent_within_limits: null, inconclusive: null, passes_three_independent: false, checked_at: null },
        ]}
      />,
    );
    expect(html).toContain('href="https://bscscan.com/nft/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/361259"');
    expect(html).toContain('Plinth keeper');
    expect(html).toContain('TermiX');
    expect(html).toContain('3 completed');
    expect(html).toContain('pass');
    expect(html).toContain('Dolphin');
    expect(html).toContain('not enough hires');
    expect(html).not.toMatch(/fake|scam|dirty|fraud/i);
    expect(html).not.toContain('as of');
    expect(html).toContain('new · Oct 3');
  });

  it('shows an older agent, and one the registry could not be read for', () => {
    const html = renderToStaticMarkup(
      <BoardTable
        generatedAt="2026-10-06T06:30:00.000Z"
        rows={[
          { ...base, agent_id: 352475, name: null, registered_during_campaign: false, registered_at: '2026-09-12T08:00:00.000Z' },
          { ...base, agent_id: 332962, name: null, owner: null, marketplace: null, registered_during_campaign: false, registered_at: null },
        ]}
      />,
    );
    expect(html).toContain('registered Sep 12');
    expect(html).not.toContain('new ·');
    expect(html).toContain('<td>—</td>');
  });

  it('dates a verdict carried over from an earlier day', () => {
    const html = renderToStaticMarkup(
      <BoardTable generatedAt="2026-10-09T06:30:00.000Z" rows={[{ ...base, checked_at: '2026-10-07T06:10:00.000Z' }]} />,
    );
    expect(html).toContain('as of Oct 7');
  });
});
