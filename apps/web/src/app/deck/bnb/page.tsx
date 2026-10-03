import type { Metadata } from 'next';
import { PressShell } from '@/components/press';

/**
 * BNB Chain Builder Grant deck — eight slides, one static page, printable to
 * PDF (one slide per landscape page, no chrome). Linked from the grant form's
 * "whitepaper / deck" field; not indexed.
 *
 * Every number here traces to deliverables/next-targets/bnb-builder-grant-application.md,
 * deliverables/termix-on-chain/decode.md, README.md or docs/STATUS.md. Add nothing new.
 */
export const metadata: Metadata = {
  title: 'ChainWard — BNB Chain Builder Grant deck',
  description:
    'Points-integrity infrastructure for BNB Chain’s agent economy. ChainWard’s application deck for the BNB Chain Builder Grant, October 2026.',
  robots: { index: false, follow: false },
};

const TOTAL = 8;

const MILESTONES = [
  {
    id: 'M1',
    weeks: 'Weeks 1–4',
    amount: '$18K',
    title: 'BSC indexing and detector port',
    scope:
      'BSC chain-data provider (archive RPC plus own node). Indexer for the ERC-8004 Identity and Reputation registries and marketplace escrows (ERC-8183 and custom). Detector ported: funding trees, registration chains, hired-at-registration timing, payout cycling.',
    acceptance:
      'Reproduce the published TermiX BSC figures within 1%. Full-history run over all BSC ERC-8004 registrations.',
  },
  {
    id: 'M2',
    weeks: 'Weeks 5–8',
    amount: '$16K',
    title: 'Attestations and public API',
    scope:
      'ChainWard schema on BAS mainnet; hash-verifiable attestations for wallets and agent IDs. Endpoints: wallet lookup, agent-ID lookup, batch payout-list check, weekly feed. MCP tools updated for BSC.',
    acceptance:
      '1,000+ BAS attestations. 10,000-wallet batch under 10 minutes. Docs plus a buyer-side example that verifies a BAS attestation before paying.',
  },
  {
    id: 'M3',
    weeks: 'Weeks 9–12',
    amount: '$16K',
    title: 'Integrations and dashboard',
    scope:
      'BNB Agent Studio skill and SDK hook to check a counterparty before hire or payout. Integration with at least two Set-and-Earn shortlisted marketplaces or their escrows. Public BSC observatory (registrations by origin, chain-funded share, feedback concentration).',
    acceptance: 'External review of signer and API. Final public report.',
  },
];

const BUDGET = [
  ['Founder engineering', '$34K'],
  ['BSC archive RPC and node', '$7K'],
  ['External security review', '$4K'],
  ['Hosting', '$2K'],
  ['Attestation gas', '$1K'],
  ['Docs and integration support', '$2K'],
];

const SHIPPED = [
  {
    name: 'Free risk check, Base + BNB Chain',
    body: 'Any address, every flag tied to the transactions behind it. Neutral signals, never a verdict. Live on BNB Chain since 3 Oct 2026 (14-day window, public RPCs).',
  },
  {
    name: '17 published decodes',
    body: 'Each passed through an adversarial verifier that re-fetches every number from the chain. Nothing ships with a wrong number.',
  },
  {
    name: 'ChainWard Attest',
    body: 'Reports as revocable EAS attestations on Base since 27 Sep 2026 (schema 0x0957…1552), with a keccak hash of the canonical report.',
  },
  {
    name: 'x402 pay-per-check',
    body: '0.05 USDC for a fresh report, 0.10 USDC for a seller-demand check. No account, no key. Failed checks are never charged.',
  },
  {
    name: 'MCP server',
    body: '9 tools, on npm and the MCP registry. SDK, CLI and three framework plugins on npm.',
  },
  {
    name: 'Paid datasets',
    body: 'Full wallet file behind a decode for 10 USDC, with a free single-wallet lookup: chainward.ai/paid/termix-wallets.',
  },
  {
    name: 'Open source, MIT',
    body: 'github.com/saltxd/chainward. Decode core: typed, LLM-independent, 160+ unit tests. Live on Base since March 2026 on a self-hosted archive node.',
  },
];

const PROPOSAL = [
  {
    n: '1',
    title: 'BSC indexer and detector',
    body: 'Index the ERC-8004 Identity (0x8004A169…a432) and Reputation registries, marketplace escrows (ERC-8183 and custom) and funding provenance. Detector ported, reproducible from keyless public RPCs.',
  },
  {
    n: '2',
    title: 'Attestations on BAS',
    body: 'BNB Attestation Service (mainnet 0x247F…51bC, EAS-compatible), so a marketplace, Agent Passport or ERC-8183 contract can read the finding for a wallet or agent ID on-chain.',
  },
  {
    n: '3',
    title: 'Free points-integrity API and feed',
    body: 'Single wallet or agent lookups, free. A batch endpoint: payout list in, flags out. A weekly per-marketplace feed of registration-chain and cycling share.',
  },
  {
    n: '4',
    title: 'Agent Studio skill and observatory',
    body: 'A BNB Agent Studio skill and SDK hooks so Set-and-Earn marketplaces can gate hires and payouts, plus a public BSC observatory.',
  },
];

function SlideFoot({ n }: { n: number }) {
  return (
    <footer className="deck-foot">
      <span className="press-fileno">
        <b>ChainWard</b> <span className="ph-dateline-sep">·</span> BNB Chain Builder Grant{' '}
        <span className="ph-dateline-sep">·</span> Oct 2026
      </span>
      <span className="press-fileno">
        <b>{String(n).padStart(2, '0')}</b> / {String(TOTAL).padStart(2, '0')}
      </span>
    </footer>
  );
}

export default function BnbDeckPage() {
  return (
    <PressShell>
      <div className="deck">
        <div className="deck-topbar">
          <a href="https://chainward.ai" className="ph-name">
            ChainWard<span className="ph-name-tld">.ai</span>
          </a>
          <span className="press-label">Deck · BNB Chain Builder Grant · 8 slides · print to PDF</span>
        </div>

        {/* 01 — Title */}
        <section className="deck-slide deck-slide--title">
          <div className="deck-body">
            <span className="press-label press-label--ox">BNB Chain Builder Grant · application deck</span>
            <h1 className="deck-wordmark press-display">
              ChainWard<span className="deck-tld">.ai</span>
            </h1>
            <p className="deck-tagline press-display">
              Points-integrity infrastructure for BNB Chain’s agent economy.
            </p>
            <p className="deck-sub">
              Open-source on-chain forensics for AI agents, live on Base. This proposal ports it to
              BSC: indexer, detector, BAS attestations and a free API any marketplace can call
              before it pays.
            </p>
            <div className="deck-meta">
              <span className="mono">chainward.ai</span>
              <span className="mono">@chainwardai</span>
              <span className="mono">github.com/saltxd/chainward</span>
            </div>
          </div>
          <div className="deck-stamp-wrap">
            <span className="press-stamp">
              <span className="press-stamp-lead">$50K ask</span>
              <span className="press-stamp-sub">12 weeks · 3 milestones</span>
            </span>
          </div>
          <SlideFoot n={1} />
        </section>

        {/* 02 — Problem */}
        <section className="deck-slide">
          <div className="deck-body">
            <span className="press-label">The problem</span>
            <h2 className="deck-h press-display">
              Marketplaces pay for activity <em>nobody verifies</em> before the money moves.
            </h2>
            <div className="deck-cols">
              <ol className="deck-points">
                <li>
                  <b>Incentives reward counts.</b> Set-and-Earn, Agent Studio and the shortlisted
                  marketplaces pay for hires, registrations and settled jobs.
                </li>
                <li>
                  <b>The rules already say what to exclude.</b> Wallets sharing a funding source,
                  circular hires, builders hiring wallets they fund.
                </li>
                <li>
                  <b>The check is manual and late.</b> Today it happens by hand, after the campaign,
                  by BNB Chain staff. Nothing lets a marketplace, a points program or an agent run
                  it before it pays.
                </li>
              </ol>
              <aside className="deck-aside">
                <div className="deck-stat">
                  <span className="deck-stat-n mono">~200K</span>
                  <span className="deck-stat-l">
                    ERC-8004 agents on BSC, about 60% of all of them
                  </span>
                </div>
                <p className="deck-aside-p">
                  That lead is only worth something if the reputation and incentive layers on top
                  of it can tell a real counterparty from a funded ring.
                </p>
              </aside>
            </div>
          </div>
          <SlideFoot n={2} />
        </section>

        {/* 03 — What we measured */}
        <section className="deck-slide">
          <div className="deck-body">
            <span className="press-label">What we measured on BSC</span>
            <h2 className="deck-h press-display">
              The problem is <em>measurable</em>, and large.
            </h2>
            <div className="deck-stats">
              <div className="deck-stat">
                <span className="deck-stat-n mono">296,894</span>
                <span className="deck-stat-l">
                  BSC jobs settled on TermiX’s escrows, full history to 29 Sep 2026
                </span>
              </div>
              <div className="deck-stat">
                <span className="deck-stat-n mono">99.11%</span>
                <span className="deck-stat-l">
                  of $507,564 in fees (Base + BSC) from 18,862 wallets that hire each other and end
                  where they started
                </span>
              </div>
              <div className="deck-stat">
                <span className="deck-stat-n mono">200 · 500 · 1,000</span>
                <span className="deck-stat-l">
                  exact burst sizes: 3,730 BSC wallets first funded in eight exchange-withdrawal
                  bursts
                </span>
              </div>
              <div className="deck-stat">
                <span className="deck-stat-n mono">49 s</span>
                <span className="deck-stat-l">
                  median gap between registering an agent and its first hire, for 8,748 BSC wallets
                </span>
              </div>
              <div className="deck-stat">
                <span className="deck-stat-n mono">68%</span>
                <span className="deck-stat-l">
                  of one BSC points campaign’s new registrants were funded by another new
                  registrant, in chains up to 114 wallets, 52 s apart (72-hour sample, 47% of all
                  registrations)
                </span>
              </div>
              <div className="deck-stat">
                <span className="deck-stat-n mono">59.2%</span>
                <span className="deck-stat-l">
                  of BSC ERC-8004 reputation reviewers show coordinated Sybil behaviour; 77.9% of
                  rated agents have no valid feedback once Sybil rows are removed (arXiv
                  2606.26028, independent)
                </span>
              </div>
            </div>
            <p className="deck-note">
              The 488 wallets that look like ordinary users paid <b>$2.12</b> in fees over the last
              30 days. Every figure re-verified against keyless public BSC RPCs. Signals describe
              flows, not intent: the marketplace’s own wallets were checked and were not in the
              rings. <span className="mono">chainward.ai/decodes/termix-on-chain</span>
            </p>
          </div>
          <SlideFoot n={3} />
        </section>

        {/* 04 — Shipped on Base */}
        <section className="deck-slide">
          <div className="deck-body">
            <span className="press-label">Already shipped on Base</span>
            <h2 className="deck-h press-display">
              The engine exists. <em>The BSC port is engineering, not research.</em>
            </h2>
            <dl className="deck-fields">
              {SHIPPED.map((s) => (
                <div key={s.name} className="deck-field">
                  <dt className="deck-field-name mono">{s.name}</dt>
                  <dd className="deck-field-desc">{s.body}</dd>
                </div>
              ))}
            </dl>
            <p className="deck-note">
              Coverage so far: 483,738 marketplace jobs on BSC and Base classified, full history;
              19,900 wallets classified by funding, timing and cycling. Production is on Base
              mainnet; the BNB Chain risk check reads public RPCs and is not attested yet.
            </p>
          </div>
          <SlideFoot n={4} />
        </section>

        {/* 05 — Proposal */}
        <section className="deck-slide">
          <div className="deck-body">
            <span className="press-label">The proposal</span>
            <h2 className="deck-h press-display">
              Make BNB Chain’s reputation layer <em>checkable</em>, by anyone, for free.
            </h2>
            <ol className="deck-grid4">
              {PROPOSAL.map((p) => (
                <li key={p.n} className="deck-card">
                  <span className="deck-card-n mono">{p.n}</span>
                  <h3 className="deck-card-h">{p.title}</h3>
                  <p className="deck-card-p">{p.body}</p>
                </li>
              ))}
            </ol>
            <p className="deck-note">
              All of it open source. Detection that is reproducible, attested on-chain and free to
              query. A marketplace that integrates once does not depend on ChainWard staying
              online.
            </p>
          </div>
          <SlideFoot n={5} />
        </section>

        {/* 06 — Milestones + budget */}
        <section className="deck-slide">
          <div className="deck-body">
            <span className="press-label">Milestones and budget</span>
            <h2 className="deck-h press-display">
              $50,000 over 12 weeks. <em>Three milestones</em>, each with an acceptance test that
              runs from public RPCs.
            </h2>
            <div className="deck-ms-wrap">
              <table className="deck-table">
                <thead>
                  <tr>
                    <th>Milestone</th>
                    <th>Scope</th>
                    <th>Acceptance</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {MILESTONES.map((m) => (
                    <tr key={m.id}>
                      <td className="deck-ms-id">
                        <span className="mono deck-ms-code">{m.id}</span>
                        <span className="deck-ms-weeks">{m.weeks}</span>
                        <span className="deck-ms-title">{m.title}</span>
                      </td>
                      <td>{m.scope}</td>
                      <td>{m.acceptance}</td>
                      <td className="num mono">{m.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <aside className="deck-budget">
                <span className="press-label">Budget split</span>
                <ul className="deck-budget-list">
                  {BUDGET.map(([k, v]) => (
                    <li key={k}>
                      <span>{k}</span>
                      <span className="mono">{v}</span>
                    </li>
                  ))}
                  <li className="deck-budget-total">
                    <span>Total</span>
                    <span className="mono">$50K</span>
                  </li>
                </ul>
              </aside>
            </div>
          </div>
          <SlideFoot n={6} />
        </section>

        {/* 07 — Why ChainWard */}
        <section className="deck-slide">
          <div className="deck-body">
            <span className="press-label">Why ChainWard</span>
            <h2 className="deck-h press-display">
              Every number has a transaction. <em>No project is ever accused.</em>
            </h2>
            <ol className="deck-grid4">
              <li className="deck-card">
                <span className="deck-card-n mono">Team</span>
                <h3 className="deck-card-h">Solo founder, shipped product</h3>
                <p className="deck-card-p">
                  Marley (GitHub saltxd) built ChainWard end to end: Hono API, Next.js, TimescaleDB,
                  BullMQ indexer, self-hosted Base reth node, Kubernetes, the decode core, the
                  verification pipeline, EAS attestation worker, x402 endpoints, MCP server. Live
                  since March 2026. Bootstrapped: no outside capital, no token, no grants to date.
                </p>
              </li>
              <li className="deck-card">
                <span className="deck-card-n mono">Method</span>
                <h3 className="deck-card-h">Money and timing, not identity</h3>
                <p className="deck-card-p">
                  A wallet is flagged for where its first stablecoin came from, how fast it was hired
                  after registering, and whether payouts go straight into the next purchase. Every
                  flag links to its transactions; every published number is re-derived by a verifier
                  whose only job is to fail the claim. The method reproduced DefiLlama’s fee totals
                  for the largest BSC agent marketplace within 5%.
                </p>
              </li>
              <li className="deck-card">
                <span className="deck-card-n mono">Neutrality</span>
                <h3 className="deck-card-h">Flows, never intent</h3>
                <p className="deck-card-p">
                  Signals say “buyers funded by seller”, “hired at registration”, “common funder”.
                  Absence of flags is explicitly not a clearance. No wallet-to-person claims, no
                  wallet controllers named, private version offered first, attestations revocable.
                  Marketplaces can use the tool themselves rather than have it used against them.
                </p>
              </li>
              <li className="deck-card">
                <span className="deck-card-n mono">Public good</span>
                <h3 className="deck-card-h">Infrastructure, not a vendor</h3>
                <p className="deck-card-p">
                  Open-source engine, free single lookups, attestations on BAS that anyone can read
                  without us. The grant funds the public layer; paid batch feeds above a free quota
                  fund the rest. No token; paid features settle in USDC.
                </p>
              </li>
            </ol>
          </div>
          <SlideFoot n={7} />
        </section>

        {/* 08 — Ask */}
        <section className="deck-slide deck-slide--ask">
          <div className="deck-body">
            <span className="press-label press-label--ox">The ask</span>
            <h2 className="deck-h deck-h--big press-display">
              $50,000 Builder Grant. <em>Twelve weeks</em> to make Set-and-Earn’s fair-play rules
              enforceable at hire time.
            </h2>
            <div className="deck-cols deck-cols--ask">
              <div>
                <span className="press-label">At week 12</span>
                <ul className="deck-points deck-points--tight">
                  <li>All BSC ERC-8004 registrations and marketplace jobs indexed, refreshed daily.</li>
                  <li>1,000+ BAS attestations across the shortlisted marketplaces.</li>
                  <li>
                    Free single lookups; at least two marketplaces or BNB Chain’s campaign
                    verification using the batch endpoint.
                  </li>
                  <li>Weekly public feed; Agent Studio skill published.</li>
                </ul>
              </div>
              <div>
                <span className="press-label">Contact</span>
                <dl className="deck-contact">
                  <div>
                    <dt>Web</dt>
                    <dd className="mono">chainward.ai</dd>
                  </div>
                  <div>
                    <dt>X</dt>
                    <dd className="mono">@chainwardai</dd>
                  </div>
                  <div>
                    <dt>GitHub</dt>
                    <dd className="mono">github.com/saltxd/chainward</dd>
                  </div>
                  <div>
                    <dt>Founder</dt>
                    <dd className="mono">Marley · X @SaltCx (DMs open)</dd>
                  </div>
                </dl>
                <span className="press-label">Reference</span>
                <ul className="deck-refs mono">
                  <li>chainward.ai/decodes/termix-on-chain</li>
                  <li>chainward.ai/attest</li>
                  <li>github.com/saltxd/chainward/blob/main/docs/ATTEST.md</li>
                </ul>
              </div>
            </div>
          </div>
          <SlideFoot n={8} />
        </section>
      </div>

      <style>{`
        /* ── Screen ─────────────────────────────────────────────────────── */
        .deck { width: 100%; max-width: 1180px; margin: 0 auto; padding: 0 40px 64px; }
        .deck-topbar {
          display: flex; align-items: baseline; justify-content: space-between; gap: 20px;
          flex-wrap: wrap; padding: 20px 0 14px; border-bottom: 1px solid var(--rule);
        }
        .deck-slide {
          position: relative;
          display: flex; flex-direction: column; justify-content: space-between;
          min-height: calc(100vh - 56px);
          padding: 56px 0 20px;
          border-bottom: 3px double var(--rule-strong);
        }
        .deck-slide:last-child { border-bottom: 0; }
        .deck-body { flex: 1 1 auto; }
        .deck-foot {
          display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap;
          margin-top: 36px; padding-top: 12px; border-top: 1px solid var(--rule);
        }

        .deck-wordmark {
          margin: 22px 0 0; font-size: clamp(56px, 9vw, 120px); line-height: 0.95;
          letter-spacing: -0.035em; font-weight: 500;
        }
        .deck-tld { color: var(--oxblood); font-style: italic; }
        .deck-tagline {
          margin: 26px 0 0; font-size: clamp(24px, 3.4vw, 40px); line-height: 1.1;
          max-width: 860px; color: var(--ink);
        }
        .deck-sub {
          margin: 22px 0 0; font-family: var(--font-text); font-size: 18px; line-height: 1.55;
          color: var(--ink-soft); max-width: 640px;
        }
        .deck-meta { margin-top: 28px; display: flex; gap: 10px 26px; flex-wrap: wrap; font-size: 13px; color: var(--ink); }
        .deck-meta span::before { content: '§ '; color: var(--oxblood); }
        .deck-stamp-wrap { position: absolute; right: 0; top: 72px; }

        .deck-h {
          margin: 14px 0 0; font-size: clamp(28px, 3.8vw, 44px); line-height: 1.05;
          max-width: 920px;
        }
        .deck-h--big { font-size: clamp(30px, 4.4vw, 52px); }
        .deck-h em, .deck-tagline em {
          font-style: italic; color: var(--oxblood);
          font-variation-settings: "opsz" 60, "SOFT" 40;
        }

        .deck-cols { display: grid; grid-template-columns: 1.4fr 1fr; gap: 40px; margin-top: 36px; align-items: start; }
        .deck-cols--ask { grid-template-columns: 1fr 1fr; }
        .deck-points {
          margin: 0; padding: 0; list-style: none; counter-reset: pt;
          font-family: var(--font-text); font-size: 18px; line-height: 1.55; color: var(--ink-soft);
        }
        .deck-points li { position: relative; padding: 14px 0 14px 44px; border-top: 1px solid var(--rule); counter-increment: pt; }
        .deck-points li::before {
          content: counter(pt, decimal-leading-zero); position: absolute; left: 0; top: 17px;
          font-family: var(--font-mono), ui-monospace, monospace; font-size: 12px; letter-spacing: 0.1em; color: var(--oxblood);
        }
        .deck-points li b { color: var(--ink); font-weight: 640; }
        .deck-points--tight { font-size: 16px; margin-top: 12px; }
        .deck-points--tight li { padding: 10px 0 10px 40px; }
        .deck-points--tight li::before { top: 13px; }

        .deck-aside { border-left: 3px solid var(--oxblood); padding-left: 22px; }
        .deck-aside-p { margin: 14px 0 0; font-family: var(--font-display), Georgia, serif; font-style: italic; font-size: 19px; line-height: 1.4; color: var(--ink); }

        .deck-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0 32px; margin-top: 30px; border-top: 3px double var(--rule-strong); }
        .deck-stat { display: flex; flex-direction: column; gap: 6px; padding: 18px 0 16px; border-bottom: 1px solid var(--rule); }
        .deck-stat-n { font-size: 38px; line-height: 1; color: var(--ink); font-weight: 500; letter-spacing: -0.02em; }
        .deck-stat-l { font-family: var(--font-text); font-size: 14.5px; line-height: 1.45; color: var(--ink-soft); }
        .deck-aside .deck-stat { border-bottom: 0; padding: 0; }

        .deck-note {
          margin: 26px 0 0; font-family: var(--font-text); font-size: 15px; line-height: 1.55;
          color: var(--ink-faint); max-width: 920px;
        }
        .deck-note b { color: var(--ink); font-weight: 640; }
        .deck-note .mono { color: var(--oxblood); font-size: 13px; }

        .deck-fields { margin: 28px 0 0; padding: 0; border-top: 3px double var(--rule-strong); }
        .deck-field { display: grid; grid-template-columns: 220px 1fr; gap: 24px; padding: 11px 0; border-bottom: 1px solid var(--rule); align-items: baseline; }
        .deck-field-name { font-size: 13px; color: var(--oxblood); }
        .deck-field-desc { margin: 0; font-family: var(--font-text); font-size: 15.5px; line-height: 1.5; color: var(--ink-soft); }

        .deck-grid4 { list-style: none; margin: 32px 0 0; padding: 0; display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
        .deck-card { background: var(--paper-2); border: 1px solid var(--rule-strong); padding: 20px 22px; }
        .deck-card-n { display: block; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--oxblood); }
        .deck-card-h { margin: 8px 0 0; font-family: var(--font-display), Georgia, serif; font-weight: 500; font-size: 20px; line-height: 1.15; color: var(--ink); letter-spacing: -0.01em; }
        .deck-card-p { margin: 10px 0 0; font-family: var(--font-text); font-size: 15px; line-height: 1.5; color: var(--ink-soft); }

        .deck-ms-wrap { display: grid; grid-template-columns: 1fr 260px; gap: 36px; margin-top: 30px; align-items: start; }
        .deck-table { width: 100%; border-collapse: collapse; border-top: 3px double var(--rule-strong); }
        .deck-table th {
          text-align: left; font-family: var(--font-mono), ui-monospace, monospace; font-size: 10px;
          letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink-faint);
          border-bottom: 1px solid var(--rule-strong); padding: 10px 12px 8px 0;
        }
        .deck-table td {
          font-family: var(--font-text); font-size: 14px; line-height: 1.45; color: var(--ink-soft);
          border-bottom: 1px solid var(--rule); padding: 12px 12px 12px 0; vertical-align: top;
        }
        .deck-table .num { text-align: right; padding-right: 0; }
        .deck-table td.num { font-size: 17px; color: var(--ink); }
        .deck-ms-id { width: 170px; }
        .deck-ms-code { display: block; font-size: 15px; color: var(--oxblood); }
        .deck-ms-weeks { display: block; font-family: var(--font-mono), ui-monospace, monospace; font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink-faint); margin-top: 4px; }
        .deck-ms-title { display: block; color: var(--ink); font-weight: 640; margin-top: 6px; }
        .deck-budget { border-left: 3px solid var(--oxblood); padding-left: 20px; }
        .deck-budget-list { list-style: none; margin: 12px 0 0; padding: 0; font-family: var(--font-text); font-size: 14.5px; color: var(--ink-soft); }
        .deck-budget-list li { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; border-bottom: 1px solid var(--rule); }
        .deck-budget-list .mono { color: var(--ink); }
        .deck-budget-total { border-top: 1px solid var(--rule-strong); font-weight: 640; color: var(--ink); }

        .deck-contact { margin: 12px 0 0; padding: 0; }
        .deck-contact div { display: grid; grid-template-columns: 90px 1fr; gap: 12px; padding: 7px 0; border-bottom: 1px solid var(--rule); align-items: baseline; }
        .deck-contact dt { font-family: var(--font-mono), ui-monospace, monospace; font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-faint); }
        .deck-contact dd { margin: 0; font-size: 14px; color: var(--ink); overflow-wrap: anywhere; }
        .deck-refs { list-style: none; margin: 12px 0 0; padding: 0; font-size: 12.5px; color: var(--oxblood); line-height: 1.9; overflow-wrap: anywhere; }

        @media (max-width: 820px) {
          .deck { padding: 0 20px 48px; }
          .deck-slide { min-height: 0; padding: 40px 0 16px; }
          .deck-cols, .deck-cols--ask, .deck-ms-wrap, .deck-grid4 { grid-template-columns: 1fr; }
          .deck-stats { grid-template-columns: 1fr; }
          .deck-field { grid-template-columns: 1fr; gap: 4px; }
          .deck-stamp-wrap { position: static; margin-top: 28px; }
          .deck-stat-n { font-size: 32px; }
          .deck-table thead { display: none; }
          .deck-table tr { display: block; padding: 10px 0; border-bottom: 1px solid var(--rule-strong); }
          .deck-table td { display: block; border-bottom: 0; padding: 4px 0; }
          .deck-table td.num { text-align: left; }
          .deck-ms-id { width: auto; }
        }

        /* ── Print: one slide per landscape page, no chrome ─────────────── */
        @media print {
          @page { size: 297mm 210mm; margin: 0; }
          html, body { background: #fff !important; }
          body:has(.press) { background: #fff !important; }
          .press {
            --paper: #ffffff;
            --paper-2: #f4f0e7;
            --paper-3: #ebe5d8;
            --ink: #1b1815;
            --ink-soft: #4a4238;
            --ink-faint: #6b6152;
            --rule: #d8cfbe;
            --rule-strong: #bcb19b;
            --oxblood: #7a2016;
            --oxblood-bright: #9a2a1c;
            --oxblood-wash: rgba(122, 32, 22, 0.06);
            --seal: #2e5637;
            color-scheme: light;
            background: #fff;
            min-height: 0;
          }
          .deck { max-width: none; padding: 0; }
          .deck-topbar { display: none; }
          .deck-slide {
            box-sizing: border-box;
            width: 297mm; height: 210mm;
            padding: 14mm 16mm 10mm;
            margin: 0; border-bottom: 0;
            min-height: 0;
            overflow: hidden;
            page-break-after: always; break-after: page;
            page-break-inside: avoid; break-inside: avoid;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
          }
          .deck-slide:last-child { page-break-after: auto; break-after: auto; }
          .deck-foot { margin-top: 6mm; padding-top: 3mm; }
          .deck-stamp-wrap { top: 14mm; right: 16mm; }

          .deck-wordmark { font-size: 92pt; margin-top: 10mm; }
          .deck-tagline { font-size: 24pt; margin-top: 10mm; }
          .deck-sub { font-size: 12.5pt; margin-top: 7mm; }
          .deck-meta { margin-top: 8mm; font-size: 10pt; }

          .deck-h { font-size: 26pt; margin-top: 3mm; max-width: 230mm; }
          .deck-h--big { font-size: 30pt; }
          .deck-cols { margin-top: 9mm; gap: 14mm; }
          .deck-points { font-size: 12.5pt; }
          .deck-points li { padding: 3.5mm 0 3.5mm 12mm; }
          .deck-points li::before { top: 4.2mm; font-size: 8.5pt; }
          .deck-points--tight { font-size: 11pt; }
          .deck-aside-p { font-size: 13pt; }

          .deck-stats { margin-top: 7mm; gap: 0 10mm; }
          .deck-stat { padding: 4.5mm 0 4mm; gap: 1.5mm; }
          .deck-stat-n { font-size: 24pt; }
          .deck-stat-l { font-size: 9.5pt; line-height: 1.35; }
          .deck-note { font-size: 9.5pt; margin-top: 6mm; }

          .deck-fields { margin-top: 6mm; }
          .deck-field { padding: 2.4mm 0; grid-template-columns: 48mm 1fr; gap: 8mm; }
          .deck-field-name { font-size: 9.5pt; }
          .deck-field-desc { font-size: 10.5pt; line-height: 1.4; }

          .deck-grid4 { margin-top: 7mm; gap: 5mm; }
          .deck-card { padding: 5mm 6mm; }
          .deck-card-n { font-size: 8pt; }
          .deck-card-h { font-size: 13.5pt; }
          .deck-card-p { font-size: 10pt; line-height: 1.4; }

          .deck-ms-wrap { margin-top: 7mm; grid-template-columns: 1fr 62mm; gap: 10mm; }
          .deck-table th { font-size: 7.5pt; padding: 2.5mm 3mm 2mm 0; }
          .deck-table td { font-size: 9.5pt; line-height: 1.38; padding: 3mm 3mm 3mm 0; }
          .deck-table td.num { font-size: 12pt; }
          .deck-ms-id { width: 44mm; }
          .deck-ms-code { font-size: 11pt; }
          .deck-ms-weeks { font-size: 7.5pt; }
          .deck-budget-list { font-size: 10pt; }
          .deck-budget-list li { padding: 1.8mm 0; }

          .deck-contact div { padding: 1.8mm 0; grid-template-columns: 24mm 1fr; }
          .deck-contact dd { font-size: 10pt; }
          .deck-refs { font-size: 9pt; }
          .deck-foot .press-fileno { font-size: 8pt; }

          .press-stamp { transform: rotate(-4deg); }
          .press ::selection { background: transparent; }
        }
      `}</style>
    </PressShell>
  );
}
