import type { RiskFlag, RiskReport } from './api';

/**
 * The answer card at the top of a report: what someone about to pay or hire this
 * address needs first. The decision (Pay / Hold / Unknown, from the server), what
 * it means in plain words, the one reason with readable numbers, and the limit.
 * Never says "safe": Pay means nothing was found against paying.
 */
export interface PlainAnswer {
  label: 'pay' | 'hold' | 'unknown';
  word: string;
  headline: string;
  why: string;
  checked: number;
  raised: number;
  limit: string;
  checkedAgo: string;
  stale: boolean;
}

const HEADLINE: Record<PlainAnswer['label'], string> = {
  pay: "Nothing we can see says don't.",
  hold: "Don't pay yet. Something here should make you stop.",
  unknown: 'Not enough history to judge. Treat it like a stranger: start small.',
};

const LIMIT: Record<PlainAnswer['label'], string> = {
  pay: 'On-chain only, last 30 days. Pay means nothing was found against it, not a guarantee.',
  hold: "On-chain only. We can't see promises made off-chain.",
  unknown: "On-chain only. We can't see promises made off-chain.",
};

const SEVERITY_ORDER: Record<RiskFlag['severity'], number> = { high: 3, medium: 2, low: 1, info: 0 };

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

function holdWhy(flag: RiskFlag | undefined, w: NonNullable<RiskReport['coverage']>['window'] | undefined, days: number): string | null {
  if (!flag) return null;
  switch (flag.id) {
    case 'stranded_value': {
      const amount = usdc(flag.evidence);
      return amount
        ? `This wallet holds ${amount} USDC but hasn't moved any tokens in the last ${days} days.`
        : `This wallet holds USDC but hasn't moved any tokens in the last ${days} days.`;
    }
    case 'dormant_wallet':
      return `This wallet hasn't moved any tokens in the last ${days} days.`;
    case 'counterparty_concentration':
      return w
        ? `Its ${int(w.transfers_30d)} transfers in the last ${days} days all went to or from just ${plural(w.unique_counterparties_30d, 'wallet')}.`
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
  const days = w?.days ?? 30;

  let why: string | null = null;
  if (label === 'pay' && w) {
    const last = w.latest_transfer_at ? `, the last one ${ago(w.latest_transfer_at, now)}` : '';
    why = `${int(w.transfers_30d)}${w.transfers_truncated ? '+' : ''} transfers with ${int(w.unique_counterparties_30d)} different wallet${w.unique_counterparties_30d === 1 ? '' : 's'} in the last ${days} days${last}.`;
  } else if (label === 'hold') {
    const top = [...report.flags].sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity])[0];
    why = holdWhy(top, w, days);
  } else if (label === 'unknown') {
    if (w?.transfers_unavailable) why = "We couldn't read this wallet's history just now. Re-check in a minute.";
    else if (w && w.transfers_30d === 0) why = `No token transfers on this chain in the last ${days} days.`;
  }

  const checks = report.coverage?.checks ?? [];
  return {
    label,
    word: v.text,
    headline: HEADLINE[label],
    why: why ?? tidyNumbers(v.reason),
    checked: checks.length,
    raised: checks.filter((c) => (c.status ?? (c.raised ? 'raised' : 'not_raised')) === 'raised').length,
    limit: LIMIT[label],
    checkedAgo: ago(report.freshness.generated_at, now),
    stale: report.freshness.ttl_state === 'stale',
  };
}
