import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  computeActivity,
  computeBalances,
  filterSpamTransfers,
} from '../src/chain-audit.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const fx = (name: string) =>
  JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf8'));

describe('filterSpamTransfers', () => {
  it('excludes transfers from known spam senders', () => {
    const transfers = [
      { from: { hash: '0xD152f549545093347A162Dce210e7293f1452150' }, timestamp: '2026-04-11T00:00:00Z' },
      { from: { hash: '0xEF4364Fe4487353dF46eb7c811D4FAc78b856c7F' }, timestamp: '2026-04-29T00:00:00Z' },
    ];
    const filtered = filterSpamTransfers(transfers);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.from.hash.toLowerCase()).toBe('0xef4364fe4487353df46eb7c811d4fac78b856c7f');
  });
});

describe('computeActivity (Axelrod fixture)', () => {
  it('produces non-zero recent transfer counts for an active wallet', () => {
    const fixture = fx('axelrod-active.json');
    const now = new Date('2026-04-30T12:00:00Z'); // pin clock for determinism
    const activity = computeActivity(fixture.blockscout_transfers.items, now);
    expect(activity.transfers_7d).toBeGreaterThan(0);
    expect(activity.latest_transfer_at).not.toBeNull();
  });
});

describe('computeActivity (Lucien fixture)', () => {
  it('produces zero 7d-transfer count for a dormant wallet', () => {
    const fixture = fx('lucien-dormant.json');
    const now = new Date('2026-04-30T12:00:00Z');
    const activity = computeActivity(fixture.blockscout_transfers.items, now);
    expect(activity.transfers_7d).toBe(0);
    expect(activity.latest_transfer_age_hours).toBeGreaterThan(168); // >7d
  });
});

describe('computeBalances', () => {
  it('returns USDC balance from sentinel eth_call response', () => {
    const balances = computeBalances({
      ethBalanceWei: '0x0',
      usdcRawBalance: '0x' + (6_420_000n).toString(16), // 6.42 USDC (6 decimals)
      ethUsdPrice: 0,
      usdcUsdPrice: 1,
    });
    expect(balances.usdc.amount).toBeCloseTo(6.42, 2);
    expect(balances.usdc.usd).toBeCloseTo(6.42, 2);
  });
});
