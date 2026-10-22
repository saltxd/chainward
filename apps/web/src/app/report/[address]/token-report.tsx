import Link from 'next/link';
import type { TokenReport } from '@/lib/api';
import { tokenAnswer, tokenFacts, tokenFlagLines } from '@/lib/tokenAnswer';
import { BriefOffer, FreeTools } from '@/components/press';

/**
 * The rug check on the report page, for a Base token pasted into the checker: the
 * answer first (Hold / Review / No flags, the one reason, the limit), then the launch
 * facts, what came up, what the check does not cover, the Intel Brief on the launch
 * wallet, and the paid check for bots.
 * INTEGRITY: never "safe". No flags means none of the checks matched.
 */
export function TokenReportView({ check, now }: { check: TokenReport; now?: Date }) {
  const answer = tokenAnswer(check);
  const facts = tokenFacts(check, now);
  const flags = tokenFlagLines(check);
  return (
    <>
      <div className="rr-block">
        <section className={`rr-answer rr-answer--${answer.tone}`} aria-label="The answer">
          <div className="rr-answer-top">
            <div className="rr-answer-stamp" aria-label={`Verdict: ${answer.word}`}>
              <span className="rr-answer-stamp-word">{answer.word}</span>
              <span className="rr-answer-stamp-sub">Rug check · on-chain</span>
            </div>
            <p className="rr-answer-headline press-display">{answer.headline}</p>
          </div>
          <p className="rr-answer-why">
            <span className="rr-answer-why-tag">Why:</span> {answer.why}
          </p>
          <p className="rr-answer-limit">{answer.limit}</p>
        </section>
      </div>

      {check.creator && (
        <div className="rr-block rr-launcher">
          <span className="rr-launcher-q">Who launched it?</span>
          <Link href={`/report/${check.creator.address}`} className="press-btn">
            See the launch wallet&apos;s report →
          </Link>
        </div>
      )}

      <div className="rr-block">
        <span className="press-label">The launch</span>
        <h2 className="rr-h2 press-display">What the chain shows</h2>
        <dl className="rr-facts">
          {facts.map((f) => (
            <div key={f.label} className="rr-fact">
              <dt>{f.label}</dt>
              <dd>
                {f.href ? (
                  f.href.startsWith('/') ? (
                    <Link href={f.href} className="press-link mono">
                      {f.value}
                    </Link>
                  ) : (
                    <a href={f.href} className="press-link" target="_blank" rel="noopener noreferrer">
                      {f.value}
                    </a>
                  )
                ) : (
                  f.value
                )}
                {f.note && <span className="rr-fact-note">{f.note}</span>}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {flags.length > 0 && (
        <div className="rr-block">
          <span className="press-label">The details</span>
          <h2 className="rr-h2 press-display">What came up</h2>
          <ul className="rr-flags">
            {flags.map((f) => (
              <li key={f.id} className={`rr-flag rr-flag--${f.severity}`}>
                <div className="rr-flag-head">
                  <span className={`rr-sev rr-sev--${f.severity}`}>{f.severity}</span>
                  <span className="rr-flag-title">{f.title}</span>
                </div>
                <span className="rr-flag-id mono" aria-hidden>
                  {f.id}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rr-block">
        <div className="rr-na">
          <div className="rr-na-tag">What this check does not cover</div>
          <p className="rr-na-lede">{check.limits}</p>
        </div>
      </div>

      <div className="rr-block">
        {check.creator ? (
          <BriefOffer
            placement="token-document"
            title="Want the launch wallet's whole record?"
            lede="The rug check reads one launch. The Intel Brief follows the wallet behind it: who funds it, who it pays, what it launched before, and whether its public claims hold up, written up so you can cite it."
          />
        ) : (
          <BriefOffer placement="token-document" />
        )}
        <FreeTools />
      </div>

      <div className="rr-block">
        <div className="rr-na">
          <div className="rr-na-tag">For bots and apps</div>
          <p className="rr-na-lede">
            The same check is <code>GET https://api.chainward.ai/api/risk/rugcheck?address=0x…</code>, $0.02 a call over
            x402, no account needed.{' '}
            <Link href="/docs" className="press-link">
              Docs →
            </Link>
          </p>
        </div>
      </div>

      <style>{`
        .rr-facts { margin: 18px 0 0; border-top: 1px solid var(--rule-strong); }
        .rr-fact {
          display: grid;
          grid-template-columns: minmax(140px, 220px) 1fr;
          gap: 4px 20px;
          padding: 12px 0;
          border-bottom: 1px solid var(--rule);
        }
        .rr-fact dt { font-weight: 600; }
        .rr-fact dd { margin: 0; overflow-wrap: anywhere; }
        .rr-fact-note { display: block; margin-top: 4px; font-size: 14px; opacity: 0.75; }
        @media (max-width: 560px) { .rr-fact { grid-template-columns: 1fr; } }
        .rr-launcher { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
        .rr-launcher-q { font-weight: 600; }
      `}</style>
    </>
  );
}
