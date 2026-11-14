import { sql } from 'drizzle-orm';
import { transactions, type Database } from '@chainward/db';
import { isSpamExcluded, spamExclusionSql } from '@chainward/observatory';

export type TransactionInsert = typeof transactions.$inferInsert;

/**
 * Serialize inserts for a single (txHash, wallet) pair so retries and
 * overlapping backfills do not race each other while the DB unique constraint
 * also guards against any duplicate rows that slip past application logic.
 *
 * A transaction can leave several rows for one wallet (ETH out and a token out,
 * or several internal ETH sends). The wallet paid the gas once, and every gas
 * total sums over rows, so each gas field is kept on one row only: the first
 * row that has it. The lock above makes "first" well defined.
 */
export async function insertTransactionIfNew(db: Database, tx: TransactionInsert): Promise<boolean> {
  return (await storeTransaction(db, tx)).inserted;
}

export interface StoredTransaction {
  /** This call inserted the row. */
  inserted: boolean;
  /** When the row was stored (Postgres clock); null if a concurrent insert won the unique constraint. */
  ingestedAt: Date | null;
}

/** insertTransactionIfNew, also saying when the stored row was written. */
export async function storeTransaction(db: Database, tx: TransactionInsert): Promise<StoredTransaction> {
  return db.transaction(async (trx) => {
    await trx.execute(sql`
      SELECT pg_advisory_xact_lock(
        hashtext(${tx.txHash}),
        hashtext(${tx.walletAddress})
      )
    `);

    const existing = await trx.execute<{ ingested_at: Date | string }>(sql`
      SELECT ingested_at
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

    const stored = existing[0];
    if (stored) {
      return { inserted: false, ingestedAt: new Date(stored.ingested_at) };
    }

    const row = carriesGas(tx) ? withoutRecordedGas(tx, await recordedGas(trx, tx)) : tx;

    try {
      const [created] = await trx
        .insert(transactions)
        .values(row)
        .returning({ ingestedAt: transactions.ingestedAt });
      return { inserted: true, ingestedAt: created?.ingestedAt ?? null };
    } catch (err) {
      if (isUniqueViolation(err)) {
        return { inserted: false, ingestedAt: null };
      }
      throw err;
    }
  });
}

type Trx = Parameters<Parameters<Database['transaction']>[0]>[0];

const GAS_FIELDS = ['gasUsed', 'gasPriceGwei', 'gasCostNative', 'gasCostUsd'] as const;
type GasField = (typeof GAS_FIELDS)[number];

function carriesGas(tx: TransactionInsert): boolean {
  return GAS_FIELDS.some((field) => tx[field] != null);
}

/**
 * Which gas fields the stored rows of this transaction already hold for this
 * wallet. For a real row, spam-token rows do not count: gas totals leave them
 * out, so gas held only by a spam row would be missing from every total. For a
 * spam row every stored row counts, so at most one spam row holds the gas.
 */
async function recordedGas(trx: Trx, tx: TransactionInsert): Promise<Record<GasField, boolean>> {
  const rowsThatCount = isSpamExcluded(tx) ? sql`` : spamExclusionSql;
  const rows = await trx.execute(sql`
    SELECT
      COALESCE(bool_or(gas_used IS NOT NULL), false) AS "gasUsed",
      COALESCE(bool_or(gas_price_gwei IS NOT NULL), false) AS "gasPriceGwei",
      COALESCE(bool_or(gas_cost_native IS NOT NULL), false) AS "gasCostNative",
      COALESCE(bool_or(gas_cost_usd IS NOT NULL), false) AS "gasCostUsd"
    FROM transactions
    WHERE chain = ${tx.chain}
      AND tx_hash = ${tx.txHash}
      AND block_number = ${tx.blockNumber}
      AND wallet_address = ${tx.walletAddress}
      AND timestamp = ${tx.timestamp instanceof Date ? tx.timestamp.toISOString() : tx.timestamp}
      ${rowsThatCount}
  `);
  return rows[0] as unknown as Record<GasField, boolean>;
}

/** The row to store: each gas field another row already holds is left empty. */
function withoutRecordedGas(tx: TransactionInsert, recorded: Record<GasField, boolean>): TransactionInsert {
  const row = { ...tx };
  for (const field of GAS_FIELDS) {
    if (recorded[field]) row[field] = null;
  }
  return row;
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;

  const code = 'code' in err ? String((err as { code?: unknown }).code ?? '') : '';
  return code === '23505';
}
