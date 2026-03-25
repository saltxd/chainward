import { formatEther, formatUnits } from 'viem';
import type { TransferRecord } from '@chainward/common';
import { getBaseClient } from '../lib/viem.js';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { IndexerChainDataProvider } from '../lib/chainDataProvider.js';
import { resolveToken } from '../processors/tokenResolver.js';
import { resolveProtocol } from '../processors/protocolResolver.js';
import { getEthPrice, getUsdPrice } from '../processors/priceResolver.js';
import { decodeMethod, classifyTxType } from '../processors/decoder.js';
import { getEnv } from '../config.js';
import { insertTransactionIfNew } from '../lib/transactionStore.js';

/**
 * Backfill the last 30 days of transactions for a wallet using eth_getLogs.
 */
export async function backfillAgent(walletAddress: string, chain: string) {
  if (chain !== 'base') {
    logger.info({ chain, walletAddress }, 'Skipping backfill for non-Base chain');
    return;
  }

  const env = getEnv();
  const db = getDb();
  const client = getBaseClient();

  const currentBlock = await client.getBlockNumber();
  // ~2s block time on Base, 30 days = ~1,296,000 blocks
  const fromBlock = currentBlock - BigInt(1_296_000);

  logger.info({ walletAddress, fromBlock: fromBlock.toString(), currentBlock: currentBlock.toString() }, 'Starting backfill');

  let totalInserted = 0;

  const provider = new IndexerChainDataProvider();
  const outgoing = await provider.getTransferHistory({
    address: walletAddress,
    direction: 'outbound',
    fromBlock: `0x${fromBlock.toString(16)}`,
    maxCount: 1000,
  });
  const incoming = await provider.getTransferHistory({
    address: walletAddress,
    direction: 'inbound',
    fromBlock: `0x${fromBlock.toString(16)}`,
    maxCount: 1000,
  });
  const allTransfers = [...outgoing, ...incoming];

  // Deduplicate by hash + category
  const seen = new Set<string>();
  const unique = allTransfers.filter((t) => {
    const key = `${t.hash}-${t.category}-${t.from}-${t.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  logger.info({ walletAddress, total: unique.length }, 'Backfill transfers fetched');

  const ethPrice = await getEthPrice();

  for (const transfer of unique) {
    try {
      const blockNumber = parseInt(transfer.blockNum, 16);
      let timestamp: Date;
      if (transfer.metadata?.blockTimestamp) {
        timestamp = new Date(transfer.metadata.blockTimestamp);
      } else {
        // Fallback: fetch block timestamp from RPC
        const block = await client.getBlock({ blockNumber: BigInt(blockNumber) });
        timestamp = new Date(Number(block.timestamp) * 1000);
      }

      const fromLower = transfer.from?.toLowerCase();
      const toLower = transfer.to?.toLowerCase();
      const addrLower = walletAddress.toLowerCase();

      let direction: 'in' | 'out' | 'self' = 'out';
      if (fromLower === addrLower && toLower === addrLower) direction = 'self';
      else if (toLower === addrLower) direction = 'in';

      let tokenAddress: string | null = null;
      let tokenSymbol: string | null = transfer.asset;
      let tokenDecimals: number | null = null;
      let amountRaw: string | null = null;
      let amountUsd: string | null = null;

      if (transfer.category === 'erc20' && transfer.rawContract.address) {
        tokenAddress = transfer.rawContract.address;
        const meta = await resolveToken(tokenAddress);
        tokenSymbol = meta?.symbol ?? transfer.asset;
        tokenDecimals = meta?.decimals ?? (transfer.rawContract.decimal ? parseInt(transfer.rawContract.decimal) : null);
        if (transfer.rawContract.rawValue) {
          amountRaw = transfer.rawContract.rawValue;
          if (tokenDecimals !== null) {
            const amount = parseFloat(formatUnits(BigInt(transfer.rawContract.rawValue), tokenDecimals));
            const price = tokenSymbol ? await getUsdPrice(tokenSymbol) : null;
            if (price) amountUsd = (amount * price).toFixed(6);
          }
        }
      } else {
        tokenSymbol = 'ETH';
        tokenDecimals = 18;
        if (transfer.value !== null) {
          amountRaw = BigInt(Math.round(transfer.value * 1e18)).toString();
          if (ethPrice) amountUsd = (transfer.value * ethPrice).toFixed(6);
        }
      }

      // Fetch receipt for gas data (only for outgoing)
      let gasUsed: number | null = null;
      let gasPriceGwei: string | null = null;
      let gasCostNative: string | null = null;
      let gasCostUsd: string | null = null;
      let methodId: string | null = null;
      let methodName: string | null = null;
      let txType: string | null = 'transfer';

      if (direction === 'out' || direction === 'self') {
        try {
          const [receipt, tx] = await Promise.all([
            client.getTransactionReceipt({ hash: transfer.hash as `0x${string}` }),
            client.getTransaction({ hash: transfer.hash as `0x${string}` }),
          ]);

          gasUsed = Number(receipt.gasUsed);
          const effectiveGasPrice = receipt.effectiveGasPrice;
          gasPriceGwei = formatUnits(effectiveGasPrice, 9);
          gasCostNative = formatEther(receipt.gasUsed * effectiveGasPrice);
          if (ethPrice) gasCostUsd = (parseFloat(gasCostNative) * ethPrice).toFixed(6);

          const decoded = await decodeMethod(tx.input);
          methodId = decoded?.methodId ?? null;
          methodName = decoded?.methodName ?? null;
          txType = classifyTxType(methodName, tx.input, tx.to);
        } catch {
          // Receipt fetch failed, continue without gas data
        }
      }

      const inserted = await insertTransactionIfNew(db, {
        timestamp,
        chain: 'base',
        txHash: transfer.hash,
        blockNumber,
        walletAddress,
        direction,
        counterparty: direction === 'out' ? transfer.to : transfer.from,
        tokenAddress,
        tokenSymbol,
        tokenDecimals,
        amountRaw,
        amountUsd,
        gasUsed,
        gasPriceGwei,
        gasCostNative,
        gasCostUsd,
        txType,
        methodId,
        methodName,
        contractAddress: direction === 'out' ? transfer.to : null,
        protocolName: transfer.to ? await resolveProtocol(transfer.to, 'base') : null,
        status: 'confirmed',
        rawData: null,
      });

      if (inserted) {
        totalInserted++;
      }
    } catch (err) {
      logger.warn({ err, txHash: transfer.hash }, 'Failed to process backfill transfer');
    }

    // Rate limit: small delay between RPC calls
    if (totalInserted % 50 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  logger.info({ walletAddress, totalInserted }, 'Backfill complete');
}
