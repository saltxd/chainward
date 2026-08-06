import { describe, it, expect } from 'vitest';
import { AlchemyWebhookProvider } from '../providers/alchemy/webhookProvider.js';

const validActivity = (n: number) => ({
  fromAddress: '0x1111111111111111111111111111111111111111',
  toAddress: '0x2222222222222222222222222222222222222222',
  blockNum: `0x${(49_600_000 + n).toString(16)}`,
  hash: `0x${n.toString(16).padStart(64, '0')}`,
  value: 1.5,
  asset: 'ETH',
  category: 'external',
});

const envelope = (activity: unknown[]) =>
  JSON.stringify({
    webhookId: 'wh_test',
    id: 'whevt_test',
    createdAt: '2026-08-06T20:00:00.000Z',
    type: 'ADDRESS_ACTIVITY',
    event: { network: 'BASE_MAINNET', activity },
  });

describe('AlchemyWebhookProvider.parsePayload', () => {
  const provider = new AlchemyWebhookProvider();

  it('parses a fully valid batch', () => {
    const result = provider.parsePayload(envelope([validActivity(1), validActivity(2)]));
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      txHash: validActivity(1).hash,
      blockNumber: 49_600_001,
      fromAddress: validActivity(1).fromAddress,
      network: 'BASE_MAINNET',
    });
  });

  it('keeps valid activities when one activity in the batch is malformed', () => {
    const malformed = { webhookShapeWeHaveNeverSeen: true };
    const result = provider.parsePayload(
      envelope([validActivity(1), malformed, validActivity(2), validActivity(3)]),
    );
    expect(result).toHaveLength(3);
    expect(result.map((a) => a.txHash)).toEqual([
      validActivity(1).hash,
      validActivity(2).hash,
      validActivity(3).hash,
    ]);
  });

  it('returns [] when the envelope itself is malformed', () => {
    const result = provider.parsePayload(JSON.stringify({ not: 'an alchemy payload' }));
    expect(result).toEqual([]);
  });

  it('returns [] for an empty activity array', () => {
    const result = provider.parsePayload(envelope([]));
    expect(result).toEqual([]);
  });
});
