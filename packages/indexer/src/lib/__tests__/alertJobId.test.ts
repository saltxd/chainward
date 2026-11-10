import { describe, expect, it } from 'vitest';
import { alertJobId } from '../alertJobId.js';

// One transaction can reach a wallet as several legs (ETH out, token in). Each
// leg is evaluated on its own amount, so each needs its own alert job: with one
// id per transaction, BullMQ dropped every leg after the first and a large leg
// behind a small one never reached the evaluator.

const leg = (over: Partial<Parameters<typeof alertJobId>[0]> = {}) => ({
  chain: 'base',
  walletAddress: '0x1111111111111111111111111111111111111111',
  txHash: `0x${'ab'.repeat(32)}`,
  direction: 'out' as const,
  counterparty: '0x2222222222222222222222222222222222222222',
  tokenAddress: null,
  amountRaw: '250000000000000000',
  ...over,
});

describe('alertJobId', () => {
  it('gives two legs of one transaction different ids', () => {
    const eth = leg();
    const usdc = leg({
      tokenAddress: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      amountRaw: '50000000000',
    });
    expect(alertJobId(eth)).not.toBe(alertJobId(usdc));
  });

  it('gives the same leg the same id, so a retried parent job cannot queue it twice', () => {
    expect(alertJobId(leg())).toBe(alertJobId(leg()));
  });

  it('keeps the chain, wallet and transaction readable in the id', () => {
    const id = alertJobId(leg());
    expect(id.startsWith(`alert-base-${leg().walletAddress}-${leg().txHash}-`)).toBe(true);
  });

  it('contains no colon, which BullMQ refuses in a custom job id', () => {
    expect(alertJobId(leg())).not.toContain(':');
  });

  it('tells an inbound leg from an outbound one', () => {
    expect(alertJobId(leg({ direction: 'in' }))).not.toBe(alertJobId(leg({ direction: 'out' })));
  });
});
