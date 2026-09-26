import { Worker, Queue, type Job } from 'bullmq';
import { eq, sql } from 'drizzle-orm';
import {
  createPublicClient,
  createWalletClient,
  http,
  parseEventLogs,
  zeroAddress,
  zeroHash,
  type Hex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import {
  ATTEST_SCHEMA,
  ATTEST_SCHEMA_UID,
  EAS_ABI,
  EAS_ADDRESS,
  SCHEMA_REGISTRY_ABI,
  SCHEMA_REGISTRY_ADDRESS,
  encodeAttestationData,
  isAttestable,
  loadAllowlist,
  type RiskAssessment,
} from '@chainward/decode';
import { riskReports } from '@chainward/db';
import { getDb } from '../lib/db.js';
import { getRedis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';

// ─── ChainWard Attest ─────────────────────────────────────────────────────────
//
// Publishes the latest public risk report per address as an EAS attestation on
// Base, so agents and contracts can read ChainWard's flags for a counterparty
// from the chain itself. Off unless ATTEST_SIGNER_PRIVATE_KEY is set.
// Design: docs/ATTEST.md

const QUEUE = 'risk-attest';
const BATCH = parseInt(process.env.ATTEST_BATCH ?? '5', 10);
const DAILY_CAP = parseInt(process.env.ATTEST_DAILY_CAP ?? '50', 10);
// 0.0002 ETH — below this the run is skipped rather than failing mid-batch.
const MIN_BALANCE_WEI = BigInt(process.env.ATTEST_MIN_BALANCE_WEI ?? '200000000000000');
const RECEIPT_TIMEOUT_MS = 120_000;

interface PendingReport {
  id: string;
  wallet_address: string;
  chain: string;
  as_of_block: string | number;
  classifier_version: string;
  band: string;
  flag_count: number;
  risk_assessment: RiskAssessment;
}

function clients(key: Hex) {
  const account = privateKeyToAccount(key);
  const transport = http(process.env.BASE_RPC_URL, { timeout: 20_000 });
  return {
    account,
    pub: createPublicClient({ chain: base, transport }),
    wallet: createWalletClient({ account, chain: base, transport }),
  };
}

let schemaReady = false;

/** Register the schema on first use; the UID is deterministic, so this is idempotent. */
async function ensureSchema(c: ReturnType<typeof clients>): Promise<void> {
  if (schemaReady) return;
  const record = await c.pub.readContract({
    address: SCHEMA_REGISTRY_ADDRESS,
    abi: SCHEMA_REGISTRY_ABI,
    functionName: 'getSchema',
    args: [ATTEST_SCHEMA_UID],
  });
  if (record.uid === zeroHash) {
    const { request } = await c.pub.simulateContract({
      account: c.account,
      address: SCHEMA_REGISTRY_ADDRESS,
      abi: SCHEMA_REGISTRY_ABI,
      functionName: 'register',
      args: [ATTEST_SCHEMA, zeroAddress, true],
    });
    const hash = await c.wallet.writeContract(request);
    await c.pub.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS });
    logger.info({ schemaUid: ATTEST_SCHEMA_UID, tx: hash }, 'riskAttest: schema registered on Base');
  }
  schemaReady = true;
}

async function previousUid(address: string): Promise<Hex> {
  const rows = await getDb().execute(sql`
    SELECT attestation_uid FROM risk_reports
    WHERE lower(wallet_address) = lower(${address}) AND attestation_uid IS NOT NULL
    ORDER BY attested_at DESC LIMIT 1
  `);
  const uid = (rows as unknown as Array<{ attestation_uid: string }>)[0]?.attestation_uid;
  return (uid as Hex | undefined) ?? zeroHash;
}

async function attestOne(c: ReturnType<typeof clients>, r: PendingReport): Promise<Hex> {
  const data = encodeAttestationData({
    address: r.wallet_address,
    chain: r.chain,
    asOfBlock: Number(r.as_of_block),
    classifierVersion: r.classifier_version,
    assessment: r.risk_assessment,
  });
  const { request } = await c.pub.simulateContract({
    account: c.account,
    address: EAS_ADDRESS,
    abi: EAS_ABI,
    functionName: 'attest',
    args: [
      {
        schema: ATTEST_SCHEMA_UID,
        data: {
          recipient: r.wallet_address.toLowerCase() as Hex,
          expirationTime: 0n,
          revocable: true,
          refUID: await previousUid(r.wallet_address),
          data,
          value: 0n,
        },
      },
    ],
  });
  const hash = await c.wallet.writeContract(request);
  const receipt = await c.pub.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS });
  if (receipt.status !== 'success') throw new Error(`attest tx reverted: ${hash}`);

  const [event] = parseEventLogs({ abi: EAS_ABI, eventName: 'Attested', logs: receipt.logs });
  if (!event) throw new Error(`no Attested event in ${hash}`);

  await getDb()
    .update(riskReports)
    .set({ attestationUid: event.args.uid, attestationTx: hash, attestedAt: new Date() })
    .where(eq(riskReports.id, r.id));
  return event.args.uid;
}

export async function runAttestSweep(): Promise<Record<string, unknown>> {
  const key = process.env.ATTEST_SIGNER_PRIVATE_KEY as Hex | undefined;
  if (!key) return { skipped: 'no_signer' };

  const redis = getRedis();
  const dayKey = `attest:count:${new Date().toISOString().slice(0, 10)}`;
  const used = Number((await redis.get(dayKey)) ?? 0);
  if (used >= DAILY_CAP) return { skipped: 'daily_cap', used };

  const c = clients(key);
  const balance = await c.pub.getBalance({ address: c.account.address });
  if (balance < MIN_BALANCE_WEI) {
    logger.warn({ signer: c.account.address, balance: balance.toString() }, 'riskAttest: signer balance too low, skipping');
    return { skipped: 'low_balance', signer: c.account.address };
  }

  await ensureSchema(c);

  // Newest public report per address, still unattested, non-thin.
  const rows = await getDb().execute(sql`
    SELECT * FROM (
      SELECT DISTINCT ON (lower(wallet_address))
        id, wallet_address, chain, as_of_block, classifier_version, band, flag_count,
        risk_assessment, attestation_uid, generated_at
      FROM risk_reports
      WHERE is_public = true
      ORDER BY lower(wallet_address), generated_at DESC
    ) latest
    WHERE attestation_uid IS NULL AND (flag_count > 0 OR band <> 'low-signal')
    ORDER BY generated_at DESC
    LIMIT ${BATCH * 4}
  `);

  const allowlist = loadAllowlist();
  const pending = (rows as unknown as PendingReport[])
    .filter((r) => isAttestable({ address: r.wallet_address, flagCount: r.flag_count, band: r.band }, allowlist))
    .slice(0, Math.min(BATCH, DAILY_CAP - used));

  let attested = 0;
  for (const r of pending) {
    try {
      const uid = await attestOne(c, r);
      attested++;
      await redis.incr(dayKey);
      await redis.expire(dayKey, 2 * 86_400);
      logger.info({ address: r.wallet_address, uid }, 'riskAttest: report attested on Base');
    } catch (err) {
      // Left unattested; the next sweep retries it.
      logger.error({ address: r.wallet_address, err: (err as Error).message?.slice(0, 300) }, 'riskAttest: attestation failed');
    }
  }
  return { attested, candidates: pending.length };
}

// ─── Worker ───────────────────────────────────────────────────────────────────

export function createRiskAttestWorker() {
  return new Worker(QUEUE, async (_job: Job) => runAttestSweep(), {
    connection: getRedis(),
    // One sender, one nonce at a time.
    concurrency: 1,
  });
}

// ─── Schedule setup ───────────────────────────────────────────────────────────

export async function setupRiskAttestSchedule(redis: import('ioredis').default) {
  const queue = new Queue(QUEUE, { connection: redis });
  for (const job of await queue.getRepeatableJobs()) {
    await queue.removeRepeatableByKey(job.key);
  }
  await queue.add('risk-attest-sweep', {}, { repeat: { every: 10 * 60 * 1000 }, jobId: 'risk-attest-sweep' });
  logger.info('Risk attest schedule configured (every 10 minutes)');
  await queue.close();
}
