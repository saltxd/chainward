'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  PageShell,
  NavBar,
  StatusTicker,
  SectionHead,
  Button,
} from '@/components/v2';

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export default function WalletLookupPage() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = input.trim();

    if (!ADDRESS_REGEX.test(trimmed)) {
      setError('enter a valid ethereum address (0x followed by 40 hex characters)');
      return;
    }

    setError('');
    router.push(`/wallet/${trimmed}`);
  }

  return (
    <PageShell>
      <StatusTicker />
      <div className="v2-shell" style={{ paddingTop: 0, paddingBottom: 80 }}>
        <NavBar ctaHref="/login" ctaLabel="./connect" />

        <section style={{ paddingTop: 56 }}>
          <SectionHead
            tag="wallet.lookup"
            title={
              <>
                Any Base wallet.{' '}
                <span className="serif" style={{ color: 'var(--phosphor)' }}>
                  No login.
                </span>
              </>
            }
            lede="Paste an address. Read recent transactions, ETH + ERC-20 balances, and a gas-spend footprint. Sourced from Base mainnet. No account required."
          />

          <form onSubmit={handleSubmit} className="v2-lookup-form">
            <div className="v2-lookup-prompt">
              <span className="v2-lookup-caret">$</span>
              <input
                type="text"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  if (error) setError('');
                }}
                placeholder="0x...  paste address to inspect"
                spellCheck={false}
                autoComplete="off"
                className="v2-lookup-input"
              />
            </div>

            {error && <p className="v2-lookup-error">// {error}</p>}

            <div className="v2-lookup-cta">
              <Button variant="primary">./inspect →</Button>
              <span className="v2-lookup-hint">press enter to submit</span>
            </div>
          </form>
        </section>

        <section className="v2-lookup-details">
          <div className="v2-lookup-col">
            <div className="v2-lookup-col-tag">// what you get</div>
            <ul className="v2-lookup-list">
              <li>
                <span className="v2-lookup-li-key">txs</span>
                <span className="v2-lookup-li-val">
                  Recent transfers, swaps, contract calls with timestamps and gas cost
                </span>
              </li>
              <li>
                <span className="v2-lookup-li-key">balances</span>
                <span className="v2-lookup-li-val">
                  ETH + ERC-20 holdings on Base, indexed live
                </span>
              </li>
              <li>
                <span className="v2-lookup-li-key">gas</span>
                <span className="v2-lookup-li-val">
                  Total gas burned and average cost per transaction
                </span>
              </li>
              <li>
                <span className="v2-lookup-li-key">flow</span>
                <span className="v2-lookup-li-val">
                  Transaction frequency and direction (in/out)
                </span>
              </li>
            </ul>
          </div>

          <div className="v2-lookup-col">
            <div className="v2-lookup-col-tag">// why use this</div>
            <p className="v2-lookup-note">
              Scout any wallet before adding it to your monitoring fleet. Public data,
              no sign-up, sourced from Base mainnet.
            </p>
            <p className="v2-lookup-note" style={{ marginTop: 16 }}>
              Want alerts on a wallet?{' '}
              <Link href="/login" className="v2-lookup-inline-link">
                connect →
              </Link>
            </p>
          </div>
        </section>
      </div>

      <style>{`
        .v2-lookup-form {
          margin-top: 24px;
          padding-top: 24px;
          border-top: 1px solid var(--line);
        }
        .v2-lookup-prompt {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 12px 0;
          border-bottom: 1px solid var(--line-2);
          transition: border-color 0.15s;
        }
        .v2-lookup-prompt:focus-within {
          border-bottom-color: var(--phosphor);
        }
        .v2-lookup-caret {
          color: var(--phosphor);
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 16px;
          letter-spacing: 0.04em;
        }
        .v2-lookup-input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: var(--fg);
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 16px;
          letter-spacing: 0.01em;
          padding: 0;
        }
        .v2-lookup-input::placeholder {
          color: var(--muted);
        }
        .v2-lookup-error {
          margin-top: 12px;
          color: var(--danger);
          font-size: 12px;
          letter-spacing: 0.04em;
        }
        .v2-lookup-cta {
          margin-top: 20px;
          display: flex;
          align-items: center;
          gap: 16px;
          flex-wrap: wrap;
        }
        .v2-lookup-hint {
          font-size: 11px;
          color: var(--muted);
          letter-spacing: 0.04em;
        }
        .v2-lookup-details {
          margin-top: 80px;
          padding-top: 48px;
          border-top: 1px solid var(--line);
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 48px;
        }
        .v2-lookup-col-tag {
          font-size: 11px;
          color: var(--muted);
          letter-spacing: 0.1em;
          margin-bottom: 20px;
        }
        .v2-lookup-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: grid;
          gap: 14px;
        }
        .v2-lookup-list li {
          display: grid;
          grid-template-columns: 120px 1fr;
          gap: 20px;
          padding-bottom: 14px;
          border-bottom: 1px solid var(--line);
          font-size: 13px;
          line-height: 1.6;
        }
        .v2-lookup-list li:last-child {
          border-bottom: none;
        }
        .v2-lookup-li-key {
          color: var(--phosphor);
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: lowercase;
        }
        .v2-lookup-li-val {
          color: var(--fg-dim);
        }
        .v2-lookup-note {
          color: var(--fg-dim);
          font-size: 13px;
          line-height: 1.7;
          margin: 0;
        }
        .v2-lookup-inline-link {
          color: var(--phosphor);
          text-decoration: none;
        }
        .v2-lookup-inline-link:hover {
          color: var(--fg);
        }
        @media (max-width: 720px) {
          .v2-lookup-details { grid-template-columns: 1fr; gap: 32px; }
          .v2-lookup-list li { grid-template-columns: 1fr; gap: 4px; }
        }
      `}</style>
    </PageShell>
  );
}
