import Link from 'next/link';
import { PressShell, Masthead, PressDateline, Colophon } from '@/components/press';
import { campaignClosed, hireCheckCurl, type SetAndEarnBoard } from '@/lib/setAndEarn';
import { BoardTable } from './BoardTable';

const API_INTERNAL_URL = process.env.API_INTERNAL_URL || 'http://localhost:8000';

// Rendered per request (the build can't reach the API); the board fetch itself is cached 10 min.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Set and Earn Board — who hired the agents built for BNB Chain’s Set and Earn',
  description:
    'Every ERC-8004 agent hired on BNB Chain since Set and Earn opened, and whether 3 of its hirers are wallets its owner neither is nor funded. Updated daily from on-chain data. Never a safety verdict.',
  alternates: { canonical: 'https://chainward.ai/set-and-earn' },
  openGraph: {
    title: 'Set and Earn Board',
    description: 'Who hired the agents built for BNB Chain’s Set and Earn, and whether 3 hirers are independent of the owner. Updated daily from on-chain data.',
    images: [{ url: '/chainward-og-card.png', width: 1200, height: 630 }],
  },
};

async function getBoard(): Promise<SetAndEarnBoard | null> {
  try {
    const res = await fetch(`${API_INTERNAL_URL}/api/set-and-earn/board`, { next: { revalidate: 600 } });
    if (!res.ok) return null;
    return ((await res.json()) as { data: SetAndEarnBoard }).data;
  } catch {
    return null;
  }
}

const n = (x: number) => x.toLocaleString('en-US');

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="se-stat">
      <div className="se-stat-n press-display">{n(value)}</div>
      <div className="se-stat-l">{label}</div>
    </div>
  );
}

export default async function SetAndEarnPage() {
  const board = await getBoard();
  const t = board?.totals;

  return (
    <PressShell>
      <PressDateline />
      <div className="press-wrap">
        <Masthead />

        <section className="se-hero">
          <div className="press-fileno">Set and Earn Board · BNB Chain · daily</div>
          <h1 className="se-title press-display">
            Who hired the agents built for <em>Set and Earn?</em>
          </h1>
          <p className="se-lede">
            BNB Chain’s Set and Earn rule for the agent you build: “At least 3 completed hires from 3
            distinct wallets that are not yours and not funded by yours”. Every day, this board lists each
            ERC-8004 agent hired on BSC since Oct 1, whenever it was registered, and runs ChainWard’s hire
            check on those with 3 or more distinct hirers.
          </p>
          {board && (
            <div className="se-meta">
              <span>updated {new Date(board.generated_at).toUTCString().slice(5, 22)} UTC</span>
              <span>block {n(board.as_of.block)}</span>
              <span>{campaignClosed(new Date()) ? 'campaign closed Nov 5' : 'campaign Oct 1 – Nov 5'}</span>
            </div>
          )}
        </section>

        <hr className="press-rule" />

        {!board || !t ? (
          <section className="se-section">
            <p className="se-p">The first board is being built. Check back shortly.</p>
          </section>
        ) : (
          <>
            <section className="se-section">
              <div className="se-totals">
                <Stat value={t.agents_hired} label="agents hired since Oct 1" />
                <Stat value={t.hires.total} label="hires" />
                <Stat value={t.agents_with_3_distinct_hirers} label="with 3+ distinct hirers" />
                <Stat value={t.agents_passing} label="with 3+ independent hirers" />
                <Stat value={t.agents_registered} label="new agents registered since Oct 1" />
                <Stat value={t.agents_on_campaign_marketplaces} label="of them on a campaign marketplace" />
              </div>
            </section>

            <section className="se-section">
              {board.rows.length === 0 ? (
                <p className="se-p">No agent has been hired since Oct 1 yet.</p>
              ) : (
                <BoardTable rows={board.rows} generatedAt={board.generated_at} />
              )}
              {t.agents_hired > board.rows.length && (
                <p className="se-note">Showing the first {n(board.rows.length)} by hires; the totals count all of them.</p>
              )}
            </section>
          </>
        )}

        <hr className="press-rule" />

        <section className="se-section">
          <span className="press-label">How to read it</span>
          <p className="se-p">
            <strong>Independent</strong>: hirers whose first BNB and first stablecoin, followed back up to
            four hops, reach neither the owner nor a wallet that also funded the owner.{' '}
            <strong>Pass</strong>: 3 or more of them, whether or not their hires have completed yet. Hires are
            TermiX escrow orders and jobs on the shared ERC-8183 contract; completed means the order settled or
            the job completed. The method and worked
            cases are in{' '}
            <Link className="press-link" href="/decodes/set-and-earn-week-one">
              Set and Earn, week one
            </Link>
            .
          </p>
        </section>

        <hr className="press-rule" />

        <section className="se-section">
          <span className="press-label">Check one agent</span>
          <p className="se-p">
            Every hirer, its verdict and the funding trail behind it, for any agent id: 0.10 USDC over x402,
            not charged if the check fails.
          </p>
          <pre className="se-code mono">
            <code>{hireCheckCurl()}</code>
          </pre>
        </section>

        {board && (
          <>
            <hr className="press-rule" />
            <section className="se-section">
              <span className="press-label">Limits</span>
              <ul className="se-limits">
                {board.limits.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </section>
          </>
        )}

        <Colophon />
      </div>

      <style>{`
        .se-hero { padding: 44px 0 36px; }
        .se-title { margin: 16px 0 0; font-size: clamp(34px, 5.2vw, 62px); line-height: 1.02; letter-spacing: -0.03em; max-width: 900px; }
        .se-title em { font-style: italic; color: var(--oxblood); }
        .se-lede { margin: 22px 0 0; font-family: var(--font-text); font-size: 19px; line-height: 1.55; color: var(--ink-soft); max-width: 700px; }
        .se-meta { margin-top: 20px; display: flex; gap: 10px 22px; flex-wrap: wrap; font-family: var(--font-mono), ui-monospace, monospace; font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-faint); }
        .se-meta span::before { content: '§ '; color: var(--oxblood); }
        .se-section { padding: 36px 0; }
        .se-p { margin: 16px 0 0; font-family: var(--font-text); font-size: 17px; line-height: 1.6; color: var(--ink-soft); max-width: 760px; }
        .se-p strong { color: var(--ink); font-weight: 640; }
        .se-note { margin: 12px 0 0; font-size: 12px; color: var(--ink-faint); }
        .se-totals { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 18px 24px; }
        .se-stat-n { font-size: clamp(28px, 3.6vw, 40px); line-height: 1; color: var(--ink); }
        .se-stat-l { margin-top: 6px; font-family: var(--font-mono), ui-monospace, monospace; font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-faint); }
        .se-scroll { overflow-x: auto; }
        .se-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 640px; }
        .se-table th { text-align: left; font-family: var(--font-mono), ui-monospace, monospace; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-faint); border-bottom: 1px solid var(--rule-strong); padding: 10px 10px; vertical-align: bottom; }
        .se-table td { font-family: var(--font-mono), ui-monospace, monospace; color: var(--ink-soft); border-bottom: 1px solid var(--rule); padding: 10px 10px; vertical-align: top; }
        .se-table tr:hover td { background: var(--oxblood-wash); }
        .se-addr { color: var(--ink); text-decoration: none; }
        .se-addr:hover { color: var(--oxblood); }
        .se-sub { color: var(--ink-faint); font-size: 11px; margin-top: 2px; }
        .se-verdict--pass { color: var(--ink); font-weight: 640; }
        .se-verdict--fail { color: var(--oxblood); }
        .se-verdict--none { color: var(--ink-faint); }
        .se-code { margin: 16px 0 0; padding: 14px 16px; border: 1px solid var(--rule-strong); font-size: 13px; overflow-x: auto; color: var(--ink); }
        .se-limits { margin: 14px 0 0; padding-left: 18px; max-width: 760px; font-family: var(--font-text); font-size: 15px; line-height: 1.55; color: var(--ink-soft); }
        .se-limits li { margin: 6px 0; }
      `}</style>
    </PressShell>
  );
}
