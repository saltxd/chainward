import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeFunctionData, pad, parseAbi } from 'viem';

// A contract call that moves nothing out of the wallet (an approval, a claim,
// a call that reverts) arrives as a zero-value external activity. It is stored
// as one row for the wallet that sent it, with gas and status, unless the
// wallet also sent tokens in it: those token legs show the transaction and
// carry its gas.

const client = {
  getTransactionReceipt: vi.fn(),
  getTransaction: vi.fn(),
  getBlock: vi.fn(),
};

vi.mock('../../lib/viem.js', () => ({ getBaseClient: () => client }));
vi.mock('../../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
// The 4byte cache, for a selector the decoder does not know.
vi.mock('../../lib/redis.js', () => ({ getRedis: () => ({ get: async () => 'claimRewards', setex: async () => 'OK' }) }));
vi.mock('../tokenResolver.js', () => ({ resolveToken: vi.fn(async () => null) }));
vi.mock('../protocolResolver.js', () => ({ resolveProtocol: vi.fn(async () => null) }));
vi.mock('../priceResolver.js', () => ({ getEthPrice: vi.fn(async () => 3000), getTokenUsdPrice: vi.fn(async () => null) }));
vi.mock('../agentResolver.js', () => ({ resolveAgentByAddress: vi.fn(async () => null) }));

import { processWebhookTx } from '../baseProcessor.js';

const WALLET = '0x1111111111111111111111111111111111111111';
const OTHER_WALLET = '0x3333333333333333333333333333333333333333';
const STRANGER = '0x5555555555555555555555555555555555555555';
const USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const ROUTER = '0x2222222222222222222222222222222222222222';
const TX_HASH = `0x${'ab'.repeat(32)}`;
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const APPROVE_INPUT = encodeFunctionData({
  abi: parseAbi(['function approve(address spender, uint256 amount)']),
  args: [ROUTER, 2n ** 256n - 1n],
});
const CLAIM_INPUT = '0x372500ab'; // claimRewards(), not in the decoder's list

const receipt = (over: Record<string, unknown> = {}) => ({
  blockNumber: 100n,
  gasUsed: 46_000n,
  effectiveGasPrice: 5_000_000n, // 0.005 gwei
  status: 'success',
  logs: [],
  ...over,
});

/** An ERC-20 Transfer log (3 topics); an ERC-721 one also indexes the token id. */
const transferLog = (from: string, to: string, tokenId?: bigint) => ({
  address: USDC,
  topics: [
    TRANSFER_TOPIC,
    pad(from as `0x${string}`),
    pad(to as `0x${string}`),
    ...(tokenId === undefined ? [] : [pad(`0x${tokenId.toString(16)}`)]),
  ],
  data: '0x',
});

const zeroValueCall = (from = WALLET, to = USDC, category = 'external') => ({
  type: 'webhook' as const,
  txHash: TX_HASH,
  blockNumber: 100,
  fromAddress: from,
  toAddress: to,
  value: 0,
  asset: 'ETH',
  category,
  rawContract: { rawValue: '0x0', decimals: 18 },
  network: 'BASE_MAINNET',
});

describe('processWebhookTx, contract calls the wallet sent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.getTransaction.mockResolvedValue({ input: APPROVE_INPUT, to: USDC });
    client.getTransactionReceipt.mockResolvedValue(receipt());
    client.getBlock.mockResolvedValue({ timestamp: 1_700_000_000n });
  });

  it('stores an approval with no transfer as one outbound approval row with its gas', async () => {
    const legs = await processWebhookTx(zeroValueCall(), new Set([WALLET]));
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({
      walletAddress: WALLET,
      direction: 'out',
      txType: 'approval',
      methodName: 'approve',
      status: 'confirmed',
      counterparty: USDC,
      contractAddress: USDC,
      tokenAddress: null,
      amountRaw: '0',
      gasUsed: 46_000,
      gasCostNative: '0.00000023',
    });
    expect(Number(legs[0]!.amountUsd)).toBe(0);
    expect(legs[0]!.gasCostUsd).not.toBeNull();
  });

  it('stores a reverted call as failed, with the gas it spent', async () => {
    client.getTransaction.mockResolvedValue({ input: CLAIM_INPUT, to: ROUTER });
    client.getTransactionReceipt.mockResolvedValue(receipt({ status: 'reverted' }));
    const legs = await processWebhookTx(zeroValueCall(WALLET, ROUTER), new Set([WALLET]));
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ status: 'failed', txType: 'contract_call', gasUsed: 46_000 });
    expect(legs[0]!.gasCostNative).not.toBeNull();
  });

  it('stores a claim, whose tokens only come in, as a contract call carrying the gas', async () => {
    client.getTransaction.mockResolvedValue({ input: CLAIM_INPUT, to: ROUTER });
    client.getTransactionReceipt.mockResolvedValue(receipt({ logs: [transferLog(ROUTER, WALLET)] }));
    const legs = await processWebhookTx(zeroValueCall(WALLET, ROUTER), new Set([WALLET]));
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ txType: 'contract_call', methodName: 'claimRewards', gasUsed: 46_000 });
  });

  // The token leg the wallet sent is stored from its own activity, with the
  // gas, whichever webhook batch it arrives in. A call row would be a second,
  // empty row for the same transaction.
  it('stores no call row for a swap in which the wallet sent tokens', async () => {
    client.getTransaction.mockResolvedValue({ input: CLAIM_INPUT, to: ROUTER });
    client.getTransactionReceipt.mockResolvedValue(
      receipt({ logs: [transferLog(WALLET, ROUTER), transferLog(ROUTER, WALLET)] }),
    );
    expect(await processWebhookTx(zeroValueCall(WALLET, ROUTER), new Set([WALLET]))).toEqual([]);
  });

  it('still stores the call row when the wallet only sent an NFT (NFT activity is not stored)', async () => {
    client.getTransaction.mockResolvedValue({ input: CLAIM_INPUT, to: ROUTER });
    client.getTransactionReceipt.mockResolvedValue(receipt({ logs: [transferLog(WALLET, ROUTER, 7n)] }));
    expect(await processWebhookTx(zeroValueCall(WALLET, ROUTER), new Set([WALLET]))).toHaveLength(1);
  });

  it('ignores a zero-value call another address sent to the wallet, without any RPC call', async () => {
    expect(await processWebhookTx(zeroValueCall(STRANGER, WALLET), new Set([WALLET]))).toEqual([]);
    expect(client.getTransactionReceipt).not.toHaveBeenCalled();
    expect(client.getTransaction).not.toHaveBeenCalled();
  });

  it('ignores a zero-value internal call, without any RPC call', async () => {
    expect(await processWebhookTx(zeroValueCall(WALLET, ROUTER, 'internal'), new Set([WALLET]))).toEqual([]);
    expect(client.getTransactionReceipt).not.toHaveBeenCalled();
  });

  it('stores the call only for the sender when it targets another monitored wallet', async () => {
    client.getTransaction.mockResolvedValue({ input: CLAIM_INPUT, to: OTHER_WALLET });
    const legs = await processWebhookTx(zeroValueCall(WALLET, OTHER_WALLET), new Set([WALLET, OTHER_WALLET]));
    expect(legs.map((l) => [l.walletAddress, l.direction])).toEqual([[WALLET, 'out']]);
  });

  it('stores a zero-value send to itself (a nonce cancel) as a self row', async () => {
    client.getTransaction.mockResolvedValue({ input: '0x', to: WALLET });
    const legs = await processWebhookTx(zeroValueCall(WALLET, WALLET), new Set([WALLET]));
    expect(legs.map((l) => [l.direction, l.txType])).toEqual([['self', 'transfer']]);
  });

  it('makes no RPC call for an activity that involves no monitored wallet', async () => {
    const plain = { ...zeroValueCall(STRANGER, ROUTER), value: 0.5 };
    expect(await processWebhookTx(plain, new Set([WALLET]))).toEqual([]);
    expect(client.getTransactionReceipt).not.toHaveBeenCalled();
  });
});
