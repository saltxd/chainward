import { describe, expect, it } from 'vitest';
import { ApiError, type TokenReport } from '../api';
import { classifyProbe, tokenAnswer, tokenFacts, tokenFlagLines, tokenTitle } from '../tokenAnswer';

// The rug check on the report page: when someone pastes a Base token, the page shows
// who launched it, how, and what the launch wallet did next, in plain words. Never "safe".

const NOW = new Date('2026-10-20T12:00:00Z');
const TOKEN = `0x${'7'.repeat(40)}`;
const CREATOR = `0x${'c'.repeat(40)}`;
const ADMIN = `0x${'a'.repeat(40)}`;
const FUNDER = `0x${'f'.repeat(40)}`;

function check(over: Partial<TokenReport> = {}, creator: Partial<NonNullable<TokenReport['creator']>> = {}): TokenReport {
  return {
    token: TOKEN,
    chain: 'base',
    verdict: { label: 'review', reason: 'The wallet that launched it was first seen less than a day before the launch.' },
    token_info: { name: 'Hook', symbol: 'HOOK', decimals: 18, total_supply: 100_000_000_000 },
    launch: {
      block: 52_800_000,
      time: '2026-10-20T09:00:00.000Z',
      tx: `0x${'1'.repeat(64)}`,
      creator: CREATOR,
      via: '0xe85a59c628f7d27878aceb4bf3b35733630083a9',
      launcher: 'clanker',
      launcher_note: "Launched through Clanker's current factory, which deploys every token from one verified template with no owner mint, pause, blacklist or transfer tax.",
      token_admin: CREATOR,
    },
    creator: {
      address: CREATOR,
      type: 'wallet',
      sanctioned: false,
      first_seen: '2026-10-20T08:00:00.000Z',
      age_days_at_launch: 0,
      sent_txs: 3,
      first_funder: { address: FUNDER, tx: `0x${'2'.repeat(64)}`, sanctioned: false, exchange_or_hub: false, funded_wallets: 2 },
      holds_pct: 0,
      launch_tokens: { received: 1_200_000_000, sent_pct: 100, first_send_after_sec: 20, sent_90pct_after_sec: 26 },
      clanker_launches_24h: 1,
      ...creator,
    },
    supply: { mints_after_launch: 0, minted_after_launch: null, to_creator: 0, minted_to_creator: null, capped: false },
    flags: ['creator_sent_launch_tokens', 'new_creator'],
    as_of_block: 52_805_000,
    limits: 'On-chain only.',
    ...over,
  };
}

const allText = (o: unknown) => JSON.stringify(o);

describe('classifyProbe', () => {
  it('shows the rug check for a token', () => {
    const c = check();
    expect(classifyProbe(c, null)).toEqual({ kind: 'token', check: c });
  });

  it.each([['not_a_contract'], ['not_a_token']])('sends a %s answer on to the wallet report', (flag) => {
    expect(classifyProbe(check({ flags: [flag], launch: null, creator: null }), null)).toEqual({ kind: 'not_token' });
  });

  it('says so when the visitor is checking too fast', () => {
    expect(classifyProbe(null, new ApiError('Too many requests.', 'RATE_LIMITED'))).toEqual({ kind: 'rate_limited' });
  });

  it("passes on the server's words when today's free checks are used up", () => {
    const msg = "Today's free rug checks are used up.";
    expect(classifyProbe(null, new ApiError(msg, 'FREE_CHECKS_USED_UP'))).toEqual({ kind: 'used_up', message: msg });
  });

  it('falls back to the wallet report when the probe fails for any other reason', () => {
    expect(classifyProbe(null, new ApiError('The chain data source did not answer.', 'SOURCES_UNAVAILABLE'))).toEqual({ kind: 'unknown' });
    expect(classifyProbe(null, new Error('network'))).toEqual({ kind: 'unknown' });
  });
});

describe('tokenAnswer', () => {
  it('answers Hold with a stop headline', () => {
    const a = tokenAnswer(check({ verdict: { label: 'hold', reason: 'The wallet that launched it is on the US Treasury OFAC SDN list.' } }));
    expect(a).toMatchObject({ tone: 'hold', word: 'Hold' });
    expect(a.headline).toMatch(/Don't buy yet/);
    expect(a.why).toMatch(/OFAC/);
  });

  it('answers Review for a flag that needs a closer look', () => {
    expect(tokenAnswer(check())).toMatchObject({ tone: 'unknown', word: 'Review' });
  });

  it('answers No flags without calling the token fine', () => {
    const a = tokenAnswer(check({ verdict: { label: 'no_flags', reason: 'None of the checks matched.' }, flags: [] }));
    expect(a).toMatchObject({ tone: 'pay', word: 'No flags' });
    expect(a.limit).toMatch(/not a guarantee/);
  });

  it('names what it does not test: selling (honeypots) and the contract code', () => {
    const a = tokenAnswer(check());
    expect(a.limit).toMatch(/honeypot/);
    expect(a.limit).toMatch(/code/);
  });

  it.each([['hold'], ['review'], ['no_flags']] as const)('never says safe, and uses no em dashes (%s)', (label) => {
    const a = tokenAnswer(check({ verdict: { label, reason: 'x' } }));
    expect(allText(a)).not.toMatch(/\bsafe\b/i);
    expect(allText(a)).not.toContain('—');
  });
});

describe('tokenFacts', () => {
  const value = (rows: ReturnType<typeof tokenFacts>, label: string) => rows.find((r) => r.label === label);

  it('links the launch wallet to its own free check, with its age and funder', () => {
    const row = value(tokenFacts(check(), NOW), 'Launch wallet');
    expect(row?.href).toBe(`/report/${CREATOR}`);
    expect(row?.value).toMatch(/^0xcccc…cccc/);
    expect(row?.note).toMatch(/first seen less than a day before the launch/);
    expect(row?.note).toMatch(/first funded by 0xffff…ffff/);
  });

  it('says how fast the launch tokens went', () => {
    const row = value(tokenFacts(check(), NOW), 'Launch tokens');
    expect(row?.value).toMatch(/got 1,200,000,000/);
    expect(row?.value).toMatch(/90% gone 26 seconds after launch/);
  });

  it('counts Clanker launches by the same wallet in the day, with a floor at 1,000', () => {
    expect(value(tokenFacts(check({}, { clanker_launches_24h: 97 }), NOW), 'Clanker launches, 24 hours')?.value).toBe('97, this one included');
    expect(value(tokenFacts(check({}, { clanker_launches_24h: 1000 }), NOW), 'Clanker launches, 24 hours')?.value).toBe('at least 1,000, this one included');
    expect(value(tokenFacts(check({}, { clanker_launches_24h: null }), NOW), 'Clanker launches, 24 hours')).toBeUndefined();
  });

  it('names the admin at launch only when a launch service sent the launch for it', () => {
    expect(value(tokenFacts(check(), NOW), 'Admin at launch')).toBeUndefined();
    const launch = { ...check().launch!, token_admin: ADMIN };
    const row = value(tokenFacts(check({ launch }), NOW), 'Admin at launch');
    expect(row?.href).toBe(`/report/${ADMIN}`);
    expect(row?.note).toMatch(/not the launch wallet/);
  });

  it('says when it launched and links the launch transaction', () => {
    const row = value(tokenFacts(check(), NOW), 'Launched');
    expect(row?.value).toMatch(/3 hours ago/);
    expect(row?.href).toBe(`https://basescan.org/tx/0x${'1'.repeat(64)}`);
  });

  it('reports mints after launch, and how many went to the launch wallet', () => {
    const supply = { mints_after_launch: 3, minted_after_launch: 5_000, to_creator: 2, minted_to_creator: 4_000, capped: false };
    expect(value(tokenFacts(check({ supply }), NOW), 'Mints after launch')?.value).toBe('3, 2 of them to the launch wallet');
    expect(value(tokenFacts(check(), NOW), 'Mints after launch')?.value).toBe('none');
  });

  it('leaves out the launch-wallet rows when the launch could not be traced', () => {
    const rows = tokenFacts(check({ creator: null, flags: ['launch_unknown'] }), NOW);
    expect(value(rows, 'Launch wallet')).toBeUndefined();
    expect(value(rows, 'Token')?.value).toMatch(/Hook \(HOOK\)/);
  });
});

describe('tokenFlagLines', () => {
  it('words each flag plainly, the hold ones as high', () => {
    const lines = tokenFlagLines(check({ flags: ['creator_sanctioned', 'creator_serial_launcher'] }));
    expect(lines[0]).toMatchObject({ id: 'creator_sanctioned', severity: 'high' });
    expect(lines[1]).toMatchObject({ id: 'creator_serial_launcher', severity: 'medium' });
    expect(lines[1]!.title).toMatch(/Clanker/);
  });

  it('keeps a flag it has no words for, by its id', () => {
    expect(tokenFlagLines(check({ flags: ['something_new'] }))[0]).toMatchObject({ id: 'something_new', title: 'something_new' });
  });
});

describe('tokenTitle', () => {
  it('names the token and the answer for the tab', () => {
    expect(tokenTitle(check())).toBe('Rug check: HOOK on Base (Review)');
    expect(tokenTitle(check({ token_info: { name: null, symbol: null, decimals: null, total_supply: null } }))).toBe('Rug check: 0x7777…7777 on Base (Review)');
  });
});
