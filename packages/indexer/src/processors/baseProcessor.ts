import { formatEther, formatUnits, type TransactionReceipt, type Address } from 'viem';
import { getBaseClient } from '../lib/viem.js';
import { resolveToken } from './tokenResolver.js';
import { resolveProtocol } from './protocolResolver.js';
import { getEthPrice, getUsdPrice } from './priceResolver.js';
import { decodeMethod, classifyTxType } from './decoder.js';
import { resolveAgentByAddress } from './agentResolver.js';
import { logger } from '../lib/logger.js';

export interface ProcessedTransaction {
  timestamp: Date;
  chain: string;
  txHash: string;
  blockNumber: number;
  walletAddress: string;
  direction: 'in' | 'out' | 'self';
  counterparty: string | null;
  tokenAddress: string | null;
  tokenSymbol: string | null;
  tokenDecimals: number | null;
  amountRaw: string | null;
  amountUsd: string | null;
  gasUsed: number | null;
  gasPriceGwei: string | null;
  gasCostNative: string | null;
  gasCostUsd: string | null;
  txType: string | null;
  methodId: string | null;
  methodName: string | null;
  contractAddress: string | null;
  protocolName: string | null;
  isAgentInteraction: boolean;
  counterpartyAgentId: number | null;
  status: string;
  rawData: Record<string, unknown> | null;
}

interface WebhookJobData {
  type: 'webhook';
  txHash: string;
  blockNumber: number;
  fromAddress: string;
  toAddress: string;
  value: number;
  asset: string;
  category: string;
  rawContract?: {
    rawValue: string;
    address: string;
    decimals: number;
  };
  network: string;
}

/**
 * Process a transaction from an Alchemy webhook activity event.
 * Fetches receipt, decodes calldata, resolves tokens/prices, normalizes into ProcessedTransaction.
 */
export async function processWebhookTx(
  data: WebhookJobData,
  monitoredAddresses: Set<string>,
): Promise<ProcessedTransaction[]> {
  const client = getBaseClient();
  const results: ProcessedTransaction[] = [];

  let receipt: TransactionReceipt | null = null;
  let tx: Awaited<ReturnType<typeof client.getTransaction>> | null = null;

  try {
    [receipt, tx] = await Promise.all([
      client.getTransactionReceipt({ hash: data.txHash as `0x${string}` }),
      client.getTransaction({ hash: data.txHash as `0x${string}` }),
    ]);
  } catch (err) {
    logger.warn({ err, txHash: data.txHash }, 'Failed to fetch tx receipt/details');
    return results;
  }

  if (!receipt || !tx) return results;

  // Get block for timestamp
  const block = await client.getBlock({ blockNumber: receipt.blockNumber });
  const timestamp = new Date(Number(block.timestamp) * 1000);

  // Decode method
  const decoded = await decodeMethod(tx.input);
  const txType = classifyTxType(decoded?.methodName ?? null, tx.input, tx.to);

  // Gas calculations
  const gasUsed = Number(receipt.gasUsed);
  const effectiveGasPrice = receipt.effectiveGasPrice;
  const gasCostWei = receipt.gasUsed * effectiveGasPrice;
  const gasCostNative = formatEther(gasCostWei);
  const gasPriceGwei = formatUnits(effectiveGasPrice, 9);

  const ethPrice = await getEthPrice();
  const gasCostUsd = ethPrice ? (parseFloat(gasCostNative) * ethPrice).toFixed(6) : null;

  // Determine which monitored addresses are involved
  const fromLower = data.fromAddress?.toLowerCase();
  const toLower = data.toAddress?.toLowerCase();

  for (const addr of monitoredAddresses) {
    const addrLower = addr.toLowerCase();
    const isFrom = fromLower === addrLower;
    const isTo = toLower === addrLower;

    if (!isFrom && !isTo) continue;

    let direction: 'in' | 'out' | 'self' = 'out';
    if (isFrom && isTo) direction = 'self';
    else if (isTo) direction = 'in';

    let tokenAddress: string | null = null;
    let tokenSymbol: string | null = null;
    let tokenDecimals: number | null = null;
    let amountRaw: string | null = null;
    let amountUsd: string | null = null;

    if (data.category === 'erc20' && data.rawContract) {
      tokenAddress = data.rawContract.address;
      tokenDecimals = data.rawContract.decimals;

      const tokenMeta = await resolveToken(data.rawContract.address);
      tokenSymbol = tokenMeta?.symbol ?? data.asset;

      amountRaw = data.rawContract.rawValue;
      const amount = parseFloat(formatUnits(BigInt(data.rawContract.rawValue), tokenDecimals));
      const price = await getUsdPrice(tokenSymbol);
      if (price) amountUsd = (amount * price).toFixed(6);
    } else if (data.category === 'external' || data.category === 'internal') {
      tokenSymbol = 'ETH';
      tokenDecimals = 18;
      // Use Alchemy's per-activity value (already in ETH decimal), not tx.value
      // which is the top-level tx value and is 0 for internal transfers (e.g. ETH
      // received back from a swap router).
      const amount = data.value ?? 0;
      amountRaw = BigInt(Math.round(amount * 1e18)).toString();
      if (ethPrice) amountUsd = (amount * ethPrice).toFixed(6);
    }

    const counterparty = direction === 'out' ? data.toAddress : data.fromAddress;

    // Resolve protocol name from known_contracts
    const protocolName = tx.to ? await resolveProtocol(tx.to, 'base') : null;

    // Agent-to-agent interaction detection
    const counterpartyAgent = counterparty ? await resolveAgentByAddress(counterparty) : null;

    results.push({
      timestamp,
      chain: 'base',
      txHash: data.txHash,
      blockNumber: data.blockNumber,
      walletAddress: addr,
      direction,
      counterparty: counterparty ?? null,
      tokenAddress,
      tokenSymbol,
      tokenDecimals,
      amountRaw,
      amountUsd,
      gasUsed: direction === 'out' || direction === 'self' ? gasUsed : null,
      gasPriceGwei: direction === 'out' || direction === 'self' ? gasPriceGwei : null,
      gasCostNative: direction === 'out' || direction === 'self' ? gasCostNative : null,
      gasCostUsd: direction === 'out' || direction === 'self' ? gasCostUsd : null,
      txType,
      methodId: decoded?.methodId ?? null,
      methodName: decoded?.methodName ?? null,
      contractAddress: tx.to ?? null,
      protocolName,
      isAgentInteraction: counterpartyAgent !== null,
      counterpartyAgentId: counterpartyAgent?.id ?? null,
      status: receipt.status === 'success' ? 'confirmed' : 'failed',
      rawData: null,
    });
  }

  return results;
}
