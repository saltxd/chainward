import IORedis from 'ioredis';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { AssetToken } from '@virtuals-protocol/acp-node-v2';
import { quickDecode } from '@chainward/decode';
import { fetchFixtures } from './data-fetch.js';
import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { RateLimiter } from './rate-limit.js';
import { persistAccepted, persistDelivered, persistRejected } from './persist.js';
import { startSeller } from './seller.js';
import type { HandlerContext } from './handler.js';

const SENTINEL_RPC = process.env.SENTINEL_RPC ?? 'http://cw-sentinel:8545';

// Blockscout adapter for chainHistory check.
// Fail-open semantics: a Blockscout 5xx during onboarding shouldn't reject a paying buyer.
async function checkHistoryViaBlockscout(walletAddress: string) {
  try {
    const resp = await fetch(`https://base.blockscout.com/api/v2/addresses/${walletAddress}/counters`);
    if (!resp.ok) return { transactions_count: 1, token_transfers_count: 0 };
    const body: any = await resp.json();
    return {
      transactions_count: parseInt(body.transactions_count ?? '0', 10),
      token_transfers_count: parseInt(body.token_transfers_count ?? '0', 10),
    };
  } catch {
    return { transactions_count: 1, token_transfers_count: 0 };
  }
}

async function main() {
  const config = loadConfig();
  logger.info({ wallet: config.walletAddress, walletId: config.walletId }, 'chainward-acp-decoder starting');

  const sql = postgres(config.databaseUrl);
  const db = drizzle(sql);
  const redis = new IORedis(config.redisUrl);

  const rateLimiter = new RateLimiter(redis, {
    maxConcurrentDecodes: config.maxConcurrentDecodes,
    perBuyerInflightLimit: config.perBuyerInflightLimit,
    perBuyerSubmissionLimit60s: config.perBuyerSubmissionLimit60s,
  });

  const handlerCtx: HandlerContext = {
    rateLimiter,
    persist: {
      persistAccepted: (i) => persistAccepted(db, i),
      persistDelivered: (i) => persistDelivered(db, i),
      persistRejected: (i) => persistRejected(db, i),
    },
    decode: {
      quickDecode: async (input: any) => {
        const fixtures = await fetchFixtures(input.wallet_address, {
          sentinelRpc: SENTINEL_RPC,
          agentName: input.input?.startsWith?.('@') ? input.input : undefined,
        });
        return quickDecode({
          ...input,
          pipeline_version: process.env.GIT_SHA ?? 'dev',
          fixtures,
        });
      },
    },
    chainHistory: { checkHistory: checkHistoryViaBlockscout },
    config: { feeUsdc: 25, defaultChainId: config.defaultChainId },
    // AssetToken.usdc is a static factory — no on-chain call needed for token metadata
    assetTokenForUsdc: async (amount: number, chainId: number) => {
      return AssetToken.usdc(amount, chainId);
    },
  };

  const agent = await startSeller(config, handlerCtx);

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received; closing');
    await agent.stop();
    await redis.quit();
    await sql.end();
    process.exit(0);
  });
}

main().catch((err: any) => {
  logger.fatal({ err: err.message }, 'fatal');
  process.exit(1);
});
