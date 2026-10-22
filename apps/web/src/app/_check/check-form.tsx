'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { track } from '@/lib/track';
import { CHAINS, CHAIN_IDS, chainQuery, parseChainParam, type RiskChainParam } from '@/lib/chains';
import { intakeCopy } from './intake-copy';

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

/**
 * The home-page checker, styled as a case-intake document. Accepts an address
 * on Base or BNB Chain (chain toggle) and routes straight to the report page
 * (lowercased, canonical; `?chain=bsc` for BNB Chain). Addresses only: handles
 * are not resolved, so the form never asks for one. A Base token gets the rug
 * check on the same report page; `variant="token"` (the /rugcheck page) asks for
 * a Base token only and drops the chain toggle.
 */
export function CheckForm({ initialChain, variant = 'wallet' }: { initialChain?: string; variant?: 'wallet' | 'token' } = {}) {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [error, setError] = useState('');
  const [chain, setChain] = useState<RiskChainParam>(variant === 'token' ? 'base' : (parseChainParam(initialChain) ?? 'base'));
  const copy = intakeCopy(chain, variant);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();

    if (ADDRESS_RE.test(trimmed)) {
      setError('');
      track('check_submit', { kind: 'address', chain, form: variant });
      router.push(`/report/${trimmed.toLowerCase()}${chainQuery(chain)}`);
      return;
    }

    track('check_submit', { kind: trimmed.startsWith('@') ? 'handle' : 'invalid', chain, form: variant });
    setError(copy.error);
  }

  return (
    <form onSubmit={handleSubmit} className="intake" aria-label={variant === 'token' ? 'Run a rug check' : 'Run a risk check'}>
      <div className="intake-head">
        <span className="intake-head-org">ChainWard · Free check</span>
        <span className="intake-head-file">
          Answer in <b>about a minute</b>
        </span>
      </div>

      <div className="intake-body">
        <div className="intake-row">
          <label className="intake-field-label" htmlFor="intake-subject">
            {copy.label}
          </label>
          {variant === 'wallet' && (
            <div className="intake-chains" role="radiogroup" aria-label="Chain">
              {CHAIN_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={chain === id}
                  className={`intake-chain${chain === id ? ' intake-chain--on' : ''}`}
                  onClick={() => {
                    setChain(id);
                    if (error) setError('');
                  }}
                >
                  {CHAINS[id].name}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="intake-field">
          <input
            id="intake-subject"
            type="text"
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (error) setError('');
            }}
            placeholder="0x…"
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            className="intake-input mono"
            aria-label={copy.inputLabel}
            aria-describedby="intake-subject-hint"
            aria-invalid={error ? true : undefined}
          />
        </div>
        <p id="intake-subject-hint" className="intake-field-hint">
          {copy.hint}
        </p>

        {error && (
          <p className="intake-error" role="alert">
            {error}
          </p>
        )}

        <div className="intake-actions">
          <button type="submit" className="press-btn">
            {copy.button}
          </button>
          <span className="intake-hint">
            {copy.footnote}
          </span>
        </div>
      </div>

      <style>{`
        .intake {
          width: 100%;
          max-width: 620px;
          background: var(--paper);
          border: 1px solid var(--ink);
          box-shadow: 6px 6px 0 var(--paper-3);
        }
        .intake-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 11px 18px;
          border-bottom: 1px solid var(--ink);
          background: var(--ink);
          color: var(--paper);
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 10.5px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .intake-head-file b {
          color: var(--paper);
          font-weight: 400;
          opacity: 0.7;
          text-transform: none;
          letter-spacing: 0.04em;
        }
        .intake-body {
          padding: 24px 22px 22px;
        }
        .intake-row {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          margin-bottom: 10px;
        }
        .intake-field-label {
          display: block;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ink-faint);
        }
        .intake-chains {
          display: inline-flex;
          border: 1px solid var(--rule-strong);
        }
        .intake-chain {
          appearance: none;
          background: transparent;
          border: none;
          border-right: 1px solid var(--rule-strong);
          padding: 4px 10px;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 10.5px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--ink-faint);
          cursor: pointer;
        }
        .intake-chain:last-child { border-right: none; }
        .intake-chain--on {
          background: var(--ink);
          color: var(--paper);
        }
        .intake-field {
          border-bottom: 2px solid var(--ink);
          transition: border-color 0.15s;
        }
        .intake-field:focus-within {
          border-color: var(--oxblood);
        }
        .intake-input {
          width: 100%;
          background: transparent;
          border: none;
          outline: none;
          color: var(--ink);
          font-size: 20px;
          padding: 4px 2px 10px;
          min-width: 0;
        }
        .intake-input::placeholder {
          color: var(--ink-faint);
        }
        .intake-field-hint {
          margin: 8px 0 0;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 11px;
          line-height: 1.5;
          color: var(--ink-faint);
        }
        .intake-error {
          margin: 14px 0 0;
          color: var(--oxblood);
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 12px;
          line-height: 1.5;
        }
        .intake-actions {
          margin-top: 22px;
          display: flex;
          align-items: center;
          gap: 18px;
          flex-wrap: wrap;
        }
        .intake-hint {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 11px;
          color: var(--ink-faint);
          letter-spacing: 0.02em;
          line-height: 1.5;
          max-width: 300px;
        }
        @media (max-width: 480px) {
          .intake { box-shadow: 4px 4px 0 var(--paper-3); }
          .intake-input { font-size: 17px; }
        }
      `}</style>
    </form>
  );
}
