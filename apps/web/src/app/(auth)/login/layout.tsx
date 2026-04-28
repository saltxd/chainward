import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign In',
  description:
    'Connect your wallet and sign in to ChainWard. Monitor your AI agent wallets on Base with real-time alerts.',
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Server-rendered fallback for users with JS disabled — React 19 strips
          <noscript> from inside client components, so it must live here. */}
      <noscript>
        <div
          style={{
            margin: '0 auto 20px',
            maxWidth: 480,
            padding: '16px 18px',
            border: '1px solid var(--amber)',
            background: 'rgba(212, 167, 64, 0.06)',
            color: 'var(--fg)',
            fontSize: 13,
            lineHeight: 1.6,
            fontFamily: 'var(--font-mono), ui-monospace, monospace',
          }}
        >
          <strong style={{ color: 'var(--fg)' }}>JavaScript required.</strong>{' '}
          ChainWard signs you in with your Ethereum wallet (SIWE) — that flow
          needs JS enabled and a wallet extension installed.{' '}
          <a href="/docs" style={{ color: 'var(--phosphor)', textDecoration: 'underline' }}>
            Read the docs
          </a>{' '}
          for context, or enable JS and reload.
        </div>
      </noscript>
      {children}
    </>
  );
}
