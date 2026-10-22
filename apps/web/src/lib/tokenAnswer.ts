import { ApiError, type TokenReport } from './api';
import { ago } from './plainAnswer';
import { chainMeta } from './chains';

/**
 * The rug check on the report page, in plain words: what someone about to buy a Base
 * token needs first. The answer (Hold / Review / No flags), the one reason, the limit,
 * then the launch facts. Never says "safe": No flags means none of the checks matched.
 */

/** What the report page does with the free token probe it runs before the wallet report. */
export type ProbeOutcome =
  | { kind: 'token'; check: TokenReport }
  | { kind: 'not_token' }
  | { kind: 'used_up'; message: string }
  | { kind: 'slow' }
  | { kind: 'unknown' };

const NOT_TOKEN = new Set(['not_a_contract', 'not_a_token']);
/** The free token allowances: the visitor's for the hour, everyone's for the day. */
const USED_UP = new Set(['FREE_CHECKS_USED_UP', 'FREE_HOURLY_LIMIT']);

export function classifyProbe(check: TokenReport | null, err: unknown): ProbeOutcome {
  // A look-alike (a fake USDC that only emits Transfer events) is "not a token" but still gets its Hold.
  if (check) return check.flags.some((f) => NOT_TOKEN.has(f)) && !check.flags.includes('imitates_known_token') ? { kind: 'not_token' } : { kind: 'token', check };
  if (err instanceof ApiError && USED_UP.has(err.code)) return { kind: 'used_up', message: err.message };
  // Only a token gets far enough to run past the time budget; the run goes on and fills the cache.
  if (err instanceof ApiError && err.code === 'CHECK_TIMEOUT') return { kind: 'slow' };
  // Anything else (the per-minute limit, the daily cap on uncached addresses, a failed read):
  // the wallet report, as before the rug check existed.
  return { kind: 'unknown' };
}

/** How long the page waits before asking again about a check that ran past its time budget. */
const RETRY_AFTER_MS = 3_000;

/**
 * The report page's first question on Base: is this address a token? Null off Base (no rug
 * check there). A check past its time budget is asked about once more, since it is still
 * running and fills the cache.
 */
export async function runTokenProbe(
  chain: string,
  address: string,
  fetchCheck: (address: string) => Promise<{ data: TokenReport }>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<ProbeOutcome | null> {
  if (chain !== 'base') return null;
  const ask = async (): Promise<ProbeOutcome> => {
    try {
      return classifyProbe((await fetchCheck(address)).data, null);
    } catch (err) {
      return classifyProbe(null, err);
    }
  };
  const first = await ask();
  if (first.kind !== 'slow') return first;
  await sleep(RETRY_AFTER_MS);
  return ask();
}

export interface TokenAnswer {
  /** The answer card's color class: Hold, the in-between, or nothing found. */
  tone: 'hold' | 'unknown' | 'pay';
  word: string;
  headline: string;
  why: string;
  limit: string;
}

const ANSWER = {
  hold: { tone: 'hold', word: 'Hold', headline: "Don't buy yet. Something here should make you stop." },
  review: { tone: 'unknown', word: 'Review', headline: 'Look closer before you buy.' },
  no_flags: { tone: 'pay', word: 'No flags', headline: "Nothing in the launch says don't." },
} as const;

const LIMIT = "Launch facts read from the chain. It does not test whether you can sell (a honeypot) or read the contract's code.";

export function tokenAnswer(check: TokenReport): TokenAnswer {
  const a = ANSWER[check.verdict.label];
  return {
    tone: a.tone,
    word: a.word,
    headline: a.headline,
    why: check.verdict.reason,
    limit: check.verdict.label === 'no_flags' ? `${LIMIT} No flags is not a guarantee.` : LIMIT,
  };
}

export interface TokenFact {
  label: string;
  value: string;
  href?: string;
  note?: string;
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
/**
 * A deployer-chosen string, made fit to quote: no double quotes (they would end ours) and no
 * direction controls (they reorder text), cut to 40 characters.
 */
const cut = (raw: string) => {
  const s = raw
    .replace(/["\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > 40 ? `${s.slice(0, 39)}…` : s;
};
const num = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
const plural = (n: number, word: string) => `${num(n)} ${word}${n === 1 ? '' : 's'}`;

/** The engine's wording for the same spans, so the facts match the verdict's reason. */
function duration(sec: number): string {
  if (sec < 120) return plural(sec, 'second');
  if (sec < 7_200) return plural(Math.round(sec / 60), 'minute');
  return plural(Math.round(sec / 3_600), 'hour');
}

function ageAtLaunch(days: number | null): string | null {
  if (days === null) return null;
  return days === 0 ? 'first seen less than a day before the launch' : `first seen ${plural(days, 'day')} before the launch`;
}

export function tokenFacts(check: TokenReport, now: Date = new Date()): TokenFact[] {
  const base = chainMeta('base');
  const rows: TokenFact[] = [];
  const { token_info: info, launch, creator, supply } = check;

  // The name and symbol are whatever the deployer chose, so they appear quoted, as the token's own words.
  const own = [info.name ? `"${cut(info.name)}"` : null, info.symbol ? `(${cut(info.symbol)})` : null].filter(Boolean);
  rows.push({
    label: 'Token',
    value: own.length ? own.join(' ') : short(check.token),
    note: [own.length ? 'the name and symbol its contract gives itself' : null, info.total_supply !== null ? `${num(info.total_supply)} supply` : null]
      .filter(Boolean)
      .join(', ') || undefined,
    href: base.explorerAddressUrl(check.token),
  });

  if (launch) {
    rows.push({
      label: 'Launched',
      value: `${launch.time ? `${ago(launch.time, now)}, ` : ''}block ${num(launch.block)}`,
      href: launch.tx ? base.explorerTxUrl(launch.tx) : undefined,
    });
    rows.push({
      label: 'Launched through',
      // Without a launch transaction read to one wallet, there is no telling a direct deploy apart.
      value:
        launch.launcher === 'clanker'
          ? 'Clanker'
          : launch.launcher === 'virtuals'
            ? 'Virtuals'
            : !launch.tx || !launch.creator
              ? 'not traced'
              : launch.via
                ? `a contract, ${short(launch.via)}`
                : 'a direct deploy',
      note: launch.launcher_note ?? undefined,
    });
  }

  if (creator) {
    const funder = creator.first_funder;
    const madeFor = creator.role === 'made_for' ? launch?.made_for : null;
    const notes = [
      creator.type === 'contract' ? 'a contract' : null,
      ageAtLaunch(creator.age_days_at_launch),
      funder ? `first funded by ${funder.exchange_or_hub ? 'a known exchange or service' : funder.busy ? `a busy wallet, ${short(funder.address)}` : short(funder.address)}` : null,
    ].filter(Boolean);
    if (madeFor && launch?.creator) {
      // A launch service sent it: the facts describe the wallet it was made for, and the sender is named apart.
      rows.push({ label: 'Launch wallet', value: short(launch.creator), href: `/report/${launch.creator}`, note: 'sent the launch for the wallet below, as a launch service does' });
      rows.push({ label: 'Launched for', value: short(creator.address), href: `/report/${creator.address}`, note: [MADE_FOR_AS[madeFor.named_as], ...notes].join(', ') });
    } else {
      rows.push({ label: 'Launch wallet', value: short(creator.address), href: `/report/${creator.address}`, note: notes.join(', ') || undefined });
    }

    const admin = launch?.token_admin;
    if (admin && admin !== creator.address) {
      rows.push({
        label: 'Admin at launch',
        value: short(admin),
        href: `/report/${admin}`,
        // Clanker's token admin is a launch parameter: the launch can name any wallet.
        note: "not the launch wallet: the launch named this wallet as the token's admin, as when a launch service such as Clanker's X bot launches for someone",
      });
    }

    const lt = creator.launch_tokens;
    if (lt) {
      rows.push({
        label: 'Launch tokens',
        value: `got ${num(lt.received)}, sent out ${lt.sent_pct}% within a day${lt.sent_90pct_after_sec !== null ? `, 90% gone ${duration(lt.sent_90pct_after_sec)} after launch` : ''}${lt.sent_now_pct ? `, ${lt.sent_now_pct}% gone now` : ''}`,
      });
    }
    const labels = creator.labels ?? [];
    if (labels[0]) {
      const more = labels.length - 1;
      rows.push({
        label: 'Launch wallet labels',
        value: labels[0].sentence,
        href: labels[0].source_url ?? undefined,
        note: more > 0 ? `and ${more} more label${more === 1 ? '' : 's'}` : undefined,
      });
    }
    if (creator.holds_pct !== null) rows.push({ label: 'Launch wallet holds now', value: `${creator.holds_pct}% of the supply` });
    const launches = creator.launches_24h;
    if (launches) {
      const where = LAUNCHPADS.filter(([k]) => launches.by_launchpad[k] > 0).map(([k, name]) => `${num(launches.by_launchpad[k])} ${name}`);
      rows.push({ label: 'Launches within 24 hours', value: `${launches.capped ? 'at least ' : ''}${num(launches.total)}, this one included`, note: where.join(', ') || undefined });
    } else if (creator.clanker_launches_24h !== null) {
      const n = creator.clanker_launches_24h;
      rows.push({ label: 'Clanker launches, 24 hours', value: `${n >= 1_000 ? 'at least 1,000' : num(n)}, this one included` });
    }
  }

  const atLeast = supply.capped ? 'at least ' : '';
  rows.push({
    label: 'Mints after launch',
    value:
      supply.mints_after_launch === 0
        ? 'none'
        : `${atLeast}${num(supply.mints_after_launch)}${supply.to_creator > 0 ? `, ${atLeast}${num(supply.to_creator)} of them to the launch wallet` : ''}`,
  });
  rows.push({ label: 'Read at block', value: num(check.as_of_block) });
  return rows;
}

const FLAG_LINES: Record<string, { title: string; severity: 'high' | 'medium' }> = {
  imitates_known_token: { title: 'Its name or symbol passes for a well-known token such as USDC', severity: 'high' },
  creator_sanctioned: { title: 'The launch wallet is on the US sanctions list (OFAC SDN)', severity: 'high' },
  creator_funded_by_sanctioned: { title: 'The launch wallet got its first funds from a sanctioned address', severity: 'high' },
  creator_removed_liquidity: { title: 'The launch wallet took most of its liquidity back out of the pool', severity: 'high' },
  creator_minted_after_launch: { title: 'More tokens were minted to the launch wallet after launch', severity: 'high' },
  minted_after_launch: { title: 'More tokens were minted after launch', severity: 'medium' },
  creator_sent_launch_tokens: { title: 'The launch wallet sent out the tokens it got at launch', severity: 'medium' },
  creator_holds_large_share: { title: 'The launch wallet holds, or will receive as it vests, a large share of the supply', severity: 'medium' },
  creator_labeled: { title: 'The launch wallet is labeled in our investigations', severity: 'medium' },
  creator_serial_launcher: { title: 'The launch wallet launches many tokens (5 or more in a day)', severity: 'medium' },
  new_creator: { title: 'The launch wallet was brand new at launch', severity: 'medium' },
  creator_shared_funder: { title: 'The launch wallet was funded by a wallet that funded many others', severity: 'medium' },
  launch_unknown: { title: "The launch couldn't be traced to one wallet", severity: 'medium' },
};

/** How the launch named the wallet it was made for. */
const MADE_FOR_AS: Record<'token_admin' | 'payout_recipient' | 'vesting_beneficiary', string> = {
  token_admin: "the token's admin at launch",
  payout_recipient: "the coin's payout recipient",
  vesting_beneficiary: 'the wallet the token vests to',
};
const LAUNCHPADS: Array<['clanker' | 'doppler' | 'zora' | 'virtuals' | 'other', string]> = [
  ['clanker', 'through Clanker'],
  ['doppler', 'through Doppler'],
  ['zora', 'through Zora'],
  ['virtuals', 'through Virtuals'],
  ['other', 'outside these launchpads'],
];

export function tokenFlagLines(check: TokenReport): Array<{ id: string; title: string; severity: 'high' | 'medium' }> {
  // When a launch service sent the launch, the launch-wallet flags describe the wallet it was launched for.
  const who = check.creator?.role === 'made_for' ? 'The wallet it was launched for' : null;
  return check.flags.map((id) => {
    const line = FLAG_LINES[id] ?? { title: id, severity: 'medium' as const };
    return { id, ...line, title: who ? line.title.replace(/^The launch wallet/, who) : line.title };
  });
}

/** The tab title once the check has answered: the address, never the name the token gives itself. */
export function tokenTitle(check: TokenReport): string {
  return `Rug check: ${short(check.token)} on Base (${ANSWER[check.verdict.label].word})`;
}
