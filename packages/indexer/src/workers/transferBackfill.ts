// packages/indexer/src/workers/transferBackfill.ts
//
// Paginated, range-unlimited backfill via Alchemy `alchemy_getAssetTransfers`.
//
// Why this exists: the original `backfillAgent()` (workers/backfill.ts) does a single
// `eth_getLogs` over a ~30-day block window. The configured Base RPC caps `eth_getLogs`
// at 10,000 blocks, so every backfill over a 1.3M-block range fails with HTTP 413
// (`eth_getLogs is limited to a 10,000 range`).
//
// `alchemy_getAssetTransfers` has no block-range limit — it paginates by result `pageKey`.
// This module ports the working per-wallet logic from `scripts/backfill.ts` (the reference
// backfill that succeeds) into a reusable function, but writes rows through the indexer's
// canonical `insertTransactionIfNew` dedup path (the same insert `backfillAgent` already
// uses), so dedup and column mapping stay consistent with the rest of the indexer.

import { formatEther, formatUnits } from 'viem';
import { getDb } from '../lib/db.js';
import { logger } from '../lib/logger.js';
import { insertTransactionIfNew } from '../lib/transactionStore.js';
import { resolveToken } from '../processors/tokenResolver.js';
import { resolveProtocol } from '../processors/protocolResolver.js';
import { getEthPrice, getUsdPrice } from '../processors/priceResolver.js';
import { isSpamToken } from '@chainward/common';

// Mirror scripts/backfill.ts: Alchemy RPC host keyed by ALCHEMY_API_KEY — NOT BASE_RPC_URL
// (mainnet.base.org), which is the 10k-range-capped endpoint that caused the bug.
const ALCHEMY_KEY = process.env.ALCHEMY_API_KEY;
const BASE_RPC = `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY ?? ''}`;

const TRANSFER_CATEGORIES = ['external', 'erc20'];
const PAGE_SIZE_HEX = '0x64'; // 100 results per page, matches scripts/backfill.ts

interface AlchemyTransfer {
  blockNum: string;
  hash: string;
  from: string;
  to: string | null;
  value: number | null;
  asset: string | null;
  category: string;
  rawContract: {
    value: string | null;
    address: string | null;
    decimal: string | null;
  };
}

interface TxReceipt {
  gasUsed: string;
  effectiveGasPrice: string;
  status: string;
}

interface BlockInfo {
  timestamp: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(BASE_RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ id: 1, jsonrpc: '2.0', method, params }),
  });
  const text = await res.text();
  let data: { result?: unknown; error?: { message: string } };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`RPC returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }
  if (data.error) throw new Error(`RPC error: ${data.error.message}`);
  return data.result;
}

async function rpcBatch(
  calls: { method: string; params: unknown[] }[],
): Promise<{ id: number; result: unknown }[]> {
  const body = calls.map((c, i) => ({ id: i + 1, jsonrpc: '2.0', method: c.method, params: c.params }));
  const res = await fetch(BASE_RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let results: { id: number; result: unknown }[];
  try {
    results = JSON.parse(text);
  } catch {
    throw new Error(`RPC batch returned non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }
  return results.sort((a, b) => a.id - b.id);
}

/**
 * Fetch ALL asset transfers for a wallet in one direction, paginating via `pageKey`
 * until Alchemy stops returning one. Unlike eth_getLogs this has no block-range limit.
 */
async function fetchAllTransfers(
  address: string,
  direction: 'from' | 'to',
): Promise<AlchemyTransfer[]> {
  const all: AlchemyTransfer[] = [];
  let pageKey: string | undefined;
  let pages = 0;
  do {
    const params: Record<string, unknown> = {
      fromBlock: '0x0',
      toBlock: 'latest',
      category: TRANSFER_CATEGORIES,
      maxCount: PAGE_SIZE_HEX,
      order: 'desc',
    };
    if (direction === 'from') params.fromAddress = address;
    else params.toAddress = address;
    if (pageKey) params.pageKey = pageKey;

    const result = (await rpcCall('alchemy_getAssetTransfers', [params])) as {
      transfers: AlchemyTransfer[];
      pageKey?: string;
    };
    all.push(...(result.transfers ?? []));
    pageKey = result.pageKey; // loop terminates when Alchemy omits pageKey
    pages++;
    if (pageKey) await sleep(150); // be gentle between pages
  } while (pageKey);

  logger.debug({ address, direction, pages, total: all.length }, '[transferBackfill] fetched transfers');
  return all;
}

async function batchFetchBlocks(blockNumbers: string[], batchSize = 20): Promise<Map<string, BlockInfo>> {
  const blocks = new Map<string, BlockInfo>();
  for (let i = 0; i < blockNumbers.length; i += batchSize) {
    const batch = blockNumbers.slice(i, i + batchSize);
    const calls = batch.map((num) => ({ method: 'eth_getBlockByNumber', params: [num, false] }));
    const results = await rpcBatch(calls);
    for (let j = 0; j < batch.length; j++) {
      const block = results[j]?.result as BlockInfo | null;
      if (block) blocks.set(batch[j]!, block);
    }
    if (i + batchSize < blockNumbers.length) await sleep(100);
  }
  return blocks;
}

async function batchFetchReceipts(txHashes: string[], batchSize = 20): Promise<Map<string, TxReceipt>> {
  const receipts = new Map<string, TxReceipt>();
  for (let i = 0; i < txHashes.length; i += batchSize) {
    const batch = txHashes.slice(i, i + batchSize);
    const calls = batch.map((hash) => ({ method: 'eth_getTransactionReceipt', params: [hash] }));
    const results = await rpcBatch(calls);
    for (let j = 0; j < batch.length; j++) {
      const receipt = results[j]?.result as TxReceipt | null;
      if (receipt) receipts.set(batch[j]!, receipt);
    }
    if (i + batchSize < txHashes.length) await sleep(100);
  }
  return receipts;
}

/**
 * Backfill a single wallet's full Base transaction history via paginated
 * `alchemy_getAssetTransfers`. Inserts through `insertTransactionIfNew` so dedup and
 * column mapping match the rest of the indexer. Returns the number of new rows inserted.
 *
 * Throws if ALCHEMY_API_KEY is missing (no point continuing). Per-transfer failures are
 * logged and skipped; the caller (reconcile) also try/catches per wallet.
 */
export async function backfillWalletViaTransfers(walletAddress: string): Promise<number> {
  if (!ALCHEMY_KEY) {
    throw new Error('ALCHEMY_API_KEY not set — cannot backfill via alchemy_getAssetTransfers');
  }

  const db = getDb();
  const addrLower = walletAddress.toLowerCase();

  // 1. Fetch every transfer in both directions (paginated, no range limit).
  const [outgoing, incoming] = [await fetchAllTransfers(walletAddress, 'from'), await fetchAllTransfers(walletAddress, 'to')];
  const allTransfers = [...outgoing, ...incoming];

  // 2. Dedup. Same tx can appear in both directions; key on hash + endpoints + category.
  const seen = new Set<string>();
  const unique = allTransfers.filter((t) => {
    const key = `${t.hash}-${t.category}-${t.from}-${t.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 3. Spam filter (native ETH is never spam), matching scripts/backfill.ts.
  const filtered = unique.filter((t) => {
    if (t.category === 'external') return true;
    const tokenAddr = t.rawContract.address;
    if (!tokenAddr) return true;
    return !isSpamToken(tokenAddr, t.asset, t.asset);
  });

  logger.info(
    { walletAddress, fetched: allTransfers.length, unique: unique.length, afterSpam: filtered.length },
    '[transferBackfill] transfers ready for insert',
  );

  if (filtered.length === 0) return 0;

  // 4. Batch-fetch block timestamps + receipts (gas) once for the whole set.
  const blockNumbers = [...new Set(filtered.map((t) => t.blockNum))];
  const txHashes = [...new Set(filtered.map((t) => t.hash))];
  const [blocks, receipts] = [await batchFetchBlocks(blockNumbers), await batchFetchReceipts(txHashes)];

  const ethPrice = await getEthPrice();

  // 5. Map each transfer to the transactions insert shape and write via the canonical
  //    dedup path. Mapping mirrors workers/backfill.ts (same TransferRecord -> TransactionInsert).
  let inserted = 0;
  for (const transfer of filtered) {
    try {
      const blockNumber = parseInt(transfer.blockNum, 16);

      const block = blocks.get(transfer.blockNum);
      const timestamp = block
        ? new Date(parseInt(block.timestamp, 16) * 1000)
        : new Date();

      const fromLower = transfer.from?.toLowerCase();
      const toLower = transfer.to?.toLowerCase();
      let direction: 'in' | 'out' | 'self' = 'out';
      if (fromLower === addrLower && toLower === addrLower) direction = 'self';
      else if (toLower === addrLower) direction = 'in';

      const isNative = transfer.category === 'external';
      let tokenAddress: string | null = null;
      let tokenSymbol: string | null = transfer.asset;
      let tokenDecimals: number | null = null;
      let amountRaw: string | null = null;
      let amountUsd: string | null = null;

      if (!isNative && transfer.rawContract.address) {
        tokenAddress = transfer.rawContract.address;
        const meta = await resolveToken(tokenAddress);
        tokenSymbol = meta?.symbol ?? transfer.asset;
        tokenDecimals =
          meta?.decimals ??
          (transfer.rawContract.decimal ? parseInt(transfer.rawContract.decimal, 16) : null);
        if (transfer.rawContract.value) {
          const rawBigInt = BigInt(transfer.rawContract.value);
          amountRaw = rawBigInt.toString();
          if (tokenDecimals !== null) {
            const amount = parseFloat(formatUnits(rawBigInt, tokenDecimals));
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

      // Gas data: only the sender pays gas (out / self).
      let gasUsed: number | null = null;
      let gasPriceGwei: string | null = null;
      let gasCostNative: string | null = null;
      let gasCostUsd: string | null = null;
      let status = 'confirmed';

      const receipt = receipts.get(transfer.hash);
      if (receipt) {
        status = receipt.status === '0x1' ? 'confirmed' : 'failed';
        if (direction === 'out' || direction === 'self') {
          const gasUsedNum = parseInt(receipt.gasUsed, 16);
          const effectiveGasPrice = BigInt(receipt.effectiveGasPrice);
          gasUsed = gasUsedNum;
          gasPriceGwei = formatUnits(effectiveGasPrice, 9);
          gasCostNative = formatEther(BigInt(gasUsedNum) * effectiveGasPrice);
          if (ethPrice) gasCostUsd = (parseFloat(gasCostNative) * ethPrice).toFixed(6);
        }
      }

      // alchemy_getAssetTransfers does not return calldata, so we can't decode the method —
      // classify by transfer category only (matches scripts/backfill.ts). methodId/methodName
      // stay null; baseIndexer fills those for live txs where calldata is available.
      const txType = isNative ? 'transfer' : 'erc20_transfer';

      const counterparty = direction === 'out' ? transfer.to : transfer.from;

      const wasInserted = await insertTransactionIfNew(db, {
        timestamp,
        chain: 'base',
        txHash: transfer.hash,
        blockNumber,
        walletAddress,
        direction,
        counterparty,
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
        methodId: null,
        methodName: null,
        contractAddress: direction === 'out' ? transfer.to : null,
        protocolName: transfer.to ? await resolveProtocol(transfer.to, 'base') : null,
        status,
        rawData: null,
      });

      if (wasInserted) inserted++;
    } catch (err) {
      logger.warn({ err: String(err), txHash: transfer.hash, walletAddress }, '[transferBackfill] failed to process transfer');
    }
  }

  logger.info({ walletAddress, inserted }, '[transferBackfill] wallet backfill complete');
  return inserted;
}
