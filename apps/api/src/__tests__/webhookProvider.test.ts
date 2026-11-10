import { describe, it, expect, vi, afterEach } from 'vitest';
import { AlchemyWebhookProvider } from '../providers/alchemy/webhookProvider.js';
import { logger } from '../lib/logger.js';

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

  afterEach(() => {
    vi.restoreAllMocks();
  });

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
    vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
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

  // Shapes below are copied from production payloads (Nov 2026). Alchemy sends
  // ETH activity with a rawContract that has no `address`.
  const ethActivity = (n: number, value: number, rawValue: string, category = 'external') => ({
    fromAddress: '0x1111111111111111111111111111111111111111',
    toAddress: '0x2222222222222222222222222222222222222222',
    blockNum: `0x${(55_300_000 + n).toString(16)}`,
    hash: `0x${n.toString(16).padStart(64, '0')}`,
    value,
    asset: 'ETH',
    category,
    rawContract: { rawValue, decimals: 18 },
    blockTimestamp: '0x6af244a5',
  });

  it('keeps a plain ETH transfer, whose rawContract has no address', () => {
    const result = provider.parsePayload(envelope([ethActivity(7, 0.25, '0x3782dace9d90000')]));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      txHash: ethActivity(7, 0.25, '0x3782dace9d90000').hash,
      value: 0.25,
      asset: 'ETH',
      category: 'external',
      rawContract: { rawValue: '0x3782dace9d90000', decimals: 18 },
    });
    expect(result[0]?.rawContract?.address ?? null).toBeNull();
  });

  // A zero-value call moves no ETH. Its token legs arrive as their own
  // activities and already carry the gas, so a second row for the same
  // transaction would count that gas twice.
  it('drops a zero-value external call without a warning', () => {
    const warn = vi.spyOn(logger, 'warn');
    const result = provider.parsePayload(envelope([ethActivity(8, 0, '0x0'), validActivity(14)]));
    expect(result.map((a) => a.txHash)).toEqual([validActivity(14).hash]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps an internal ETH transfer that moved value', () => {
    const result = provider.parsePayload(
      envelope([ethActivity(9, 0.01, '0x2386f26fc10000', 'internal')]),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ category: 'internal', value: 0.01 });
  });

  it('drops zero-value internal calls, which move nothing, without a warning', () => {
    const warn = vi.spyOn(logger, 'warn');
    const result = provider.parsePayload(
      envelope([ethActivity(10, 0, '0x0', 'internal'), validActivity(11)]),
    );
    expect(result.map((a) => a.txHash)).toEqual([validActivity(11).hash]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('drops NFT transfers, which carry no amount, without a warning', () => {
    const warn = vi.spyOn(logger, 'warn');
    const nft = {
      fromAddress: '0x3c338b6dd8563ee5df03aabd95a8a77f66cd32c7',
      toAddress: '0x83ab5c1a4f689cf95f4cc44562887aa3c6ccbc1e',
      blockNum: '0x3482e09',
      hash: `0x${'ab'.repeat(32)}`,
      erc721TokenId: '0x82',
      category: 'token',
      rawContract: { rawValue: '0x', address: '0x40925e35460fcfe494576e29796258180b173001' },
    };
    const result = provider.parsePayload(envelope([nft, validActivity(12)]));
    expect(result.map((a) => a.txHash)).toEqual([validActivity(12).hash]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps an ERC-20 transfer with its token address and decimals', () => {
    const erc20 = {
      ...validActivity(13),
      value: 12.5,
      asset: 'USDC',
      category: 'token',
      rawContract: {
        rawValue: '0xbebc20',
        address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        decimals: 6,
      },
    };
    const result = provider.parsePayload(envelope([erc20]));
    expect(result).toHaveLength(1);
    expect(result[0]?.rawContract).toEqual({
      rawValue: '0xbebc20',
      address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
      decimals: 6,
    });
  });

  it('returns [] for an empty activity array', () => {
    const result = provider.parsePayload(envelope([]));
    expect(result).toEqual([]);
  });
});
