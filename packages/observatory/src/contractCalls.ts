import { sql } from 'drizzle-orm';

/**
 * Raw SQL fragment that leaves out contract-call rows: no token and a zero
 * amount (an approval, a claim, a reverted call the wallet sent). They moved
 * nothing, so they are not transfers on the wire and do not make a wallet one
 * that moved money. Rows with an amount or a token, and rows with no recorded
 * amount, are kept as before.
 *
 * Assumes `token_address` and `amount_raw` are unambiguous in the FROM clause.
 */
export const movedValueSql = sql`AND (token_address IS NOT NULL OR amount_raw IS DISTINCT FROM 0)`;
