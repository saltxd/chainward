import type { RiskBand, RiskFlag } from '@/lib/api';
import type { PaidCheckKind } from '@/lib/paidChecks';
import { BAND_LABEL } from '@/lib/risk';
import { chainQuery } from '@/lib/chains';
import { proxiedPayersLabel, type ProxiedPayers } from '@/lib/x402Board';

// The `data` of a paid check, as the press pages show it. Types are the fields
// read here, not the full API documents (packages/decode is the authority).

/** One line a buyer can act on, from the API; older cached results may lack it. */
export interface VerdictData {
  label: string;
  text: string;
  reason: string;
  limits: string;
}

export function VerdictLine({ verdict }: { verdict?: VerdictData | null }) {
  if (!verdict) return null;
  return (
    <div className={`pay-verdict pay-verdict--${verdict.label}`}>
      <div className="pay-verdict-head">
        <span className="pay-verdict-tag">Verdict</span>
        <strong className="pay-verdict-text">{verdict.text}</strong>
      </div>
      <p className="pay-verdict-reason">{verdict.reason}</p>
      <p className="pay-verdict-limits">{verdict.limits}</p>
    </div>
  );
}

interface SellerData {
  address: string;
  verdict?: VerdictData;
  chain?: string;
  buyers_checked: number;
  seller_funded: { buyers: number; volume_share: number | null };
  paid_back_share: number | null;
  common_first_funder: { address: string; buyer_share: number } | null;
  proxied_payers?: ProxiedPayers[];
  signals: { id: string; title: string; evidence: string }[];
  notes?: string[];
  disclaimer?: string;
}

type HirerVerdict = 'owner' | 'owner_funded' | 'direct_transfer' | 'shared_funder' | 'independent_within_limits' | 'inconclusive';

interface HiresData {
  agent_id: number | null;
  owner: string;
  window_days: number;
  hires: { total: number; distinct_hirers: number };
  hirers: { address: string; hires: number; verdict: HirerVerdict; evidence: string }[];
  summary: { owner_linked: number; inconclusive: number; independent_within_limits: number; passes_three_independent: boolean };
  verdict?: VerdictData;
}

type CounterpartyData =
  | {
      status: 'ready';
      report: { address: string; chain?: string; band: RiskBand; flags: RiskFlag[]; disclaimer?: string; verdict?: VerdictData };
    }
  | { status: 'no_history'; address: string; chain?: string; disclaimer?: string; verdict?: VerdictData };

const VERDICT: Record<HirerVerdict, string> = {
  owner: 'the owner',
  owner_funded: 'funded by the owner',
  direct_transfer: 'moved funds with the owner',
  shared_funder: 'shares a funder with the owner',
  independent_within_limits: 'no link found within limits',
  inconclusive: 'inconclusive',
};

const pct = (n: number | null | undefined) => (n == null ? 'n/a' : `${Math.round(n * 100)}%`);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const explorer = (chain: string | undefined, address: string) =>
  chain === 'bsc' ? `https://bscscan.com/address/${address}` : `https://base.blockscout.com/address/${address}`;

function isSeller(d: unknown): d is SellerData {
  const x = d as SellerData;
  return !!x && Array.isArray(x.signals) && typeof x.buyers_checked === 'number' && !!x.seller_funded;
}
function isHires(d: unknown): d is HiresData {
  const x = d as HiresData;
  return !!x && Array.isArray(x.hirers) && !!x.summary && !!x.hires;
}
function isCounterparty(d: unknown): d is CounterpartyData {
  const x = d as CounterpartyData;
  return !!x && (x.status === 'no_history' || (x.status === 'ready' && Array.isArray(x.report?.flags)));
}

function Disclaimer({ text }: { text?: string }) {
  return text ? <p className="pay-disclaimer">{text}</p> : null;
}

function SellerResult({ d }: { d: SellerData }) {
  return (
    <>
      <VerdictLine verdict={d.verdict} />
      <p className="pay-lede">
        {d.seller_funded.buyers} of {d.buyers_checked} top buyers checked trace back to the seller (
        {pct(d.seller_funded.volume_share)} of their volume). Sent back to buyers: {pct(d.paid_back_share)}.
        {d.common_first_funder &&
          ` Largest common funder: ${short(d.common_first_funder.address)}, for ${pct(d.common_first_funder.buyer_share)} of buyers.`}
      </p>
      {(d.proxied_payers ?? []).map((p) => (
        <p key={p.proxy} className="pay-sub">
          {proxiedPayersLabel(p)}
        </p>
      ))}
      {d.signals.length === 0 ? (
        <p className="pay-sub">No signals raised.</p>
      ) : (
        <ul className="pay-list">
          {d.signals.map((s) => (
            <li key={s.id}>
              <strong>{s.title}</strong>
              <span>{s.evidence}</span>
            </li>
          ))}
        </ul>
      )}
      {(d.notes ?? []).map((n) => (
        <p key={n} className="pay-sub">
          {n}
        </p>
      ))}
      <Disclaimer text={d.disclaimer} />
    </>
  );
}

function HiresResult({ d }: { d: HiresData }) {
  const passes = d.summary.passes_three_independent;
  return (
    <>
      <VerdictLine verdict={d.verdict} />
      <p className="pay-lede">
        {d.agent_id != null ? `Agent #${d.agent_id}: ` : `Agents of ${short(d.owner)}: `}
        {d.hires.total} hires from {d.hires.distinct_hirers} distinct hirers in {d.window_days} days.{' '}
        <strong>{passes ? '3 or more independent hirers.' : 'Fewer than 3 independent hirers.'}</strong>
      </p>
      <p className="pay-sub">
        Linked to the owner: {d.summary.owner_linked} · inconclusive: {d.summary.inconclusive} · no link found within limits:{' '}
        {d.summary.independent_within_limits}
      </p>
      {d.hirers.length > 0 && (
        <div className="pay-scroll">
          <table className="pay-table">
            <thead>
              <tr>
                <th>Hirer</th>
                <th>Hires</th>
                <th>Verdict</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {d.hirers.map((h) => (
                <tr key={h.address}>
                  <td>
                    <a className="press-link" href={explorer('bsc', h.address)} target="_blank" rel="noopener noreferrer">
                      {short(h.address)}
                    </a>
                  </td>
                  <td>{h.hires}</td>
                  <td>{VERDICT[h.verdict] ?? h.verdict}</td>
                  <td className="pay-evidence">{h.evidence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="pay-disclaimer">
        No link found within limits is not proven independence. Describes money flows, never intent.
      </p>
    </>
  );
}

function CounterpartyResult({ d }: { d: CounterpartyData }) {
  if (d.status === 'no_history') {
    return (
      <>
        <VerdictLine verdict={d.verdict} />
        <p className="pay-lede">No on-chain history for this address.</p>
        <Disclaimer text={d.disclaimer} />
      </>
    );
  }
  const r = d.report;
  return (
    <>
      <VerdictLine verdict={r.verdict} />
      <p className="pay-lede">
        Band: <strong>{BAND_LABEL[r.band] ?? r.band}</strong> · {r.flags.length} flag{r.flags.length === 1 ? '' : 's'}
      </p>
      {r.flags.length === 0 ? (
        <p className="pay-sub">No flags surfaced in the window checked. Not a safety verdict.</p>
      ) : (
        <ul className="pay-list">
          {r.flags.map((f) => (
            <li key={f.id}>
              <strong>
                <span className={`pay-sev pay-sev--${f.severity}`}>{f.severity}</span> {f.title}
              </strong>
              <span>
                {f.evidence}{' '}
                {f.source && (
                  <a className="press-link" href={f.source} target="_blank" rel="noopener noreferrer">
                    source
                  </a>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="pay-sub">
        <a className="press-link" href={`/report/${r.address}${chainQuery(r.chain)}`}>
          Full report
        </a>
      </p>
      <Disclaimer text={r.disclaimer} />
    </>
  );
}

/** A paid check's result, readable. Falls back to the JSON when the shape is unexpected. */
export function CheckResult({ kind, data }: { kind: PaidCheckKind | null; data: unknown }) {
  if (kind === 'seller' && isSeller(data)) return <SellerResult d={data} />;
  if (kind === 'hires' && isHires(data)) return <HiresResult d={data} />;
  if (kind === 'counterparty' && isCounterparty(data)) return <CounterpartyResult d={data} />;
  return <pre className="pay-json">{JSON.stringify(data, null, 2)}</pre>;
}
