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
  | { kind: 'rate_limited' }
  | { kind: 'used_up'; message: string }
  | { kind: 'unknown' };

const NOT_TOKEN = new Set(['not_a_contract', 'not_a_token']);

export function classifyProbe(check: TokenReport | null, err: unknown): ProbeOutcome {
  if (check) return check.flags.some((f) => NOT_TOKEN.has(f)) ? { kind: 'not_token' } : { kind: 'token', check };
  if (err instanceof ApiError && err.code === 'RATE_LIMITED') return { kind: 'rate_limited' };
  if (err instanceof ApiError && err.code === 'FREE_CHECKS_USED_UP') return { kind: 'used_up', message: err.message };
  // Unreadable or failed: the wallet report, as before the rug check existed.
  return { kind: 'unknown' };
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
/** A deployer-chosen string, cut to 40 characters. */
const cut = (s: string) => (s.length > 40 ? `${s.slice(0, 39)}…` : s);
const num = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
const plural = (n: number, word: string) => `${num(n)} ${word}${n === 1 ? '' : 's'}`;

function duration(sec: number): string {
  if (sec < 60) return plural(sec, 'second');
  if (sec < 3_600) return plural(Math.round(sec / 60), 'minute');
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
      value:
        launch.launcher === 'clanker'
          ? 'Clanker'
          : launch.launcher === 'virtuals'
            ? 'Virtuals'
            : launch.via
              ? `a contract, ${short(launch.via)}`
              : 'a direct deploy',
      note: launch.launcher_note ?? undefined,
    });
  }

  if (creator) {
    const funder = creator.first_funder;
    const notes = [
      creator.type === 'contract' ? 'a contract' : null,
      ageAtLaunch(creator.age_days_at_launch),
      funder ? `first funded by ${funder.exchange_or_hub ? 'an exchange or hub' : short(funder.address)}` : null,
    ].filter(Boolean);
    rows.push({ label: 'Launch wallet', value: short(creator.address), href: `/report/${creator.address}`, note: notes.join(', ') || undefined });

    const admin = launch?.token_admin;
    if (admin && admin !== creator.address) {
      rows.push({
        label: 'Admin at launch',
        value: short(admin),
        href: `/report/${admin}`,
        note: 'not the launch wallet: a launch service sent the launch for this wallet',
      });
    }

    const lt = creator.launch_tokens;
    if (lt) {
      rows.push({
        label: 'Launch tokens',
        value: `got ${num(lt.received)}, sent out ${lt.sent_pct}% within a day${lt.sent_90pct_after_sec !== null ? `, 90% gone ${duration(lt.sent_90pct_after_sec)} after launch` : ''}`,
      });
    }
    if (creator.holds_pct !== null) rows.push({ label: 'Launch wallet holds now', value: `${creator.holds_pct}% of the supply` });
    if (creator.clanker_launches_24h !== null) {
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
        : `${atLeast}${num(supply.mints_after_launch)}${supply.to_creator > 0 ? `, ${num(supply.to_creator)} of them to the launch wallet` : ''}`,
  });
  rows.push({ label: 'Read at block', value: num(check.as_of_block) });
  return rows;
}

const FLAG_LINES: Record<string, { title: string; severity: 'high' | 'medium' }> = {
  creator_sanctioned: { title: 'The launch wallet is on the US sanctions list (OFAC SDN)', severity: 'high' },
  creator_funded_by_sanctioned: { title: 'The launch wallet got its first funds from a sanctioned address', severity: 'high' },
  creator_minted_after_launch: { title: 'More tokens were minted to the launch wallet after launch', severity: 'high' },
  minted_after_launch: { title: 'More tokens were minted after launch', severity: 'medium' },
  creator_sent_launch_tokens: { title: 'The launch wallet sent out its launch tokens within the hour', severity: 'medium' },
  creator_holds_large_share: { title: 'The launch wallet holds a large share of the supply', severity: 'medium' },
  creator_serial_launcher: { title: 'The launch wallet launches many tokens through Clanker (5 or more in a day)', severity: 'medium' },
  new_creator: { title: 'The launch wallet was brand new at launch', severity: 'medium' },
  creator_shared_funder: { title: 'The launch wallet was funded by a wallet that funded many others', severity: 'medium' },
  launch_unknown: { title: "The launch couldn't be traced to one wallet", severity: 'medium' },
};

export function tokenFlagLines(check: TokenReport): Array<{ id: string; title: string; severity: 'high' | 'medium' }> {
  return check.flags.map((id) => ({ id, ...(FLAG_LINES[id] ?? { title: id, severity: 'medium' as const }) }));
}

/** The tab title once the check has answered: the address, never the name the token gives itself. */
export function tokenTitle(check: TokenReport): string {
  return `Rug check: ${short(check.token)} on Base (${ANSWER[check.verdict.label].word})`;
}
