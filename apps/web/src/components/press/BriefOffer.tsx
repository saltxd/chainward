'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, type BriefConfig } from '@/lib/api';

/**
 * The paid-brief offer. Price is ALWAYS runtime config (GET /api/brief/config),
 * never hardcoded — falls back to price-agnostic copy when config is
 * unavailable. Two forms:
 *   line     — a quiet-confidence offer line (landing, right after the hero)
 *   document — a serious product offer styled as a case-file artifact (the
 *              single upsell on a free report)
 */
export function BriefOffer({ variant }: { variant: 'line' | 'document' }) {
  const [config, setConfig] = useState<BriefConfig | null>(null);

  useEffect(() => {
    api
      .getBriefConfig()
      .then(setConfig)
      .catch(() => {});
  }, []);

  const priceLabel =
    config && config.available && config.priceUsdc
      ? `${config.priceUsdc} USDC`
      : 'priced in USDC on Base';

  if (variant === 'line') {
    return (
      <div className="brief-line">
        <span className="brief-line-mark press-label--ox">Commissioned decode</span>
        <p className="brief-line-copy">
          Point us at any Base wallet and we file the full forensic{' '}
          <span className="brief-line-em">Intel Brief</span> — fund-flow trace,
          claim-vs-reality, every flag sourced to the chain, delivered as a public
          thread within 48 hours. <span className="mono">{priceLabel}</span>.
        </p>
        <Link href="/request-brief" className="press-link brief-line-cta">
          Request a brief →
        </Link>

        <style>{`
          .brief-line {
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 22px 0;
          }
          .brief-line-mark {
            font-family: var(--font-mono), ui-monospace, monospace;
            font-size: 11px;
            letter-spacing: 0.16em;
            text-transform: uppercase;
          }
          .brief-line-copy {
            margin: 0;
            font-family: var(--font-text);
            font-size: 19px;
            line-height: 1.5;
            color: var(--ink);
            max-width: 720px;
          }
          .brief-line-em {
            font-family: var(--font-display), Georgia, serif;
            font-style: italic;
            font-variation-settings: "opsz" 40, "SOFT" 40;
          }
          .brief-line-cta {
            align-self: flex-start;
            font-size: 13px;
          }
        `}</style>
      </div>
    );
  }

  return (
    <aside className="brief-doc" aria-label="Intel Brief offer">
      <div className="brief-doc-head">
        <span className="press-label">Intel Brief · commissioned decode</span>
        <span className="brief-doc-price mono">{priceLabel}</span>
      </div>
      <h3 className="brief-doc-title press-display">
        Want the whole file, not just the flags?
      </h3>
      <p className="brief-doc-lede">
        A free report lists the signals. The Intel Brief is the full
        investigation: we trace the fund flows, test every public claim against
        on-chain evidence, and hand you a written brief you can cite.
      </p>
      <ul className="brief-doc-list">
        <li>Full forensic decode from our own Base node</li>
        <li>Fund-flow &amp; counterparty trace — where the money really goes</li>
        <li>Claim-vs-reality check, every flag sourced to the chain</li>
        <li>Delivered as a public thread from @chainwardai, tagging you — within 48h</li>
      </ul>
      <div className="brief-doc-foot">
        <Link href="/request-brief" className="press-btn">
          Commission the brief →
        </Link>
        <span className="brief-doc-fine">
          Same engine behind our published decodes. Your request stays private.
        </span>
      </div>

      <style>{`
        .brief-doc {
          border: 1px solid var(--rule-strong);
          border-top: 3px double var(--rule-strong);
          background: var(--paper-2);
          padding: 30px 32px;
        }
        .brief-doc-head {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 16px;
          padding-bottom: 14px;
          border-bottom: 1px solid var(--rule);
          flex-wrap: wrap;
        }
        .brief-doc-price {
          font-size: 13px;
          color: var(--ink);
          letter-spacing: 0.02em;
        }
        .brief-doc-title {
          margin: 20px 0 0;
          font-size: clamp(24px, 3.2vw, 34px);
        }
        .brief-doc-lede {
          margin: 12px 0 0;
          font-family: var(--font-text);
          font-size: 17px;
          line-height: 1.55;
          color: var(--ink-soft);
          max-width: 620px;
        }
        .brief-doc-list {
          list-style: none;
          margin: 20px 0 0;
          padding: 0;
          display: grid;
          gap: 8px;
        }
        .brief-doc-list li {
          position: relative;
          padding-left: 22px;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 12.5px;
          line-height: 1.55;
          color: var(--ink-soft);
        }
        .brief-doc-list li::before {
          content: "§";
          position: absolute;
          left: 0;
          color: var(--oxblood);
        }
        .brief-doc-foot {
          margin-top: 26px;
          display: flex;
          align-items: center;
          gap: 20px;
          flex-wrap: wrap;
        }
        .brief-doc-fine {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 11px;
          line-height: 1.6;
          color: var(--ink-faint);
          max-width: 300px;
        }
      `}</style>
    </aside>
  );
}
