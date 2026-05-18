import { sql, or, isNull, notInArray, and, type SQL } from 'drizzle-orm';
import { transactions } from '@chainward/db';
import { SPAM_TOKENS } from '@chainward/common';

const spamList = [...SPAM_TOKENS];

/**
 * Drizzle expression that excludes transactions whose token is on the
 * spam-contract list OR whose token_symbol contains non-ASCII characters
 * (homoglyph dust like ÚSDС, ỤSDC, ՍЅⅮС).
 *
 * Use in query-builder paths:
 *   .where(and(<your conditions>, spamFilter()))
 */
export function spamFilter(): SQL | undefined {
  const symbolFilter = sql`(${transactions.tokenSymbol} IS NULL OR ${transactions.tokenSymbol} ~ '^[ -~]+$')`;
  if (spamList.length === 0) return symbolFilter;
  return and(
    or(isNull(transactions.tokenAddress), notInArray(transactions.tokenAddress, spamList)),
    symbolFilter,
  );
}

/**
 * Raw SQL fragment for use inside `db.execute(sql\`SELECT ... WHERE ... ${spamExclusionSql}\`)`.
 * Assumes `token_address` and `token_symbol` columns are unambiguous in the FROM clause.
 */
export const spamExclusionSql =
  spamList.length > 0
    ? sql`AND (token_address IS NULL OR token_address NOT IN (${sql.join(
        spamList.map((s) => sql`${s}`),
        sql`, `,
      )})) AND (token_symbol IS NULL OR token_symbol ~ '^[ -~]+$')`
    : sql`AND (token_symbol IS NULL OR token_symbol ~ '^[ -~]+$')`;
