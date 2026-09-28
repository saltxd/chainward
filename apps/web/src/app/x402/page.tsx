import Link from 'next/link';
import { PressShell, Masthead, PressDateline, Colophon } from '@/components/press';

const API_INTERNAL_URL = process.env.API_INTERNAL_URL || 'http://localhost:8000';

export const revalidate = 1800;

export const metadata = {
  title: 'x402 Seller Board — where Base’s top x402 sellers’ buyers get their USDC',
  description:
    'Every week, Base’s largest x402 sellers by volume, and where their buyers’ USDC comes from: how much traces back to the seller, how much it pays back, and whether one wallet funds most buyers. On-chain, neutral, never a verdict.',
  alternates: { canonical: 'https://chainward.ai/x402' },
  openGraph: {
    title: 'x402 Seller Board',
    description: 'Where Base’s top x402 sellers’ buyers get their USDC. Updated weekly from on-chain data.',
    images: [{ url: '/chainward-og.png', width: 1200, height: 630 }],
  },
};

interface Signal {
  id: string;
  title: string;
  evidence: string;
}
interface Report {
  buyers_checked: number;
  seller_funded: { buyers: number; volume_share: number | null; hops: Record<string, number> };
  paid_back_share: number | null;
  common_first_funder: { address: string; buyer_share: number } | null;
  signals: Signal[];
}
interface Row {
  seller: string;
  label: string | null;
  x402scan_7d: { volume_usd: number; settlements: number; buyers: number };
  report: Report | null;
  error?: string;
}
interface Board {
  generated_at: string;
  as_of_block: string;
  check_window_days: number;
  rows: Row[];
}

async function getBoard(): Promise<Board | null> {
  try {
    const res = await fetch(`${API_INTERNAL_URL}/api/x402/board`, { next: { revalidate: 1800 } });
    if (!res.ok) return null;
    return ((await res.json()) as { data: Board }).data;
  } catch {
    return null;
  }
}

const usd = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
const pct = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n * 100)}%`);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function traced(r: Report): string {
  if (r.buyers_checked === 0) return '—';
  const hops = Object.keys(r.seller_funded.hops).map(Number);
  const via = hops.length ? ` · ${Math.min(...hops)}–${Math.max(...hops)} hops` : '';
  return `${r.seller_funded.buyers}/${r.buyers_checked}${via}`;
}

export default async function X402BoardPage() {
  const board = await getBoard();

  return (
    <PressShell>
      <PressDateline />
      <div className="press-wrap">
        <Masthead />

        <section className="xb-hero">
          <div className="press-fileno">x402 Seller Board · Base · weekly</div>
          <h1 className="xb-title press-display">
            Where do their buyers get <em>their USDC?</em>
          </h1>
          <p className="xb-lede">
            Base’s largest x402 sellers by 7-day volume (x402scan’s ranking), each run through
            ChainWard’s seller check: for its top 30 buyers, we follow each one’s largest funder back up
            to four hops and see whether the trail reaches the seller. Volume and buyer counts say how
            much moved. This says whose money it was.
          </p>
          {board && (
            <div className="xb-meta">
              <span>updated {new Date(board.generated_at).toUTCString().slice(5, 22)} UTC</span>
              <span>block {Number(board.as_of_block).toLocaleString('en-US')}</span>
              <span>{board.check_window_days}-day funding window</span>
            </div>
          )}
        </section>

        <hr className="press-rule" />

        {!board ? (
          <section className="xb-section">
            <p className="xb-p">The first board is being built. Check back shortly.</p>
          </section>
        ) : (
          <section className="xb-section">
            <div className="xb-scroll">
              <table className="xb-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Seller (x402scan label)</th>
                    <th>7-day volume · buyers</th>
                    <th>Top buyers tracing back to seller</th>
                    <th>Share of their volume</th>
                    <th>Sent back to buyers</th>
                    <th>Largest common funder</th>
                    <th>Signals</th>
                  </tr>
                </thead>
                <tbody>
                  {board.rows.map((row, i) => (
                    <tr key={row.seller}>
                      <td>{i + 1}</td>
                      <td>
                        <a
                          className="xb-addr"
                          href={`https://base.blockscout.com/address/${row.seller}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {row.label ?? short(row.seller)}
                        </a>
                        {row.label && <div className="xb-sub">{short(row.seller)}</div>}
                      </td>
                      <td>
                        {usd(row.x402scan_7d.volume_usd)}
                        <div className="xb-sub">{row.x402scan_7d.buyers.toLocaleString('en-US')} buyers</div>
                      </td>
                      {row.report ? (
                        <>
                          <td>{traced(row.report)}</td>
                          <td>{pct(row.report.seller_funded.volume_share)}</td>
                          <td>{pct(row.report.paid_back_share)}</td>
                          <td>
                            {row.report.common_first_funder
                              ? `${pct(row.report.common_first_funder.buyer_share)} of buyers`
                              : '—'}
                          </td>
                          <td>
                            {row.report.signals.length === 0 ? (
                              <span className="xb-none">none raised</span>
                            ) : (
                              row.report.signals.map((s) => (
                                <span key={s.id} className="xb-chip" title={s.evidence}>
                                  {s.title}
                                </span>
                              ))
                            )}
                          </td>
                        </>
                      ) : (
                        <td colSpan={5} className="xb-none">
                          check did not complete this week
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <hr className="press-rule" />

        <section className="xb-section">
          <span className="press-label">How to read it</span>
          <p className="xb-p">
            <strong>Top buyers tracing back to seller</strong>: of the seller’s 30 largest buyers in the
            last 30 days, how many reach the seller’s own address by following their largest funder (at
            most four hops, stopping at exchanges and other high-throughput hubs). A seller whose revenue
            funds its buyers can show any buyer count; this column shows how much of it does.{' '}
            <strong>Sent back to buyers</strong>: USDC the seller transferred to its own buyers, as a share
            of what it received. <strong>Largest common funder</strong>: the share of top buyers whose
            largest funder is the same wallet, which can be an app seeding its users’ wallets.
          </p>
          <p className="xb-p">
            Rankings, 7-day volume and buyer counts are x402scan’s public figures; labels are x402scan’s
            origin labels, not ownership claims. Funding is read from Base via Alchemy. The board
            describes where USDC moved, never why, and a common funder can be a legitimate faucet,
            exchange or custodian. Nothing here is a verdict on any project. The method and worked cases
            are in{' '}
            <Link className="press-link" href="/decodes/x402-on-base">
              the x402-on-Base decode
            </Link>
            .
          </p>
        </section>

        <hr className="press-rule" />

        <section className="xb-section">
          <span className="press-label">Check any seller</span>
          <p className="xb-p">
            Before your agent pays an x402 seller, run the same check on its payTo:{' '}
            <span className="mono">GET api.chainward.ai/api/risk/seller-demand?address=0x…</span>, 0.10
            USDC over x402, not charged if the check fails.{' '}
            <Link className="press-link" href="/attest">
              More on ChainWard’s checks
            </Link>
            .
          </p>
        </section>

        <Colophon />
      </div>

      <style>{`
        .xb-hero { padding: 44px 0 36px; }
        .xb-title { margin: 16px 0 0; font-size: clamp(34px, 5.2vw, 62px); line-height: 1.02; letter-spacing: -0.03em; max-width: 900px; }
        .xb-title em { font-style: italic; color: var(--oxblood); }
        .xb-lede { margin: 22px 0 0; font-family: var(--font-text); font-size: 19px; line-height: 1.55; color: var(--ink-soft); max-width: 700px; }
        .xb-meta { margin-top: 20px; display: flex; gap: 10px 22px; flex-wrap: wrap; font-family: var(--font-mono), ui-monospace, monospace; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-faint); }
        .xb-meta span::before { content: '§ '; color: var(--oxblood); }
        .xb-section { padding: 36px 0; }
        .xb-p { margin: 16px 0 0; font-family: var(--font-text); font-size: 17px; line-height: 1.6; color: var(--ink-soft); max-width: 760px; }
        .xb-p strong { color: var(--ink); font-weight: 640; }
        .xb-scroll { overflow-x: auto; }
        .xb-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 900px; }
        .xb-table th { text-align: left; font-family: var(--font-mono), ui-monospace, monospace; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-faint); border-bottom: 1px solid var(--rule-strong); padding: 10px 10px; vertical-align: bottom; }
        .xb-table td { font-family: var(--font-mono), ui-monospace, monospace; color: var(--ink-soft); border-bottom: 1px solid var(--rule); padding: 10px 10px; vertical-align: top; }
        .xb-table tr:hover td { background: var(--oxblood-wash); }
        .xb-addr { color: var(--ink); text-decoration: none; }
        .xb-addr:hover { color: var(--oxblood); }
        .xb-sub { color: var(--ink-faint); font-size: 11px; margin-top: 2px; }
        .xb-chip { display: inline-block; margin: 0 4px 4px 0; padding: 2px 6px; border: 1px solid var(--rule-strong); font-size: 11px; color: var(--ink); cursor: help; }
        .xb-none { color: var(--ink-faint); }
      `}</style>
    </PressShell>
  );
}
