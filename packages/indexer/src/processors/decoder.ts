import { decodeFunctionData, parseAbi, type Hex } from 'viem';
import { getRedis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';

/** Common function signatures for method identification */
const KNOWN_SIGNATURES = parseAbi([
  'function transfer(address to, uint256 amount)',
  'function transferFrom(address from, address to, uint256 amount)',
  'function approve(address spender, uint256 amount)',
  'function swap(uint256 amountIn, uint256 amountOutMin, address[] path, address to, uint256 deadline)',
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96))',
  'function multicall(uint256 deadline, bytes[] data)',
  'function execute(bytes commands, bytes[] inputs, uint256 deadline)',
  // Aerodrome Router swap functions
  'function swapExactETHForTokens(uint256 amountOutMin, (address from, address to, bool stable, address factory)[] routes, address to, uint256 deadline)',
  'function swapExactTokensForTokens(uint256 amountIn, uint256 amountOutMin, (address from, address to, bool stable, address factory)[] routes, address to, uint256 deadline)',
  'function swapExactTokensForETH(uint256 amountIn, uint256 amountOutMin, (address from, address to, bool stable, address factory)[] routes, address to, uint256 deadline)',
]);

interface DecodedMethod {
  methodId: string;
  methodName: string;
}

const CACHE_TTL = 86400 * 7; // 7 days

/** Decode transaction calldata to identify method name */
export async function decodeMethod(input: string): Promise<DecodedMethod | null> {
  if (!input || input === '0x' || input.length < 10) {
    return null; // Native transfer
  }

  const methodId = input.slice(0, 10);

  // Try known signatures first
  try {
    for (const abi of KNOWN_SIGNATURES) {
      try {
        const decoded = decodeFunctionData({
          abi: [abi],
          data: input as Hex,
        });
        return { methodId, methodName: decoded.functionName };
      } catch {
        // Not this signature, try next
      }
    }
  } catch {
    // Fall through to 4byte lookup
  }

  // Try 4byte directory lookup
  return lookup4byte(methodId);
}

/** Look up method signature from 4byte.directory */
async function lookup4byte(methodId: string): Promise<DecodedMethod | null> {
  const redis = getRedis();
  const cacheKey = `4byte:${methodId}`;

  const cached = await redis.get(cacheKey);
  if (cached) return { methodId, methodName: cached };

  try {
    const response = await fetch(
      `https://www.4byte.directory/api/v1/signatures/?hex_signature=${methodId}`,
    );

    if (!response.ok) return { methodId, methodName: 'unknown' };

    const data = (await response.json()) as {
      results: Array<{ text_signature: string }>;
    };

    const sig = data.results?.[0]?.text_signature;
    if (sig) {
      const name = sig.split('(')[0] ?? 'unknown';
      await redis.setex(cacheKey, CACHE_TTL, name);
      return { methodId, methodName: name };
    }
  } catch (err) {
    logger.debug({ err, methodId }, '4byte lookup failed');
  }

  return { methodId, methodName: 'unknown' };
}

/** Classify transaction type based on method and context */
export function classifyTxType(
  methodName: string | null,
  input: string,
  toAddress: string | null,
): string {
  if (!input || input === '0x') return 'transfer';

  const name = methodName?.toLowerCase() ?? '';
  if (name.includes('swap') || name.includes('exactinput') || name.includes('exactoutput')) {
    return 'swap';
  }
  if (name === 'approve') return 'approval';
  if (name === 'transfer' || name === 'transferfrom') return 'transfer';
  // multicall/execute are used by DEX routers — classify based on context when possible
  if (name.includes('multicall') || name.includes('execute')) return 'contract_call';

  return 'contract_call';
}
