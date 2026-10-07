/**
 * The paid checks a reader can buy from a page (USDC on Base over x402). Light on
 * purpose: the opener button imports this; the wallet stack loads only on click.
 * Payments go to api.chainward.ai directly. The chainward.ai/api proxy can time
 * out after the API has settled, which would charge without delivering.
 */

export const PAID_API_ORIGIN = 'https://api.chainward.ai';

export type PaidCheckKind = 'seller' | 'hires' | 'counterparty';

/** What each check costs today (the API's 402 is authoritative; the client never signs more). */
export const PAID_CHECK_PRICE: Record<PaidCheckKind, string> = {
  counterparty: '$0.05',
  seller: '$0.10',
  hires: '$0.10',
};

export function sellerCheckUrl(address: string, chain: 'base' | 'bsc' = 'base'): string {
  const q = new URLSearchParams({ address: address.toLowerCase() });
  if (chain !== 'base') q.set('chain', chain);
  return `${PAID_API_ORIGIN}/api/risk/seller-demand?${q}`;
}

export function hireCheckUrl(agentId: number): string {
  return `${PAID_API_ORIGIN}/api/risk/hires?${new URLSearchParams({ agent: String(agentId), chain: 'bsc' })}`;
}

export function counterpartyCheckUrl(address: string, chain: 'base' | 'bsc'): string {
  const q = new URLSearchParams({ address: address.toLowerCase() });
  if (chain !== 'base') q.set('chain', chain);
  return `${PAID_API_ORIGIN}/api/risk/x402?${q}`;
}

export function checkKind(resource: string): PaidCheckKind | null {
  const { pathname } = new URL(resource);
  if (pathname === '/api/risk/seller-demand') return 'seller';
  if (pathname === '/api/risk/hires') return 'hires';
  if (pathname === '/api/risk/x402' || pathname.startsWith('/api/risk/x402/')) return 'counterparty';
  return null;
}

/** "$0.10" as atomic USDC (6 decimals). */
export function priceAtomic(price: string): bigint {
  const m = price.match(/^\$?(\d+)(?:\.(\d{1,6}))?$/);
  if (!m?.[1]) throw new Error(`Unreadable price: ${price}`);
  return BigInt(m[1]) * 1_000_000n + BigInt((m[2] ?? '').padEnd(6, '0'));
}
