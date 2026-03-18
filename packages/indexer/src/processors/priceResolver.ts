import { getRedis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';

const CACHE_TTL = 300; // 5 minutes
const COINGECKO_API = 'https://api.coingecko.com/api/v3';

const STABLECOINS = new Set(['USDC', 'USDT', 'DAI']);

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

const COINGECKO_TO_TOKEN: Record<string, string> = Object.fromEntries(
  Object.entries(TOKEN_TO_COINGECKO).map(([sym, id]) => [id, sym]),
);

const RATE_LIMIT_TTL = 120; // Cache "rate limited" for 2 minutes to stop thundering herd

/** Get current USD price for a token symbol */
export async function getUsdPrice(symbol: string): Promise<number | null> {
  const upper = symbol.toUpperCase();
  if (STABLECOINS.has(upper)) return 1.0;

  const redis = getRedis();
  const cacheKey = `price:${upper}`;

  const cached = await redis.get(cacheKey);
  if (cached === 'RATE_LIMITED') return null;
  if (cached) return parseFloat(cached);

  const coinId = TOKEN_TO_COINGECKO[upper];
  if (!coinId) return null;

  try {
    const response = await fetch(
      `${COINGECKO_API}/simple/price?ids=${coinId}&vs_currencies=usd`,
    );

    if (response.status === 429) {
      // Cache the rate limit so we stop hammering CoinGecko
      await redis.setex(cacheKey, RATE_LIMIT_TTL, 'RATE_LIMITED');
      logger.warn({ symbol }, 'CoinGecko rate limited, backing off 2min');
      return null;
    }

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

/**
 * Batch-fetch USD prices for multiple token symbols in a single CoinGecko call.
 * Checks Redis cache first — only fetches uncached, non-stablecoin tokens.
 */
export async function getUsdPrices(symbols: string[]): Promise<Map<string, number>> {
  const redis = getRedis();
  const result = new Map<string, number>();
  const toFetch: string[] = [];

  // Resolve stablecoins + cache hits
  const cacheKeys: string[] = [];
  const cacheSymbols: string[] = [];

  for (const sym of symbols) {
    const upper = sym.toUpperCase();
    if (STABLECOINS.has(upper)) {
      result.set(upper, 1.0);
      continue;
    }
    if (!TOKEN_TO_COINGECKO[upper]) continue;
    cacheKeys.push(`price:${upper}`);
    cacheSymbols.push(upper);
  }

  if (cacheKeys.length > 0) {
    const cached = await redis.mget(...cacheKeys);
    for (let i = 0; i < cached.length; i++) {
      const sym = cacheSymbols[i]!;
      if (cached[i] !== null) {
        result.set(sym, parseFloat(cached[i]!));
      } else {
        toFetch.push(sym);
      }
    }
  }

  if (toFetch.length === 0) return result;

  // Batch fetch uncached tokens in one API call
  const coinIds = toFetch.map((s) => TOKEN_TO_COINGECKO[s]).filter(Boolean);
  try {
    const response = await fetch(
      `${COINGECKO_API}/simple/price?ids=${coinIds.join(',')}&vs_currencies=usd`,
    );

    if (response.status === 429) {
      // Cache rate limit for all tokens to stop thundering herd
      const pipeline2 = redis.pipeline();
      for (const sym of toFetch) {
        pipeline2.setex(`price:${sym}`, RATE_LIMIT_TTL, 'RATE_LIMITED');
      }
      await pipeline2.exec();
      logger.warn({ symbols: toFetch }, 'CoinGecko batch rate limited, backing off 2min');
      return result;
    }

    if (!response.ok) {
      logger.warn({ status: response.status, symbols: toFetch }, 'CoinGecko batch price lookup failed');
      return result;
    }

    const data = (await response.json()) as Record<string, { usd: number }>;
    const pipeline = redis.pipeline();

    for (const [coinId, priceData] of Object.entries(data)) {
      const sym = COINGECKO_TO_TOKEN[coinId];
      if (sym && priceData.usd != null) {
        result.set(sym, priceData.usd);
        pipeline.setex(`price:${sym}`, CACHE_TTL, priceData.usd.toString());
      }
    }

    await pipeline.exec();
  } catch (err) {
    logger.warn({ err, symbols: toFetch }, 'Error batch-fetching prices');
  }

  return result;
}

/** Get ETH price in USD */
export async function getEthPrice(): Promise<number | null> {
  return getUsdPrice('ETH');
}
