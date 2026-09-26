import type { Metadata } from 'next';

// The page itself is a client component; metadata lives here. No price in the
// copy — prices are runtime config (GET /api/brief/config), never hardcoded.
export const metadata: Metadata = {
  title: 'Intel Brief — order a forensic decode of any Base wallet',
  description:
    'Point ChainWard at any Base agent or wallet: a full on-chain investigation, fund flows traced and public claims tested against the chain, delivered as a written brief within 48 hours. Paid in USDC on Base.',
  alternates: { canonical: 'https://chainward.ai/request-brief' },
};

export default function RequestBriefLayout({ children }: { children: React.ReactNode }) {
  return children;
}
