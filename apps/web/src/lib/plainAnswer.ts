import type { RiskFlag, RiskReport } from './api';
import { windowSpan } from './risk';

/**
 * The answer card at the top of a report: what someone about to pay or hire this
 * address needs first. The decision (Pay / Hold, or which kind of not-enough-to-judge), what
 * it means in plain words, the one reason with readable numbers, and the limit.
 * Never says "safe": Pay means nothing was found against paying.
 */
export interface PlainAnswer {
  label: 'pay' | 'hold' | 'unknown';
  word: string;
  headline: string;
  why: string;
  /** What to do about it, for the third answer. */
  advice?: string;
  checked: number;
  raised: number;
  limit: string;
  checkedAgo: string;
  stale: boolean;
}

const HEADLINE: Record<'pay' | 'hold', string> = {
  pay: "Nothing we can see says don't.",
  hold: "Don't pay yet. Something here should make you stop.",
};

/** The third answer, by case: the server's label is 'unknown' for all three. */
type UnknownCase = 'inactive' | 'new' | 'unread';
const UNKNOWN: Record<UnknownCase, { word: string; headline: string; advice: string }> = {
  inactive: {
    word: 'Inactive',
    headline: 'Nothing recent to go on.',
    advice: "If it's meant to be a working agent, ask why before you pay, or start small.",
  },
  new: { word: 'No track record', headline: 'Brand new: no history yet.', advice: 'Treat it like a stranger: start small.' },
  unread: { word: "Couldn't check", headline: "We couldn't read the chain just now.", advice: 'Re-check in a minute.' },
};

/** The limit line; Pay names the transfer window read (30 days on Base, 14 on BNB Chain). */
function limitFor(label: PlainAnswer['label'], span: string): string {
  return label === 'pay'
    ? `On-chain only, last ${span}. Pay means nothing was found against it, not a guarantee.`
    : "On-chain only. We can't see promises made off-chain.";
}

const SEVERITY_ORDER: Record<RiskFlag['severity'], number> = { high: 3, medium: 2, low: 1, info: 0 };
/** Silence after which the check calls a wallet dormant (7 days). */
const DORMANT_AFTER_MS = 7 * 24 * 3_600_000;

function int(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

function plural(n: number, word: string): string {
  return `${int(n)} ${word}${n === 1 ? '' : 's'}`;
}

/** "under an hour ago", "3 hours ago", "1 day ago". */
export function ago(iso: string, now: Date = new Date()): string {
  const ms = now.getTime() - new Date(iso).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return 'under an hour ago';
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * Long decimals and big integers in evidence text, made readable:
 * "5451.386272 USDC" → "5,451.39 USDC", "2000 transfers" → "2,000 transfers".
 * Hex, dates and times are left alone.
 */
export function tidyNumbers(text: string): string {
  return text.replace(/(?<![\w.\-:/])(\d+)(\.\d+)?(?![\w\-:/]|\.\d)/g, (_m, whole: string, frac?: string) => {
    const n = Number(`${whole}${frac ?? ''}`);
    if (!Number.isFinite(n)) return _m;
    if (frac && frac.length > 3) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (frac) return `${Number(whole).toLocaleString('en-US')}${frac}`;
    return Number(whole).toLocaleString('en-US');
  });
}

/** An explorer address link, pointed at the address's token transfers so "check it yourself" shows the transactions. */
export function transferHistoryUrl(url: string): string {
  try {
    const u = new URL(url);
    if (!u.pathname.startsWith('/address/')) return url;
    if (u.host.endsWith('blockscout.com')) {
      u.searchParams.set('tab', 'token_transfers');
      return u.toString();
    }
    if (u.host.endsWith('bscscan.com')) {
      u.hash = 'tokentxns';
      return u.toString();
    }
    return url;
  } catch {
    return url;
  }
}

function usdc(evidence: string): string | null {
  const m = evidence.match(/Holds ([\d.,]+) USDC/);
  if (!m) return null;
  const n = Number(m[1]!.replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  return n >= 10 ? int(n) : n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function holdWhy(
  flag: RiskFlag | undefined,
  w: NonNullable<RiskReport['coverage']>['window'] | undefined,
  days: string,
  checkedAt: Date,
): string | null {
  if (!flag) return null;
  // Dormant is over a week of silence, so a dormant wallet can still have
  // transfers in the window: then say how long it had been quiet when checked,
  // not "in the last 14 days".
  const latest = w?.latest_transfer_at ? new Date(w.latest_transfer_at) : null;
  const quiet =
    latest && checkedAt.getTime() - latest.getTime() > DORMANT_AFTER_MS
      ? `in ${ago(latest.toISOString(), checkedAt).replace(/ ago$/, '')}`
      : `in the last ${days}`;
  switch (flag.id) {
    case 'ofac_sanctioned':
      return 'This address is on the US Treasury sanctions list. Paying it may be illegal for US persons.';
    case 'stranded_value': {
      const amount = usdc(flag.evidence);
      return amount
        ? `This wallet holds ${amount} USDC but hasn't moved any tokens ${quiet}.`
        : `This wallet holds USDC but hasn't moved any tokens ${quiet}.`;
    }
    case 'dormant_wallet':
      return `This wallet hasn't moved any tokens ${quiet}.`;
    case 'counterparty_concentration':
      return w
        ? `Its ${int(w.transfers_30d)} transfers in the last ${days} all went to or from just ${plural(w.unique_counterparties_30d, 'wallet')}.`
        : null;
    case 'claim_vs_chain_offline':
      return "It's listed as online on Virtuals, but the chain shows it idle.";
    case 'cluster_collapsed':
      return 'Most wallets in its peer group have gone quiet.';
    case 'factory_proxy_clone':
      return "It's a copy of a Virtuals factory contract, not custom code.";
    case 'inactive_no_history':
      return "We can't see any token transfers for this wallet.";
    default:
      return null;
  }
}

export function plainAnswer(report: RiskReport, now: Date = new Date()): PlainAnswer | null {
  const v = report.verdict;
  if (!v) return null;
  const label: PlainAnswer['label'] = v.label === 'pay' || v.label === 'hold' ? v.label : 'unknown';
  const w = report.coverage?.window;
  // "30 days", "14 days", "4.6 days": the window the scan really covered.
  const days = windowSpan(w?.days);

  let why: string | null = null;
  if (label === 'pay' && w) {
    const last = w.latest_transfer_at ? `, the last one ${ago(w.latest_transfer_at, now)}` : '';
    why = `${int(w.transfers_30d)}${w.transfers_truncated ? '+' : ''} transfers with ${int(w.unique_counterparties_30d)} different wallet${w.unique_counterparties_30d === 1 ? '' : 's'} in the last ${days}${last}.`;
  } else if (label === 'hold') {
    // A sanctions match is the reason whenever it is there, as on the server.
    const top =
      report.flags.find((f) => f.id === 'ofac_sanctioned') ??
      [...report.flags].sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity])[0];
    why = holdWhy(top, w, days, new Date(report.freshness.generated_at));
  }

  let word = v.text;
  let headline = label === 'unknown' ? '' : HEADLINE[label];
  let advice: string | undefined;
  if (label === 'unknown') {
    const sent = w?.sent_tx_count;
    const unread = Boolean(w?.transfers_unavailable) || /could not be read|unavailable/i.test(v.reason);
    const kind: UnknownCase = unread ? 'unread' : typeof sent === 'number' && sent > 0 ? 'inactive' : 'new';
    ({ word, headline, advice } = UNKNOWN[kind]);
    if (kind === 'inactive' && typeof sent === 'number') {
      why = `This wallet has sent ${plural(sent, 'transaction')} in its life, but hasn't moved any tokens in the last ${days}.`;
    } else if (kind === 'new' && w && w.transfers_30d === 0) {
      why = `No token transfers or sent transactions on this chain in the last ${days}.`;
    } else if (kind === 'unread') {
      why = "We couldn't read this wallet's history, so there's nothing to judge yet.";
    }
  }

  const checks = report.coverage?.checks ?? [];
  return {
    label,
    word,
    headline,
    why: why ?? tidyNumbers(v.reason),
    ...(advice ? { advice } : {}),
    checked: checks.length,
    raised: checks.filter((c) => (c.status ?? (c.raised ? 'raised' : 'not_raised')) === 'raised').length,
    limit: limitFor(label, days),
    checkedAgo: ago(report.freshness.generated_at, now),
    stale: report.freshness.ttl_state === 'stale',
  };
}
