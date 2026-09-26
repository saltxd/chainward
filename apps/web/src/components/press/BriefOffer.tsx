'use client';

import { useEffect, useState } from 'react';
import { api, type BriefConfig } from '@/lib/api';
import { BriefCtaLink } from './BriefCtaLink';
import { NodeClaim } from './NodeClaim';

/**
 * The paid-brief offer, styled as a case-file artifact. Price is ALWAYS runtime
 * config (GET /api/brief/config), never hardcoded — falls back to price-agnostic
 * copy when config is unavailable. Each page frames it for its own reader
 * (a free report, a finished decode, the landing page) via `title`/`lede`, and
 * `placement` tags the CTA click in analytics.
 */
export function BriefOffer({
  placement,
  title = 'Want the whole file, not just the flags?',
  lede = 'A free report lists the signals. The Intel Brief is the full investigation: we trace the fund flows, test every public claim against on-chain evidence, and hand you a written brief you can cite.',
}: {
  placement: string;
  title?: string;
  lede?: string;
}) {
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

  return (
    <aside className="brief-doc" aria-label="Intel Brief offer">
      <div className="brief-doc-head">
        <span className="press-label">Intel Brief · one wallet, fully decoded</span>
        <span className="brief-doc-price mono">{priceLabel}</span>
      </div>
      <h3 className="brief-doc-title press-display">{title}</h3>
      <p className="brief-doc-lede">{lede}</p>
      <ul className="brief-doc-list">
        <li>
          Full forensic decode, read from{' '}
          <NodeClaim live="our own Base node" neutral="the chain" />
        </li>
        <li>Fund-flow &amp; counterparty trace — where the money really goes</li>
        <li>Claim-vs-reality check, every flag sourced to the chain</li>
        <li>Delivered privately within 48h — or as a public @chainwardai thread, if you prefer</li>
      </ul>
      <div className="brief-doc-foot">
        <BriefCtaLink placement={placement} className="press-btn">
          Commission the brief →
        </BriefCtaLink>
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
