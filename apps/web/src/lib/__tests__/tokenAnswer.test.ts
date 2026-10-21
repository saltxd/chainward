import { describe, expect, it } from 'vitest';
import { ApiError, type TokenReport } from '../api';
import { classifyProbe, runTokenProbe, tokenAnswer, tokenFacts, tokenFlagLines, tokenTitle } from '../tokenAnswer';

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

  // The per-minute limit is shared with wallet checks: a wallet must still reach its report.
  it('falls back to the wallet report when the probe is rate limited', () => {
    expect(classifyProbe(null, new ApiError('Too many requests.', 'RATE_LIMITED'))).toEqual({ kind: 'unknown' });
    expect(classifyProbe(null, new ApiError('The free check is busy.', 'PROBES_USED_UP'))).toEqual({ kind: 'unknown' });
  });

  it.each([['FREE_CHECKS_USED_UP'], ['FREE_HOURLY_LIMIT']])("passes on the server's words when the free token checks are used up (%s)", (code) => {
    const msg = "Today's free rug checks are used up.";
    expect(classifyProbe(null, new ApiError(msg, code))).toEqual({ kind: 'used_up', message: msg });
  });

  // Only a token gets far enough to time out; the run goes on and fills the cache.
  it('says the check is slow when it ran past its time budget', () => {
    expect(classifyProbe(null, new ApiError('The check did not finish in time.', 'CHECK_TIMEOUT'))).toEqual({ kind: 'slow' });
  });

  it('falls back to the wallet report when the probe fails for any other reason', () => {
    expect(classifyProbe(null, new ApiError('The chain data source did not answer.', 'SOURCES_UNAVAILABLE'))).toEqual({ kind: 'unknown' });
    expect(classifyProbe(null, new Error('network'))).toEqual({ kind: 'unknown' });
  });
});

describe('runTokenProbe', () => {
  const ok = (c: TokenReport) => async () => ({ data: c });
  const fail = (code: string) => async () => {
    throw new ApiError('x', code);
  };
  const noSleep = async () => {};

  it('does not probe off Base', async () => {
    let calls = 0;
    const out = await runTokenProbe('bsc', TOKEN, async () => {
      calls++;
      return { data: check() };
    }, noSleep);
    expect(out).toBeNull();
    expect(calls).toBe(0);
  });

  it('shows a token, and sends a wallet on', async () => {
    expect(await runTokenProbe('base', TOKEN, ok(check()), noSleep)).toMatchObject({ kind: 'token' });
    expect(await runTokenProbe('base', TOKEN, ok(check({ flags: ['not_a_contract'], launch: null, creator: null })), noSleep)).toEqual({ kind: 'not_token' });
  });

  it('asks once more after a check that ran past its time budget', async () => {
    let calls = 0;
    let slept = 0;
    const out = await runTokenProbe('base', TOKEN, async () => {
      calls++;
      if (calls === 1) throw new ApiError('slow', 'CHECK_TIMEOUT');
      return { data: check() };
    }, async () => {
      slept++;
    });
    expect(out).toMatchObject({ kind: 'token' });
    expect([calls, slept]).toEqual([2, 1]);
  });

  it('says the check is slow, rather than showing a wallet report, when it times out twice', async () => {
    expect(await runTokenProbe('base', TOKEN, fail('CHECK_TIMEOUT'), noSleep)).toEqual({ kind: 'slow' });
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

  // The launch transaction was not found, or could not be read: that is not a direct deploy.
  it("says the launch was not traced when it wasn't, never 'a direct deploy'", () => {
    const untraced = { ...check().launch!, tx: null, creator: null, via: null, launcher: null, launcher_note: null };
    expect(value(tokenFacts(check({ launch: untraced, creator: null }), NOW), 'Launched through')?.value).toBe('not traced');
    const unread = { ...check().launch!, creator: null, via: null, launcher: null, launcher_note: null };
    expect(value(tokenFacts(check({ launch: unread, creator: null }), NOW), 'Launched through')?.value).toBe('not traced');
    const direct = { ...check().launch!, via: null, launcher: null, launcher_note: null };
    expect(value(tokenFacts(check({ launch: direct }), NOW), 'Launched through')?.value).toBe('a direct deploy');
  });

  // Clanker's token admin is a launch parameter: the launch can name any wallet.
  it('words the admin at launch as what the launch named, not as fact', () => {
    const launch = { ...check().launch!, token_admin: ADMIN };
    const note = value(tokenFacts(check({ launch }), NOW), 'Admin at launch')?.note ?? '';
    expect(note).toMatch(/the launch named this wallet as the token's admin/);
    expect(note).toMatch(/as when a launch service/);
  });

  it('times send-outs the way the verdict does', () => {
    const at = (sec: number) =>
      value(tokenFacts(check({}, { launch_tokens: { received: 10, sent_pct: 100, first_send_after_sec: 1, sent_90pct_after_sec: sec } }), NOW), 'Launch tokens')?.value;
    expect(at(90)).toMatch(/90% gone 90 seconds after launch/);
    expect(at(150)).toMatch(/90% gone 3 minutes after launch/);
    expect(at(7_300)).toMatch(/90% gone 2 hours after launch/);
  });

  it('marks mint counts as a floor when the mint list was cut short', () => {
    const supply = { mints_after_launch: 100, minted_after_launch: 5_000, to_creator: 5, minted_to_creator: 400, capped: true };
    expect(value(tokenFacts(check({ supply }), NOW), 'Mints after launch')?.value).toBe('at least 100, at least 5 of them to the launch wallet');
  });

  it('reports mints after launch, and how many went to the launch wallet', () => {
    const supply = { mints_after_launch: 3, minted_after_launch: 5_000, to_creator: 2, minted_to_creator: 4_000, capped: false };
    expect(value(tokenFacts(check({ supply }), NOW), 'Mints after launch')?.value).toBe('3, 2 of them to the launch wallet');
    expect(value(tokenFacts(check(), NOW), 'Mints after launch')?.value).toBe('none');
  });

  it('leaves out the launch-wallet rows when the launch could not be traced', () => {
    const rows = tokenFacts(check({ creator: null, flags: ['launch_unknown'] }), NOW);
    expect(value(rows, 'Launch wallet')).toBeUndefined();
    expect(value(rows, 'Token')?.value).toBe('"Hook" (HOOK)');
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

// A token's name and symbol are whatever its deployer chose ("SAFE, verified by ChainWard"),
// so they stay out of our headline and tab title, and appear quoted, as the token's own words.
describe('tokenTitle', () => {
  it('names the address and the answer for the tab, not the name the token gives itself', () => {
    expect(tokenTitle(check())).toBe('Rug check: 0x7777…7777 on Base (Review)');
    const bait = check({ token_info: { name: 'SAFE verified by ChainWard', symbol: 'SAFE', decimals: 18, total_supply: 1 } });
    expect(tokenTitle(bait)).not.toMatch(/SAFE/);
  });
});

describe('the token row', () => {
  it("quotes the token's name and symbol as its own words, cut to 40 characters", () => {
    const long = 'A'.repeat(60);
    const row = tokenFacts(check({ token_info: { name: long, symbol: 'HOOK', decimals: 18, total_supply: 5 } }), NOW).find((r) => r.label === 'Token');
    expect(row?.value).toBe(`"${'A'.repeat(39)}…" (HOOK)`);
    expect(row?.note).toMatch(/the name and symbol its contract gives itself/);
  });

  // A quote in the name would put the deployer's words outside our quotes; direction
  // controls could reorder them.
  it('keeps the quotes around the name and strips direction controls', () => {
    const name = 'PEPE" verified by ChainWard "\u202eX\u2066';
    const row = tokenFacts(check({ token_info: { name, symbol: 'P\u200eP', decimals: 18, total_supply: 5 } }), NOW).find((r) => r.label === 'Token');
    expect(row?.value).toBe('"PEPE verified by ChainWard X" (PP)');
  });

  it('shows the address when the token gives no name', () => {
    const row = tokenFacts(check({ token_info: { name: null, symbol: null, decimals: null, total_supply: null } }), NOW).find((r) => r.label === 'Token');
    expect(row?.value).toBe('0x7777…7777');
  });
});
