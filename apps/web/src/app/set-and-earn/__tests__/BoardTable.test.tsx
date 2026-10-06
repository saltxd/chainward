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
  });
});
