import { sql } from 'drizzle-orm';
import { transactions, type Database } from '@chainward/db';

export type TransactionInsert = typeof transactions.$inferInsert;

const NO_GAS = {
  gasUsed: null,
  gasPriceGwei: null,
  gasCostNative: null,
  gasCostUsd: null,
} as const;

/**
 * Serialize inserts for a single (txHash, wallet) pair so retries and
 * overlapping backfills do not race each other while the DB unique constraint
 * also guards against any duplicate rows that slip past application logic.
 *
 * A transaction can leave several rows for one wallet (ETH out and a token out,
 * or several internal ETH sends). The wallet paid the gas once, and every gas
 * total sums over rows, so only the first of those rows keeps the gas fields.
 * The lock above makes "first" well defined.
 */
export async function insertTransactionIfNew(db: Database, tx: TransactionInsert): Promise<boolean> {
  return db.transaction(async (trx) => {
    await trx.execute(sql`
      SELECT pg_advisory_xact_lock(
        hashtext(${tx.txHash}),
        hashtext(${tx.walletAddress})
      )
    `);

    const existing = await trx.execute(sql`
      SELECT 1
      FROM transactions
      WHERE chain = ${tx.chain}
        AND tx_hash = ${tx.txHash}
        AND block_number = ${tx.blockNumber}
        AND wallet_address = ${tx.walletAddress}
        AND direction = ${tx.direction}
        AND status = ${tx.status}
        AND timestamp = ${tx.timestamp instanceof Date ? tx.timestamp.toISOString() : tx.timestamp}
        AND counterparty IS NOT DISTINCT FROM ${tx.counterparty ?? null}
        AND token_address IS NOT DISTINCT FROM ${tx.tokenAddress ?? null}
        AND amount_raw IS NOT DISTINCT FROM ${tx.amountRaw ?? null}
        AND contract_address IS NOT DISTINCT FROM ${tx.contractAddress ?? null}
        AND method_id IS NOT DISTINCT FROM ${tx.methodId ?? null}
      LIMIT 1
    `);

    if (existing.length > 0) {
      return false;
    }

    const carriesGas = tx.gasUsed != null || tx.gasCostNative != null || tx.gasCostUsd != null;
    const row = carriesGas && (await gasAlreadyRecorded(trx, tx)) ? { ...tx, ...NO_GAS } : tx;

    try {
      await trx.insert(transactions).values(row);
      return true;
    } catch (err) {
      if (isUniqueViolation(err)) {
        return false;
      }
      throw err;
    }
  });
}

type Trx = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Whether another row of this transaction already holds this wallet's gas. */
async function gasAlreadyRecorded(trx: Trx, tx: TransactionInsert): Promise<boolean> {
  const rows = await trx.execute(sql`
    SELECT 1
    FROM transactions
    WHERE chain = ${tx.chain}
      AND tx_hash = ${tx.txHash}
      AND block_number = ${tx.blockNumber}
      AND wallet_address = ${tx.walletAddress}
      AND timestamp = ${tx.timestamp instanceof Date ? tx.timestamp.toISOString() : tx.timestamp}
      AND (gas_used IS NOT NULL OR gas_cost_native IS NOT NULL OR gas_cost_usd IS NOT NULL)
    LIMIT 1
  `);
  return rows.length > 0;
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;

  const code = 'code' in err ? String((err as { code?: unknown }).code ?? '') : '';
  return code === '23505';
}
