'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useAccount, useSignMessage } from 'wagmi';
import { siweSignIn } from '@/lib/auth-client';
import { TerminalCard, Button } from '@/components/v2';

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
    <div className="v2-auth-card">
      {/* Brand */}
      <Link href="/" className="v2-auth-brand" aria-label="ChainWard home">
        <span className="v2-auth-dot" aria-hidden />
        <span>
          chainward<span style={{ color: 'var(--phosphor)' }}>.ai</span>
        </span>
      </Link>

      {/* Terminal card */}
      <TerminalCard title="~/chainward" status={isConnected ? 'wallet.connected' : 'session.idle'}>
        <div className="v2-auth-term">
          <div className="v2-auth-term-line">
            <span className="v2-auth-term-prompt">$</span>
            <span>cw auth login</span>
          </div>
          {!isConnected && (
            <>
              <div className="v2-auth-term-sub">waiting for wallet…</div>
              <div className="v2-auth-term-cursor" aria-hidden />
            </>
          )}
          {isConnected && (
            <>
              <div className="v2-auth-term-sub">
                wallet: <span style={{ color: 'var(--phosphor)' }}>
                  {address?.slice(0, 6)}…{address?.slice(-4)}
                </span>
              </div>
              <div className="v2-auth-term-line">
                <span className="v2-auth-term-prompt">$</span>
                <span>cw auth sign-siwe</span>
              </div>
              <div className="v2-auth-term-sub">
                {signing ? 'signing…' : 'ready — press sign to generate session.'}
              </div>
            </>
          )}
        </div>
      </TerminalCard>

      {/* Action */}
      <div className="v2-auth-action">
        {!isConnected && (
          <Button variant="primary" fullWidth onClick={openConnectModal}>
            ./connect-wallet
            <span>→</span>
          </Button>
        )}
        {isConnected && (
          <>
            {error && <div className="v2-auth-error">error: {error}</div>}
            <Button
              variant="primary"
              fullWidth
              onClick={handleSignIn}
              disabled={signing}
            >
              {signing ? 'signing…' : './sign-in-with-ethereum'}
              {!signing && <span>→</span>}
            </Button>
          </>
        )}
      </div>

      <p className="v2-auth-hint">
        Connect a wallet to sign in. No email, no password.
      </p>

      <style>{`
        .v2-auth-card {
          width: 100%;
          max-width: 480px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .v2-auth-brand {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-weight: 600;
          font-size: 13px;
          letter-spacing: -0.01em;
          color: var(--fg);
          text-decoration: none;
          margin-bottom: 4px;
        }
        .v2-auth-dot {
          display: block;
          width: 10px;
          height: 10px;
          background: var(--phosphor);
          box-shadow: 0 0 8px var(--phosphor);
          animation: v2-pulse 2s ease-in-out infinite;
        }
        .v2-auth-term {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 12.5px;
          line-height: 1.8;
          color: var(--fg);
        }
        .v2-auth-term-line {
          display: flex;
          gap: 10px;
          align-items: center;
        }
        .v2-auth-term-prompt {
          color: var(--phosphor);
        }
        .v2-auth-term-sub {
          color: var(--fg-dim);
          padding-left: 20px;
          font-size: 12px;
        }
        .v2-auth-term-cursor {
          display: inline-block;
          width: 8px;
          height: 14px;
          background: var(--phosphor);
          margin-left: 20px;
          margin-top: 4px;
          animation: v2-auth-blink 1s steps(2, start) infinite;
        }
        @keyframes v2-auth-blink {
          to {
            visibility: hidden;
          }
        }
        .v2-auth-action {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .v2-auth-error {
          padding: 10px 14px;
          background: rgba(230, 103, 103, 0.08);
          border: 1px solid rgba(230, 103, 103, 0.3);
          color: var(--danger);
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 12px;
          letter-spacing: 0.02em;
        }
        .v2-auth-hint {
          margin: 0;
          font-size: 11px;
          color: var(--muted);
          letter-spacing: 0.04em;
          text-align: center;
        }
      `}</style>
    </div>
  );
}
