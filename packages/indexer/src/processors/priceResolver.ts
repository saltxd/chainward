import { getRedis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';

const CACHE_TTL = 300; // 5 minutes
const COINGECKO_API = 'https://api.coingecko.com/api/v3';

/** Well-known CoinGecko IDs for common tokens */
const TOKEN_TO_COINGECKO: Record<string, string> = {
  ETH: 'ethereum',
  WETH: 'weth',
  USDC: 'usd-coin',
  USDT: 'tether',
  DAI: 'dai',
  VIRTUAL: 'virtual-protocol',
  CBBTC: 'coinbase-wrapped-btc',
  AERO: 'aerodrome-finance',
  WSTETH: 'wrapped-steth',
};

/** Get current USD price for a token symbol */
export async function getUsdPrice(symbol: string): Promise<number | null> {
  const redis = getRedis();
  const cacheKey = `price:${symbol.toUpperCase()}`;

  // Stablecoins shortcut
  if (['USDC', 'USDT', 'DAI'].includes(symbol.toUpperCase())) {
    return 1.0;
  }

  // Check cache
  const cached = await redis.get(cacheKey);
  if (cached) return parseFloat(cached);

  const coinId = TOKEN_TO_COINGECKO[symbol.toUpperCase()];
  if (!coinId) return null;

  try {
    const response = await fetch(
      `${COINGECKO_API}/simple/price?ids=${coinId}&vs_currencies=usd`,
    );

    if (!response.ok) {
      logger.warn({ status: response.status, symbol }, 'CoinGecko price lookup failed');
      return null;
    }

    const data = (await response.json()) as Record<string, { usd: number }>;
    const price = data[coinId]?.usd ?? null;

    if (price !== null) {
      await redis.setex(cacheKey, CACHE_TTL, price.toString());
    }

    return price;
  } catch (err) {
    logger.warn({ err, symbol }, 'Error fetching price');
    return null;
  }
}

/** Get ETH price in USD */
export async function getEthPrice(): Promise<number | null> {
  return getUsdPrice('ETH');
}
