import { sql } from 'drizzle-orm';
import { transactions, type Database } from '@chainward/db';

export type TransactionInsert = typeof transactions.$inferInsert;

/**
 * Serialize inserts for a single (txHash, wallet) pair so retries and
 * overlapping backfills do not race each other while the DB unique constraint
 * also guards against any duplicate rows that slip past application logic.
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

    try {
      await trx.insert(transactions).values(tx);
      return true;
    } catch (err) {
      if (isUniqueViolation(err)) {
        return false;
      }
      throw err;
    }
  });
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;

  const code = 'code' in err ? String((err as { code?: unknown }).code ?? '') : '';
  return code === '23505';
}
