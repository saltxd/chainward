import { describe, expect, it } from 'vitest';
import {
  clearPendingPayment,
  listPendingPayments,
  paymentKey,
  readDownload,
  readPendingPayment,
  saveDownload,
  savePendingPayment,
  type StorageLike,
} from '../paymentStore';

const HASH = '0x' + 'cd'.repeat(32);
const HASH2 = '0x' + 'ef'.repeat(32);

function memoryStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
}

/** Storage that throws on every access (private mode, blocked site data). */
const brokenStorage: StorageLike = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('denied');
  },
  removeItem: () => {
    throw new Error('denied');
  },
  key: () => {
    throw new Error('denied');
  },
  get length(): number {
    throw new Error('denied');
  },
};

describe('paymentKey', () => {
  it('keys one payment per product', () => {
    expect(paymentKey('dataset', 'virtuals-acp-sybil')).toBe('cw:pay:dataset:virtuals-acp-sybil');
    expect(paymentKey('brief', '7f1c0f1e-1111-4222-8333-444455556666')).toBe('cw:pay:brief:7f1c0f1e-1111-4222-8333-444455556666');
  });
});

describe('pending payments', () => {
  it('round-trips a sent transaction', () => {
    const s = memoryStorage();
    const key = paymentKey('dataset', 'x');
    savePendingPayment(s, key, { txHash: HASH, sentAt: 1000 });
    expect(readPendingPayment(s, key)).toEqual({ txHash: HASH, sentAt: 1000 });
  });

  it('remembers a final error alongside the hash, so a reload still shows both', () => {
    const s = memoryStorage();
    const key = paymentKey('dataset', 'x');
    savePendingPayment(s, key, { txHash: HASH, sentAt: 1000, failed: 'Wrong amount.' });
    expect(readPendingPayment(s, key)).toEqual({ txHash: HASH, sentAt: 1000, failed: 'Wrong amount.' });
  });

  it('clears only when asked (after the claim succeeds)', () => {
    const s = memoryStorage();
    const key = paymentKey('dataset', 'x');
    savePendingPayment(s, key, { txHash: HASH, sentAt: 1000 });
    clearPendingPayment(s, key);
    expect(readPendingPayment(s, key)).toBeNull();
  });

  it('ignores a corrupted or tampered record', () => {
    const s = memoryStorage();
    const key = paymentKey('dataset', 'x');
    for (const raw of ['not json', '{}', 'null', JSON.stringify({ txHash: '0x1234', sentAt: 1 }), JSON.stringify({ txHash: HASH })]) {
      s.setItem(key, raw);
      expect(readPendingPayment(s, key), raw).toBeNull();
    }
  });

  it('never throws when storage is unavailable', () => {
    const key = paymentKey('dataset', 'x');
    expect(() => savePendingPayment(brokenStorage, key, { txHash: HASH, sentAt: 1 })).not.toThrow();
    expect(readPendingPayment(brokenStorage, key)).toBeNull();
    expect(() => clearPendingPayment(brokenStorage, key)).not.toThrow();
    expect(listPendingPayments(brokenStorage, 'brief')).toEqual([]);
    expect(readPendingPayment(null, key)).toBeNull();
  });

  it('lists the stored payments for one product, for resuming after a reload', () => {
    const s = memoryStorage();
    savePendingPayment(s, paymentKey('brief', 'order-a'), { txHash: HASH, sentAt: 1 });
    savePendingPayment(s, paymentKey('brief', 'order-b'), { txHash: HASH2, sentAt: 2 });
    savePendingPayment(s, paymentKey('dataset', 'file'), { txHash: HASH, sentAt: 3 });
    s.setItem('cw:pay:brief:junk', 'nope');
    s.setItem('unrelated', 'x');
    expect(listPendingPayments(s, 'brief')).toEqual([
      { id: 'order-a', payment: { txHash: HASH, sentAt: 1 } },
      { id: 'order-b', payment: { txHash: HASH2, sentAt: 2 } },
    ]);
  });
});

describe('saved downloads', () => {
  const URL = '/api/paid/x/download?token=abc';

  it('keeps the download link through a reload for the life of the token', () => {
    const s = memoryStorage();
    saveDownload(s, 'x', URL, 0);
    expect(readDownload(s, 'x', 23 * 3600_000)).toBe(URL);
  });

  it('drops the link once the 24h token would have expired', () => {
    const s = memoryStorage();
    saveDownload(s, 'x', URL, 0);
    expect(readDownload(s, 'x', 24 * 3600_000)).toBeNull();
    expect(s.map.size).toBe(0);
  });

  it('only accepts a link to this file on our own API', () => {
    const s = memoryStorage();
    saveDownload(s, 'x', 'javascript:alert(1)', 0);
    expect(readDownload(s, 'x', 1)).toBeNull();
    saveDownload(s, 'x', '/api/paid/other/download?token=abc', 0);
    expect(readDownload(s, 'x', 1)).toBeNull();
  });

  it('never throws when storage is unavailable', () => {
    expect(() => saveDownload(brokenStorage, 'x', URL, 0)).not.toThrow();
    expect(readDownload(brokenStorage, 'x', 0)).toBeNull();
  });
});
