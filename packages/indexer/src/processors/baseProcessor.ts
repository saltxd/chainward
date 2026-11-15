import { formatEther, formatUnits } from 'viem';
import { getBaseClient } from '../lib/viem.js';
import { resolveToken } from './tokenResolver.js';
import { resolveProtocol } from './protocolResolver.js';
import { getEthPrice, getTokenUsdPrice } from './priceResolver.js';
import { decodeMethod, classifyTxType } from './decoder.js';
import { resolveAgentByAddress } from './agentResolver.js';

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
    address?: string | null;
    decimals?: number | null;
  };
  network: string;
}

type Direction = ProcessedTransaction['direction'];

interface WalletLeg {
  wallet: string;
  direction: Direction;
}

/** A top-level transaction that sent no ETH: a contract call (an approval, a claim, a call that reverted). */
function isZeroValueCall(data: WebhookJobData): boolean {
  return data.category === 'external' && data.value === 0;
}

/**
 * The monitored wallets this activity is a leg of. A zero-value call is a leg
 * only of the wallet that sent it: a call someone else sent to the wallet is
 * their transaction (and a known spam shape). A zero-value internal call moves
 * nothing and is nobody's leg.
 */
function walletLegs(data: WebhookJobData, monitoredAddresses: Set<string>): WalletLeg[] {
  if (data.category === 'internal' && data.value === 0) return [];
  const fromLower = data.fromAddress?.toLowerCase();
  const toLower = data.toAddress?.toLowerCase();
  const senderOnly = isZeroValueCall(data);

  const legs: WalletLeg[] = [];
  for (const wallet of monitoredAddresses) {
    const lower = wallet.toLowerCase();
    const isFrom = fromLower === lower;
    const isTo = toLower === lower;
    if (!isFrom && !(isTo && !senderOnly)) continue;
    legs.push({ wallet, direction: isFrom && isTo ? 'self' : isFrom ? 'out' : 'in' });
  }
  return legs;
}

const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/**
 * Whether the wallet sent an ERC-20 token in this transaction. Each such
 * transfer arrives as its own token activity, stored as an outbound leg that
 * carries the gas, so a contract-call row would only repeat the transaction.
 * An ERC-721 Transfer has a fourth topic (the token id); NFT activity is not
 * stored, so it does not count.
 */
function walletSentTokens(logs: ReadonlyArray<{ topics: readonly string[] }>, wallet: string): boolean {
  const lower = wallet.toLowerCase();
  return logs.some(
    ({ topics }) =>
      topics.length === 3 &&
      topics[0]?.toLowerCase() === ERC20_TRANSFER_TOPIC &&
      `0x${topics[1]?.slice(-40).toLowerCase()}` === lower,
  );
}

/**
 * Process a transaction from an Alchemy webhook activity event.
 * Fetches receipt, decodes calldata, resolves tokens/prices, normalizes into ProcessedTransaction.
 *
 * A zero-value call becomes one row for the wallet that sent it, with its gas
 * and status, unless the wallet sent tokens in it. The decision reads only the
 * receipt, so it is the same whichever webhook batch the token legs arrive in.
 */
export async function processWebhookTx(
  data: WebhookJobData,
  monitoredAddresses: Set<string>,
): Promise<ProcessedTransaction[]> {
  const involved = walletLegs(data, monitoredAddresses);
  if (involved.length === 0) return [];

  const client = getBaseClient();
  const results: ProcessedTransaction[] = [];

  // A failed fetch (RPC timeout, a node a block behind the webhook) throws to
  // the worker, so BullMQ retries the job instead of completing it unstored.
  const [receipt, tx] = await Promise.all([
    client.getTransactionReceipt({ hash: data.txHash as `0x${string}` }),
    client.getTransaction({ hash: data.txHash as `0x${string}` }),
  ]);

  // Four independent lookups: block (for timestamp), method decode, ETH price,
  // and protocol resolution. None depend on each other so they can fan out.
  const [block, decoded, ethPrice, protocolName] = await Promise.all([
    client.getBlock({ blockNumber: receipt.blockNumber }),
    decodeMethod(tx.input),
    getEthPrice(),
    tx.to ? resolveProtocol(tx.to, 'base') : Promise.resolve(null),
  ]);
  const timestamp = new Date(Number(block.timestamp) * 1000);
  const txType = classifyTxType(decoded?.methodName ?? null, tx.input);

  // Gas calculations
  const gasUsed = Number(receipt.gasUsed);
  const effectiveGasPrice = receipt.effectiveGasPrice;
  const gasCostWei = receipt.gasUsed * effectiveGasPrice;
  const gasCostNative = formatEther(gasCostWei);
  const gasPriceGwei = formatUnits(effectiveGasPrice, 9);
  const gasCostUsd = ethPrice ? (parseFloat(gasCostNative) * ethPrice).toFixed(6) : null;

  const legs = isZeroValueCall(data)
    ? involved.filter(({ wallet }) => !walletSentTokens(receipt.logs, wallet))
    : involved;

  for (const { wallet: addr, direction } of legs) {
    let tokenAddress: string | null = null;
    let tokenSymbol: string | null = null;
    let tokenDecimals: number | null = null;
    let amountRaw: string | null = null;
    let amountUsd: string | null = null;

    const token = data.rawContract;
    if (
      (data.category === 'erc20' || data.category === 'token') &&
      token?.address &&
      typeof token.decimals === 'number'
    ) {
      tokenAddress = token.address;
      tokenDecimals = token.decimals;

      const tokenMeta = await resolveToken(token.address);
      tokenSymbol = tokenMeta?.symbol ?? data.asset;

      // Alchemy rawValue is hex — convert to decimal string for numeric DB column
      const rawBigInt = BigInt(token.rawValue);
      amountRaw = rawBigInt.toString();
      const amount = parseFloat(formatUnits(rawBigInt, token.decimals));
      const price = await getTokenUsdPrice(token.address);
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
