import Link from 'next/link';
import { PressShell, Masthead, PressDateline, Colophon } from '@/components/press';

export const metadata = {
  title: 'ChainWard Attest — on-chain risk flags for AI agents on Base',
  description:
    'ChainWard publishes its risk reports as EAS attestations on Base, so any agent or contract can check what the chain says about a counterparty before it pays. Verifiable, open source, never a safety verdict.',
  alternates: { canonical: 'https://chainward.ai/attest' },
  openGraph: {
    title: 'ChainWard Attest — on-chain risk flags for AI agents on Base',
    description:
      'Risk reports as EAS attestations on Base. Check a counterparty before you pay it.',
    images: [{ url: '/chainward-og.png', width: 1200, height: 630 }],
  },
};

const SCHEMA_UID = '0x09573690adba41164227b57600aa02061b0ce79dc0655e4c8b36bfe95bb41552';
const ATTESTER = '0x5edc6276B89CC185aC8D6A7eCfdE076e1ACf50DF';

const FIELDS = [
  { name: 'band', desc: 'low-signal · mixed · elevated · high-signal. A count of what surfaced, never a rating.' },
  { name: 'flagIds', desc: 'Stable ids of every flag raised (dormant_wallet, stranded_value, …).' },
  { name: 'high / medium / low / infoCount', desc: 'Flags by severity, so a contract can branch without parsing strings.' },
  { name: 'asOfBlock', desc: 'The Base block the report was read at.' },
  { name: 'reportURI', desc: 'The human-readable report on chainward.ai.' },
  { name: 'reportHash', desc: 'keccak256 of the canonical report JSON — evidence and the not-assessed list included.' },
  { name: 'scope', desc: '"On-chain behavior only. Absence of flags is not a clearance. Not a safety verdict."' },
];

const READ_PATHS = [
  {
    name: 'API',
    body: 'GET api.chainward.ai/api/risk/attestation/<address> — uid, tx, explorer link, and the exact canonical JSON to recompute the hash.',
  },
  {
    name: 'EAS',
    body: 'base.easscan.org or its GraphQL — filter by the schema UID, the recipient, and ChainWard’s attester.',
  },
  {
    name: 'MCP',
    body: 'check_counterparty in chainward-mcp-server (next npm release) — for assistants and agents that speak MCP.',
  },
  {
    name: 'Example agent',
    body: 'examples/check-counterparty.ts — finds the attestation, re-reads it from the EAS contract, verifies the hash, applies a payment policy.',
  },
];

/** Live count from the EAS indexer, so the page never claims more than the chain shows. */
async function attestationCount(): Promise<number | null> {
  try {
    const res = await fetch('https://base.easscan.org/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: `query ($s: String!, $a: String!) {
          aggregateAttestation(where: { schemaId: { equals: $s }, attester: { equals: $a }, revoked: { equals: false } }) {
            _count { _all }
          }
        }`,
        variables: { s: SCHEMA_UID, a: ATTESTER },
      }),
      next: { revalidate: 300 },
    });
    const json = (await res.json()) as { data?: { aggregateAttestation?: { _count?: { _all?: number } } } };
    return json.data?.aggregateAttestation?._count?._all ?? null;
  } catch {
    return null;
  }
}

export default async function AttestPage() {
  const count = await attestationCount();
  const live = count !== null && count > 0;

  return (
    <PressShell>
      <PressDateline />
      <div className="press-wrap">
        <Masthead />

        <section className="att-hero">
          <div className="press-fileno">
            ChainWard Attest <span className="ph-dateline-sep">·</span> EAS on Base
          </div>
          <h1 className="att-title press-display">
            Check a counterparty <em>before</em> you pay it.
          </h1>
          <p className="att-lede">
            Agents on Base pay each other now — x402, ACP, plain transfers. ChainWard
            reads the chain and files a public risk report for any address. ChainWard
            Attest puts that report on Base itself as an <strong>EAS attestation</strong>,
            so any agent, contract, or indexer can read what the chain shows about a
            counterparty, and verify it, without trusting our website.
          </p>
          <div className="att-meta">
            {live && <span>{count.toLocaleString()} attestations on Base</span>}
            <span>open source · MIT</span>
            <span>free to read</span>
            <span>never a safety verdict</span>
          </div>
        </section>

        <hr className="press-rule" />

        <section className="att-section">
          <span className="press-label">What goes on-chain</span>
          <h2 className="att-h2 press-display">One attestation per report. The caveat travels with it.</h2>
          <p className="att-p">
            The recipient is the address that was checked. Each new report points
            back to the previous one, so the history is on-chain too.
          </p>
          <dl className="att-fields">
            {FIELDS.map((f) => (
              <div key={f.name} className="att-field">
                <dt className="att-field-name mono">{f.name}</dt>
                <dd className="att-field-desc">{f.desc}</dd>
              </div>
            ))}
          </dl>
        </section>

        <hr className="press-rule" />

        <section className="att-section">
          <span className="press-label">Trust</span>
          <h2 className="att-h2 press-display">
            The schema is public. <em>Check the attester.</em>
          </h2>
          <p className="att-p">
            Anyone can attest with a public EAS schema. Only attestations signed by
            ChainWard&apos;s attester are ChainWard&apos;s.
          </p>
          <div className="att-ids">
            <div>
              <span className="att-id-label">Attester</span>
              <a
                className="mono att-id"
                href={`https://basescan.org/address/${ATTESTER}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {ATTESTER}
              </a>
            </div>
            <div>
              <span className="att-id-label">Schema UID</span>
              <a
                className="mono att-id"
                href={`https://base.easscan.org/schema/view/${SCHEMA_UID}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {SCHEMA_UID}
              </a>
            </div>
            <div>
              <span className="att-id-label">EAS contract</span>
              <span className="mono att-id">0x4200000000000000000000000000000000000021</span>
            </div>
          </div>
        </section>

        <hr className="press-rule" />

        <section className="att-section">
          <span className="press-label">Reading it</span>
          <h2 className="att-h2 press-display">Four ways in.</h2>
          <dl className="att-fields">
            {READ_PATHS.map((r) => (
              <div key={r.name} className="att-field">
                <dt className="att-field-name mono">{r.name}</dt>
                <dd className="att-field-desc">{r.body}</dd>
              </div>
            ))}
          </dl>
          <pre className="att-code mono">
            <code>{`$ git clone https://github.com/saltxd/chainward
$ npx tsx chainward/examples/check-counterparty.ts 0x…

ChainWard on 0x… (as of block 51,799,275):
  band high-signal · flags dormant_wallet, stranded_value · high 1 / medium 1 / …
  report https://chainward.ai/report/0x… · hash verified
Policy: high-severity flag on record → hold the payment for review.`}</code>
          </pre>
          <p className="att-p">
            Full schema, verification steps, and what does and doesn&apos;t get attested:{' '}
            <a
              className="press-link"
              href="https://github.com/saltxd/chainward/blob/main/docs/ATTEST.md"
              target="_blank"
              rel="noopener noreferrer"
            >
              docs/ATTEST.md
            </a>
            .
          </p>
        </section>

        <hr className="press-rule" />

        <section className="att-section">
          <span className="press-label">Start here</span>
          <h2 className="att-h2 press-display">Every free check becomes an attestation.</h2>
          <p className="att-p">
            {live
              ? 'Run a check on any Base address. If the report flags observed behavior, it is attested on Base within minutes.'
              : 'The attester is launching now. Run a check on any Base address: if the report flags observed behavior, it is attested on Base as soon as the attester is live.'}
          </p>
          <Link href="/" className="press-btn att-cta">
            Run a free risk check →
          </Link>
        </section>

        <Colophon />
      </div>

      <style>{`
        .att-hero { padding: 44px 0 40px; }
        .att-title {
          margin: 16px 0 0;
          font-size: clamp(36px, 5.6vw, 66px);
          line-height: 1;
          letter-spacing: -0.03em;
          max-width: 900px;
        }
        .att-title em, .att-h2 em {
          font-style: italic;
          color: var(--oxblood);
          font-variation-settings: "opsz" 60, "SOFT" 40;
        }
        .att-lede {
          margin: 22px 0 0;
          font-family: var(--font-text);
          font-size: 19px;
          line-height: 1.55;
          color: var(--ink-soft);
          max-width: 660px;
        }
        .att-lede strong { color: var(--ink); font-weight: 640; }
        .att-meta {
          margin-top: 20px;
          display: flex;
          gap: 10px 22px;
          flex-wrap: wrap;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ink-faint);
        }
        .att-meta span::before { content: '§ '; color: var(--oxblood); }

        .att-section { padding: 44px 0; }
        .att-h2 {
          margin: 14px 0 0;
          font-size: clamp(26px, 3.6vw, 40px);
          line-height: 1.05;
          max-width: 820px;
        }
        .att-p {
          margin: 20px 0 0;
          font-family: var(--font-text);
          font-size: 17px;
          line-height: 1.6;
          color: var(--ink-soft);
          max-width: 660px;
        }

        .att-fields { margin: 28px 0 0; padding: 0; border-top: 3px double var(--rule-strong); }
        .att-field {
          display: grid;
          grid-template-columns: 260px 1fr;
          gap: 24px;
          padding: 14px 0;
          border-bottom: 1px solid var(--rule);
          align-items: baseline;
        }
        .att-field-name { font-size: 13px; color: var(--oxblood); }
        .att-field-desc {
          margin: 0;
          font-family: var(--font-text);
          font-size: 16px;
          line-height: 1.5;
          color: var(--ink-soft);
        }
        @media (max-width: 640px) {
          .att-field { grid-template-columns: 1fr; gap: 4px; }
        }

        .att-ids { margin-top: 24px; display: grid; gap: 12px; max-width: 760px; }
        .att-id-label {
          display: block;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ink-faint);
        }
        .att-id { font-size: 13px; color: var(--ink); overflow-wrap: anywhere; text-decoration: none; }
        a.att-id:hover { color: var(--oxblood); }

        .att-code {
          margin: 28px 0 0;
          background: var(--paper-2);
          border: 1px solid var(--rule-strong);
          padding: 18px 22px;
          font-size: 12.5px;
          line-height: 1.6;
          color: var(--ink);
          max-width: 720px;
          overflow-x: auto;
        }
        .att-cta { margin-top: 24px; }
      `}</style>
    </PressShell>
  );
}
