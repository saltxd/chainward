import { describe, expect, it } from 'vitest';
import {
  agentUrl,
  campaignClosed,
  hireCheckCurl,
  marketplaceLabel,
  registeredLabel,
  verdictLabel,
  type SetAndEarnRow,
} from '../setAndEarn';

const row = (over: Partial<SetAndEarnRow>): SetAndEarnRow => ({
  agent_id: 361259,
  name: null,
  owner: '0x' + 'a'.repeat(40),
  marketplace: 'termix',
  registered_at: null,
  registered_during_campaign: false,
  hires_total: 3,
  completed: 3,
  distinct_hirers: 3,
  by_source: { termix_escrow: 3, erc8183_shared: 0 },
  verdict_status: 'checked',
  owner_linked: 0,
  independent_within_limits: 3,
  inconclusive: 0,
  passes_three_independent: true,
  checked_at: '2026-10-06T06:00:00.000Z',
  ...over,
});

describe('verdictLabel', () => {
  it("labels ChainWard's own agent and never calls it a pass", () => {
    expect(verdictLabel(row({ ours: true }))).toEqual({ text: 'ours, not counted', tone: 'none' });
  });

  it('says pass or fail for a checked agent', () => {
    expect(verdictLabel(row({}))).toEqual({ text: 'pass', tone: 'pass' });
    expect(verdictLabel(row({ passes_three_independent: false, independent_within_limits: 1 }))).toEqual({ text: 'fail', tone: 'fail' });
  });
  it('says why there is no verdict otherwise', () => {
    expect(verdictLabel(row({ verdict_status: 'fewer_than_3_hirers' }))).toEqual({ text: 'not enough hires', tone: 'none' });
    expect(verdictLabel(row({ verdict_status: 'pending' }))).toEqual({ text: 'check pending', tone: 'none' });
    expect(verdictLabel(row({ verdict_status: 'error' }))).toEqual({ text: 'check did not finish', tone: 'none' });
  });
});

describe('marketplaceLabel', () => {
  it('names the campaign marketplaces and the rest plainly', () => {
    expect(marketplaceLabel('termix')).toBe('TermiX');
    expect(marketplaceLabel('dolphin')).toBe('Dolphin');
    expect(marketplaceLabel('agent_souk')).toBe('Agent Souk');
    expect(marketplaceLabel('other')).toBe('other');
    expect(marketplaceLabel('none')).toBe('no card');
    expect(marketplaceLabel('something-new')).toBe('something-new');
    expect(marketplaceLabel(null)).toBe('—');
  });
});

describe('registeredLabel', () => {
  it('tags an agent registered during the campaign as new, and dates an older one when its date is known', () => {
    expect(registeredLabel(row({ registered_during_campaign: true, registered_at: '2026-10-03T16:46:17.000Z' }))).toBe('new · Oct 3');
    expect(registeredLabel(row({ registered_at: '2026-09-12T08:00:00.000Z' }))).toBe('registered Sep 12');
    expect(registeredLabel(row({}))).toBeNull();
  });
});

describe('links and the paid check', () => {
  it('links an agent id to its ERC-8004 token on BscScan', () => {
    expect(agentUrl(361259)).toBe('https://bscscan.com/nft/0x8004A169FB4a3325136EB29fA0ceB6D2e539a432/361259');
  });
  it('gives the paid hire check as a curl line', () => {
    expect(hireCheckCurl()).toBe('curl -i "https://api.chainward.ai/api/risk/hires?agent=<id>&chain=bsc"');
    expect(hireCheckCurl(361259)).toBe('curl -i "https://api.chainward.ai/api/risk/hires?agent=361259&chain=bsc"');
  });
});

describe('campaignClosed', () => {
  it('is false through Nov 5 23:59:59 UTC and true after', () => {
    expect(campaignClosed(new Date('2026-11-05T23:59:59Z'))).toBe(false);
    expect(campaignClosed(new Date('2026-11-06T00:00:00Z'))).toBe(true);
  });
});
