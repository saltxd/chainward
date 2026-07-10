import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Connect Wallet',
  description:
    'Connect your wallet to ChainWard. Monitor your AI agent wallets on Base with real-time alerts — no email, no password.',
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Server-rendered fallback for users with JS disabled — React 19 strips
          <noscript> from inside client components, so it must live here.
          Styled on paper tokens to match the press login surface. */}
      <noscript>
        <div
          style={{
            margin: '20px auto',
            maxWidth: 480,
            padding: '16px 18px',
            border: '1px solid var(--oxblood)',
            background: 'var(--oxblood-wash)',
            color: 'var(--ink)',
            fontSize: 13,
            lineHeight: 1.6,
            fontFamily: 'var(--font-mono), ui-monospace, monospace',
          }}
        >
          <strong style={{ color: 'var(--ink)' }}>JavaScript required.</strong>{' '}
          ChainWard verifies you with your Ethereum wallet (SIWE) — that flow
          needs JS enabled and a wallet extension installed.{' '}
          <a href="/docs" style={{ color: 'var(--oxblood)', textDecoration: 'underline' }}>
            Read the docs
          </a>{' '}
          for context, or enable JS and reload.
        </div>
      </noscript>
      {children}
    </>
  );
}
