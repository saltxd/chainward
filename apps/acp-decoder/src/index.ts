import IORedis from 'ioredis';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { quickDecode } from '@chainward/decode';
import { fetchFixtures } from './data-fetch.js';
import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { RateLimiter } from './rate-limit.js';
import { persistAccepted, persistDelivered, persistRejected } from './persist.js';
import { startSeller } from './seller.js';
import { reconcile } from './reconcile.js';
import { AcpApi } from './api.js';
import type { HandlerContext } from './handler.js';

// Blockscout adapter for chainHistory check (Task 21a).
// Fail-open semantics: a Blockscout 5xx during onboarding shouldn't reject a paying buyer.
async function checkHistoryViaBlockscout(walletAddress: string) {
  try {
    const resp = await fetch(`https://base.blockscout.com/api/v2/addresses/${walletAddress}/counters`);
    if (!resp.ok) return { transactions_count: 1, token_transfers_count: 0 }; // fail open
    const body: any = await resp.json();
    return {
      transactions_count: parseInt(body.transactions_count ?? '0', 10),
      token_transfers_count: parseInt(body.token_transfers_count ?? '0', 10),
    };
  } catch {
    return { transactions_count: 1, token_transfers_count: 0 }; // fail open on network error
  }
}

async function main() {
  const config = loadConfig();
  const SENTINEL_RPC = process.env.SENTINEL_RPC ?? 'http://cw-sentinel:8545';
  logger.info({ wallet: config.walletAddress }, 'chainward-acp-decoder starting');

  const sql = postgres(config.databaseUrl);
  const db = drizzle(sql);
  const redis = new IORedis(config.redisUrl);

  const rateLimiter = new RateLimiter(redis, {
    maxConcurrentDecodes: config.maxConcurrentDecodes,
    perBuyerInflightLimit: config.perBuyerInflightLimit,
    perBuyerSubmissionLimit60s: config.perBuyerSubmissionLimit60s,
  });

  const acpApi = new AcpApi({
    clawApiHost: config.clawApiHost,
    liteAgentApiKey: config.liteAgentApiKey,
  });

  const handlerCtx: HandlerContext = {
    api: {
      accept: (jobId: string) => acpApi.accept(jobId),
      reject: (jobId: string, opts: { reason: string }) => acpApi.reject(jobId, opts.reason),
      requirement: (jobId: string, opts: any) => acpApi.requirement(jobId, opts),
      deliver: (jobId: string, payload: any) => acpApi.deliver(jobId, payload),
    },
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
          agentName: input.input?.startsWith('@') ? input.input : undefined,
        });
        return quickDecode({
          ...input,
          pipeline_version: process.env.GIT_SHA ?? 'dev',
          fixtures,
        });
      },
    },
    chainHistory: { checkHistory: checkHistoryViaBlockscout },
    config: { feeUsdc: 25 },
  };

  await reconcile(config, handlerCtx);
  startSeller(config, handlerCtx);

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received; closing');
    await redis.quit();
    await sql.end();
    process.exit(0);
  });
}

main().catch((err: any) => {
  logger.fatal({ err: err.message }, 'fatal');
  process.exit(1);
});
