'use client';

import { useState, type ReactNode } from 'react';
import { parseTxHash } from '@/lib/paymentConfirm';

interface ClaimByHashProps {
  summary: string;
  hint: ReactNode;
  /** Gets a validated, lowercased hash. Verifies only; never sends money. */
  onSubmit: (txHash: string) => void;
  disabled?: boolean;
}

/**
 * "Already paid? Paste your transaction hash." Rescues a buyer whose page lost
 * track of a payment, or who paid from another wallet or app. Collapsed by
 * default so it never competes with the pay button.
 */
export function ClaimByHash({ summary, hint, onSubmit, disabled }: ClaimByHashProps) {
  const [value, setValue] = useState('');
  const hash = parseTxHash(value);
  const invalid = value.trim() !== '' && !hash;

  return (
    <details className="brf-claim">
      <summary className="press-link">{summary}</summary>
      <form
        className="brf-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!hash || disabled) return;
          onSubmit(hash);
          setValue('');
        }}
      >
        <p className="brf-hint">{hint}</p>
        <label>
          <span>Transaction hash</span>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="0x…"
            autoComplete="off"
            spellCheck={false}
            aria-invalid={invalid}
          />
        </label>
        {invalid && (
          <div className="brf-error">
            That isn&apos;t a transaction hash. It starts with 0x and has 64 more characters (0-9, a-f). A BaseScan link
            works too.
          </div>
        )}
        <button className="press-btn press-btn--full" type="submit" disabled={!hash || disabled}>
          Check this payment
        </button>
      </form>
    </details>
  );
}
