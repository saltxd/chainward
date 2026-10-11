import { TX_HASH_RE, type PaymentProduct } from './paymentConfirm';

/**
 * Browser-side memory of a payment in flight, so a refresh or a closed tab can
 * pick up where it left off. One record per product; cleared only once our API
 * has confirmed the payment. Every access is guarded: private windows and
 * blocked site data make localStorage throw, and the page must work without it.
 */

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

export function browserStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

const PAY_PREFIX = 'cw:pay:';

export function paymentKey(product: PaymentProduct, id: string): string {
  return `${PAY_PREFIX}${product}:${id}`;
}

export interface PendingPayment {
  txHash: string;
  /** When the hash was first saved (ms since epoch). */
  sentAt: number;
  /** A final answer from the API, kept with the hash so a reload still shows it. */
  failed?: string;
}

function parsePending(raw: string | null): PendingPayment | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<PendingPayment> | null;
    if (!v || typeof v.txHash !== 'string' || !TX_HASH_RE.test(v.txHash) || typeof v.sentAt !== 'number') return null;
    return typeof v.failed === 'string'
      ? { txHash: v.txHash, sentAt: v.sentAt, failed: v.failed }
      : { txHash: v.txHash, sentAt: v.sentAt };
  } catch {
    return null;
  }
}

export function readPendingPayment(storage: StorageLike | null, key: string): PendingPayment | null {
  try {
    return parsePending(storage?.getItem(key) ?? null);
  } catch {
    return null;
  }
}

export function savePendingPayment(storage: StorageLike | null, key: string, payment: PendingPayment): void {
  try {
    storage?.setItem(key, JSON.stringify(payment));
  } catch {
    // Storage full or blocked: the hash is still on screen for this visit.
  }
}

export function clearPendingPayment(storage: StorageLike | null, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    // Nothing to do.
  }
}

/** Every valid stored payment for one product, oldest key order first. */
export function listPendingPayments(
  storage: StorageLike | null,
  product: PaymentProduct,
): Array<{ id: string; payment: PendingPayment }> {
  if (!storage) return [];
  const prefix = paymentKey(product, '');
  const out: Array<{ id: string; payment: PendingPayment }> = [];
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key?.startsWith(prefix)) continue;
      const payment = parsePending(storage.getItem(key));
      if (payment) out.push({ id: key.slice(prefix.length), payment });
    }
  } catch {
    return [];
  }
  return out;
}

// ── A claimed dataset's download link ────────────────────────────────────────
// The claim endpoint answers once per transaction (a second claim is refused as
// already used), so the 24h link it returns is kept for the life of the token.

/** A little under the API's 24h token, so a link we show is never already dead. */
const DOWNLOAD_TTL_MS = 23.5 * 3600_000;

function downloadKey(slug: string): string {
  return `cw:download:${slug}`;
}

export function saveDownload(storage: StorageLike | null, slug: string, url: string, now: number = Date.now()): void {
  try {
    storage?.setItem(downloadKey(slug), JSON.stringify({ url, expiresAt: now + DOWNLOAD_TTL_MS }));
  } catch {
    // Blocked storage: the link is still on screen for this visit.
  }
}

export function readDownload(storage: StorageLike | null, slug: string, now: number = Date.now()): string | null {
  try {
    const raw = storage?.getItem(downloadKey(slug));
    if (!raw) return null;
    const v = JSON.parse(raw) as { url?: unknown; expiresAt?: unknown } | null;
    const valid =
      typeof v?.url === 'string' &&
      v.url.startsWith(`/api/paid/${slug}/download?`) &&
      typeof v.expiresAt === 'number' &&
      v.expiresAt > now;
    if (!valid) {
      storage?.removeItem(downloadKey(slug));
      return null;
    }
    return v.url as string;
  } catch {
    return null;
  }
}
