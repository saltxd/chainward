import { beforeEach, describe, expect, it, vi } from 'vitest';

// A webhook job whose receipt cannot be fetched (RPC timeout, a node a block
// behind the webhook) used to return no legs. The job then completed and the
// transaction was never stored. The fetch error must reach BullMQ so the job is
// retried.

const client = {
  getTransactionReceipt: vi.fn(),
  getTransaction: vi.fn(),
  getBlock: vi.fn(),
};

vi.mock('../../lib/viem.js', () => ({ getBaseClient: () => client }));
vi.mock('../../lib/logger.js', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock('../tokenResolver.js', () => ({ resolveToken: vi.fn(async () => null) }));
vi.mock('../protocolResolver.js', () => ({ resolveProtocol: vi.fn(async () => null) }));
vi.mock('../priceResolver.js', () => ({ getEthPrice: vi.fn(async () => 3000), getTokenUsdPrice: vi.fn(async () => null) }));
vi.mock('../decoder.js', () => ({ decodeMethod: vi.fn(async () => null), classifyTxType: vi.fn(() => 'transfer') }));
vi.mock('../agentResolver.js', () => ({ resolveAgentByAddress: vi.fn(async () => null) }));

import { processWebhookTx } from '../baseProcessor.js';

const WALLET = '0x1111111111111111111111111111111111111111';
const TX_HASH = `0x${'ab'.repeat(32)}`;
const RECEIPT = { blockNumber: 100n, gasUsed: 21_000n, effectiveGasPrice: 1n, status: 'success' };

const job = {
  type: 'webhook' as const,
  txHash: TX_HASH,
  blockNumber: 100,
  fromAddress: WALLET,
  toAddress: '0x2222222222222222222222222222222222222222',
  value: 0.5,
  asset: 'ETH',
  category: 'external',
  network: 'BASE_MAINNET',
};

describe('processWebhookTx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    client.getTransaction.mockResolvedValue({ input: '0x', to: job.toAddress });
    client.getBlock.mockResolvedValue({ timestamp: 1_700_000_000n });
  });

  it('throws when the receipt cannot be fetched, so the job is retried', async () => {
    client.getTransactionReceipt.mockRejectedValue(new Error('request timed out'));
    await expect(processWebhookTx(job, new Set([WALLET]))).rejects.toThrow(/timed out/);
  });

  it('throws when the transaction cannot be fetched, so the job is retried', async () => {
    client.getTransactionReceipt.mockResolvedValue(RECEIPT);
    client.getTransaction.mockRejectedValue(new Error('fetch failed'));
    await expect(processWebhookTx(job, new Set([WALLET]))).rejects.toThrow(/fetch failed/);
  });

  it('returns the leg of a monitored wallet once the fetch succeeds', async () => {
    client.getTransactionReceipt.mockResolvedValue(RECEIPT);
    const legs = await processWebhookTx(job, new Set([WALLET]));
    expect(legs).toHaveLength(1);
    expect(legs[0]).toMatchObject({ walletAddress: WALLET, direction: 'out', txHash: TX_HASH });
  });
});
