'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useAccount, useSignMessage } from 'wagmi';
import { siweSignIn } from '@/lib/auth-client';
import { Masthead, Colophon } from '@/components/press';

export default function LoginPage() {
  const router = useRouter();
  const { address, chainId, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { openConnectModal } = useConnectModal();
  const [error, setError] = useState('');
  const [signing, setSigning] = useState(false);

  async function handleSignIn() {
    if (!address || !chainId) return;
    setError('');
    setSigning(true);

    try {
      await siweSignIn(address, chainId, signMessageAsync);
      router.push('/overview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed');
    } finally {
      setSigning(false);
    }
  }

  return (
    <div className="press-wrap">
      <Masthead />
      <hr className="press-rule press-rule--strong" />

      <main className="auth-main">
        {/* A case-file cover: file header, then the notary signature block. */}
        <section className="auth-file" aria-labelledby="auth-title">
          <div className="auth-file-head">
            <span className="press-fileno">
              FILE&nbsp;<b>CW·ACCESS</b>
            </span>
            <span className="press-label press-label--ox">Session Notary</span>
          </div>

          <div className="auth-body">
            <p className="press-kicker">Access</p>
            <h1 id="auth-title" className="press-display auth-title">
              Connect your wallet
            </h1>
            <p className="auth-lede">
              Connect a wallet to sign in. No email, no password — you prove
              ownership with a single off-chain signature.
            </p>

            {/* The notary block — a signature line, not a terminal prompt. */}
            <div className="auth-notary">
              <div className="auth-notary-head">
                <span className="press-label">Signatory of record</span>
                <span
                  className={`auth-status${isConnected ? ' auth-status--live' : ''}`}
                >
                  <span className="auth-status-dot" aria-hidden />
                  {isConnected ? 'Wallet connected' : 'Awaiting wallet'}
                </span>
              </div>

              <div className="auth-sigline">
                {isConnected ? (
                  <span className="mono auth-addr">
                    {address?.slice(0, 6)}…{address?.slice(-4)}
                  </span>
                ) : (
                  <span className="auth-sigline-blank">— not yet connected —</span>
                )}
              </div>
              <div className="auth-sig-cap">
                {isConnected
                  ? 'Connected address — sign below to open a session'
                  : 'Connect a wallet to sign as the address of record'}
              </div>
            </div>

            {error && (
              <div className="auth-error" role="alert">
                Error: {error}
              </div>
            )}

            {/* Action — flow logic preserved exactly. */}
            {!isConnected && (
              <button
                type="button"
                className="press-btn press-btn--full"
                onClick={openConnectModal}
              >
                Connect Wallet →
              </button>
            )}
            {isConnected && (
              <button
                type="button"
                className="press-btn press-btn--full"
                onClick={handleSignIn}
                disabled={signing}
              >
                {signing ? 'Signing…' : 'Sign & enter →'}
              </button>
            )}

            <p className="auth-fine">
              A SIWE signature — gasless, off-chain, and revocable. Nothing is
              written to the chain; it only proves you hold the key.
            </p>
          </div>
        </section>
      </main>

      <Colophon />

      <style>{`
        .auth-main {
          display: flex;
          justify-content: center;
          padding: 56px 0 8px;
        }
        .auth-file {
          width: 100%;
          max-width: 520px;
          border: 1px solid var(--rule-strong);
          background: var(--paper-2);
        }
        .auth-file-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 12px 22px;
          border-bottom: 1px solid var(--rule);
        }
        .auth-body {
          padding: 28px 30px 32px;
        }
        .auth-title {
          font-size: 34px;
          margin: 6px 0 0;
        }
        .auth-lede {
          font-family: var(--font-text);
          color: var(--ink-soft);
          font-size: 16.5px;
          line-height: 1.6;
          margin: 14px 0 26px;
          max-width: 42ch;
        }
        .auth-notary {
          border: 1px solid var(--rule);
          background: var(--paper);
          padding: 18px 22px 16px;
          margin-bottom: 22px;
        }
        .auth-notary-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 24px;
        }
        .auth-status {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 10.5px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ink-faint);
        }
        .auth-status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--rule-strong);
        }
        .auth-status--live {
          color: var(--seal);
        }
        .auth-status--live .auth-status-dot {
          background: var(--seal);
        }
        .auth-sigline {
          display: flex;
          align-items: flex-end;
          min-height: 30px;
          padding-bottom: 5px;
          border-bottom: 1px solid var(--ink-soft);
        }
        .auth-addr {
          font-size: 15px;
          color: var(--ink);
          letter-spacing: 0;
        }
        .auth-sigline-blank {
          font-family: var(--font-text);
          font-style: italic;
          font-size: 14px;
          color: var(--ink-faint);
        }
        .auth-sig-cap {
          margin-top: 9px;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 10.5px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ink-faint);
        }
        .auth-error {
          border: 1px solid var(--oxblood);
          background: var(--oxblood-wash);
          color: var(--oxblood);
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 12px;
          letter-spacing: 0.02em;
          padding: 10px 14px;
          margin-bottom: 16px;
        }
        .auth-fine {
          margin: 16px 0 0;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: 0.04em;
          line-height: 1.65;
          color: var(--ink-faint);
        }
        @media (max-width: 720px) {
          .auth-main {
            padding: 36px 0 4px;
          }
          .auth-body {
            padding: 24px 20px 28px;
          }
          .auth-title {
            font-size: 28px;
          }
        }
      `}</style>
    </div>
  );
}
