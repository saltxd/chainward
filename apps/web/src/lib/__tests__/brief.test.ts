import { describe, expect, it } from 'vitest';
import { contactMethodFor, orderDeliveryState } from '../brief';
import type { BriefOrder } from '../api';

describe('contactMethodFor', () => {
  it('routes a public order to the X thread', () => {
    expect(contactMethodFor('public', '@you')).toBe('x');
  });

  it('routes a private order with an email address to email', () => {
    expect(contactMethodFor('private', 'you@example.com')).toBe('email');
  });

  it('routes a private order with a handle to Telegram', () => {
    expect(contactMethodFor('private', '@you')).toBe('telegram');
    expect(contactMethodFor('private', 'you')).toBe('telegram');
  });

  it('does not mistake an @handle for an email', () => {
    expect(contactMethodFor('private', '@you.eth')).toBe('telegram');
  });
});

function order(over: Partial<BriefOrder>): BriefOrder {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    userId: 'u',
    walletAddress: '0xabc',
    target: '0xdef',
    targetKind: 'address',
    contact: '@you',
    contactMethod: 'telegram',
    notes: null,
    plan: 'brief',
    amountUsdc: 5_000_000,
    status: 'paid',
    txHash: null,
    briefMarkdown: null,
    createdAt: '2026-09-03T00:00:00Z',
    paidAt: null,
    fulfilledAt: null,
    ...over,
  };
}

describe('orderDeliveryState', () => {
  it('is awaiting payment until the USDC lands', () => {
    expect(orderDeliveryState(order({ status: 'pending' })).key).toBe('awaiting_payment');
  });

  it('is queued once paid and in progress while the decode runs', () => {
    expect(orderDeliveryState(order({ status: 'paid' })).key).toBe('queued');
    expect(orderDeliveryState(order({ status: 'fulfilling' })).key).toBe('in_progress');
  });

  it('is ready when the written brief is attached to the order', () => {
    const s = orderDeliveryState(order({ status: 'fulfilled', briefMarkdown: '## Brief' }));
    expect(s.key).toBe('ready');
  });

  it('is delivered (not ready) for a fulfilled public order with no in-app brief', () => {
    const s = orderDeliveryState(order({ status: 'fulfilled', contactMethod: 'x', briefMarkdown: null }));
    expect(s.key).toBe('delivered');
    expect(s.label).toMatch(/thread/i);
  });

  it('is failed when fulfilment failed', () => {
    expect(orderDeliveryState(order({ status: 'failed' })).key).toBe('failed');
  });
});
