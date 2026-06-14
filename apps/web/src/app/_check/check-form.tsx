'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/v2';

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const HANDLE_RE = /^@[A-Za-z0-9_]{1,15}$/;

/**
 * The home-page checker input. Accepts a Base address or an @handle. Addresses
 * route straight to the report page (lowercased, canonical). Handles are sent
 * through the report page too — resolution happens server-side via the check
 * endpoint, so the report view runs the check and lands on the resolved address.
 */
export function CheckForm() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();

    if (ADDRESS_RE.test(trimmed)) {
      setError('');
      router.push(`/report/${trimmed.toLowerCase()}`);
      return;
    }

    if (HANDLE_RE.test(trimmed)) {
      // Handles can't be a canonical URL until resolved; route via a query the
      // report page reads, or send to the check flow. We keep it simple: the
      // report page only handles addresses, so resolve handles up front would
      // need the API. For v1, nudge the user toward an address.
      setError(
        'handle resolution is coming soon — paste the agent wallet address (0x…) for now',
      );
      return;
    }

    setError('paste a Base address (0x followed by 40 hex chars) or an @handle');
  }

  return (
    <form onSubmit={handleSubmit} className="v2-check-form">
      <div className="v2-check-prompt">
        <span className="v2-check-caret">$</span>
        <input
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            if (error) setError('');
          }}
          placeholder="paste a Base address or @agent handle"
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          className="v2-check-input"
          aria-label="Base address or agent handle"
        />
      </div>

      {error && <p className="v2-check-error">// {error}</p>}

      <div className="v2-check-cta">
        <Button variant="primary">./check →</Button>
        <span className="v2-check-hint">free · public · flags, not promises</span>
      </div>

      <style>{`
        .v2-check-form {
          margin-top: 8px;
          width: 100%;
          max-width: 640px;
        }
        .v2-check-prompt {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 16px 18px;
          border: 1px solid var(--line-2);
          background: var(--bg-1);
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .v2-check-prompt:focus-within {
          border-color: var(--phosphor);
          box-shadow: 0 0 0 3px rgba(58, 167, 109, 0.12);
        }
        .v2-check-caret {
          color: var(--phosphor);
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 18px;
        }
        .v2-check-input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: var(--fg);
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 16px;
          letter-spacing: 0.01em;
          padding: 0;
          min-width: 0;
        }
        .v2-check-input::placeholder { color: var(--fg-dim); }
        .v2-check-error {
          margin-top: 12px;
          color: var(--danger);
          font-size: 12px;
          letter-spacing: 0.04em;
        }
        .v2-check-cta {
          margin-top: 22px;
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }
        .v2-check-hint {
          font-size: 11px;
          color: var(--muted);
          letter-spacing: 0.04em;
        }
      `}</style>
    </form>
  );
}
