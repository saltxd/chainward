import IORedis from 'ioredis';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { AssetToken } from '@virtuals-protocol/acp-node-v2';
import { quickDecode } from '@chainward/decode';
import { fetchFixtures } from './data-fetch.js';
import { loadConfig, type Config } from './config.js';
import { logger } from './logger.js';
import { RateLimiter } from './rate-limit.js';
import { persistAccepted, persistDelivered, persistRejected, persistSettled } from './persist.js';
import { startSeller } from './seller.js';
import type { HandlerContext } from './handler.js';

const PIPELINE_VERSION = process.env.GIT_SHA ?? 'dev';

// Blockscout adapter for chainHistory check.
// Fail-open semantics: a Blockscout 5xx during onboarding shouldn't reject a paying buyer.
// Bounded by an explicit timeout so a hanging response doesn't lock the handler.
async function checkHistoryViaBlockscout(walletAddress: string, timeoutMs: number) {
  try {
    const resp = await fetch(
      `https://base.blockscout.com/api/v2/addresses/${walletAddress}/counters`,
      { signal: AbortSignal.timeout(timeoutMs) },
    );
    if (!resp.ok) {
      logger.warn(
        { walletAddress, status: resp.status },
        'blockscout history check non-2xx; failing open',
      );
      return { transactions_count: 1, token_transfers_count: 0 };
    }
    const body: any = await resp.json();
    return {
      transactions_count: parseInt(body.transactions_count ?? '0', 10),
      token_transfers_count: parseInt(body.token_transfers_count ?? '0', 10),
    };
  } catch (err: any) {
    logger.warn(
      { walletAddress, err: err.message },
      'blockscout history check threw; failing open',
    );
    return { transactions_count: 1, token_transfers_count: 0 };
  }
}

// Resolves a Twitter handle to the wallet address registered on Virtuals' ACP API.
// Returns null on miss / API failure / timeout — the caller treats null as a hard reject.
async function resolveHandleViaAcp(handle: string, timeoutMs: number): Promise<string | null> {
  try {
    const resp = await fetch(
      `https://acpx.virtuals.io/api/agents?filters[twitterHandle][$eqi]=${encodeURIComponent(handle)}&pagination[pageSize]=1`,
      {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'User-Agent': 'Mozilla/5.0' },
      },
    );
    if (!resp.ok) return null;
    const body: any = await resp.json();
    const agent = body?.data?.[0];
    const wallet = agent?.walletAddress ?? agent?.wallet_address ?? null;
    return typeof wallet === 'string' && wallet.length > 0 ? wallet : null;
  } catch (err: any) {
    logger.warn({ handle, err: err.message }, 'resolveHandle threw');
    return null;
  }
}

async function main() {
  const config = loadConfig();
  logger.info(
    {
      wallet: config.walletAddress,
      walletId: config.walletId,
      feeUsdc: config.feeUsdc,
      chainId: config.defaultChainId,
      sentinelRpc: config.sentinelRpc,
    },
    'chainward-acp-decoder starting',
  );

  const sql = postgres(config.databaseUrl);
  const db = drizzle(sql);
  const redis = new IORedis(config.redisUrl);

  const rateLimiter = new RateLimiter(redis, {
    maxConcurrentDecodes: config.maxConcurrentDecodes,
    perBuyerInflightLimit: config.perBuyerInflightLimit,
    perBuyerSubmissionLimit60s: config.perBuyerSubmissionLimit60s,
  });

  // In-flight job tracking — used by SIGTERM handler to await graceful drain
  const inflight = new Set<string>();

  const handlerCtx: HandlerContext = {
    rateLimiter,
    persist: {
      persistAccepted: (i) => persistAccepted(db, i),
      persistDelivered: (i) => persistDelivered(db, i),
      persistRejected: (i) => persistRejected(db, i),
      persistSettled: (jobId) => persistSettled(db, jobId),
    },
    decode: {
      quickDecode: async (input: any) => {
        const fixtures = await fetchFixtures(input.wallet_address, {
          sentinelRpc: config.sentinelRpc,
          fetchTimeoutMs: config.fetchTimeoutMs,
          agentName: input.agent_handle ? `@${input.agent_handle}` : undefined,
        });
        return quickDecode({
          ...input,
          pipeline_version: PIPELINE_VERSION,
          fixtures,
        });
      },
    },
    resolver: {
      resolveHandle: (handle) => resolveHandleViaAcp(handle, config.fetchTimeoutMs),
    },
    chainHistory: {
      checkHistory: (wallet) => checkHistoryViaBlockscout(wallet, config.fetchTimeoutMs),
    },
    config: {
      feeUsdc: config.feeUsdc,
      defaultChainId: config.defaultChainId,
      decodeWatchdogMs: config.decodeWatchdogMs,
    },
    assetTokenForUsdc: async (amount: number, chainId: number) => {
      return AssetToken.usdc(amount, chainId);
    },
    onJobStart: (jobId) => {
      inflight.add(jobId);
    },
    onJobEnd: (jobId) => {
      inflight.delete(jobId);
    },
  };

  const agent = await startSeller(config, handlerCtx);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal, inflight: inflight.size }, 'shutdown initiated; draining in-flight jobs');

    const start = Date.now();
    const deadline = start + config.shutdownDrainMs;
    while (inflight.size > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 500));
    }
    if (inflight.size > 0) {
      logger.warn(
        { inflight: inflight.size, drainedFor: Date.now() - start },
        'drain timed out; in-flight jobs will be lost on exit',
      );
    } else {
      logger.info({ drainedFor: Date.now() - start }, 'drain complete');
    }

    try {
      await agent.stop();
    } catch (err: any) {
      logger.warn({ err: err.message }, 'agent.stop threw');
    }
    try {
      await redis.quit();
    } catch (err: any) {
      logger.warn({ err: err.message }, 'redis.quit threw');
    }
    try {
      await sql.end();
    } catch (err: any) {
      logger.warn({ err: err.message }, 'postgres end threw');
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err: any) => {
  logger.fatal({ err: err.message, stack: err.stack }, 'fatal');
  process.exit(1);
});
