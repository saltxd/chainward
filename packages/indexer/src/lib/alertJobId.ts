import { createHash } from 'node:crypto';

export interface AlertJobLeg {
  chain: string;
  walletAddress: string;
  txHash: string;
  direction: 'in' | 'out' | 'self';
  counterparty: string | null;
  tokenAddress: string | null;
  amountRaw: string | null;
}

/**
 * BullMQ job id for the alert evaluation of one leg of a transaction.
 *
 * A transaction can reach a wallet as several legs (ETH out, token in), and
 * each is evaluated on its own amount. The id is built from the leg's content,
 * so a second leg gets its own job instead of being dropped as a duplicate of
 * the first. The same leg always maps to the same id, which BullMQ ignores
 * while it still holds that job; the stored row (insertTransactionIfNew) is
 * what stops a retry from queueing a leg again. The evaluator's claim on
 * (alert config, tx hash) still allows one alert per transaction.
 */
export function alertJobId(leg: AlertJobLeg): string {
  const fingerprint = createHash('sha1')
    .update(
      JSON.stringify([leg.direction, leg.tokenAddress, leg.amountRaw, leg.counterparty]),
    )
    .digest('hex')
    .slice(0, 12);
  return `alert-${leg.chain}-${leg.walletAddress}-${leg.txHash}-${fingerprint}`;
}
