// ─── The risk report's decoy step ─────────────────────────────────────────────
//
// Run by the risk-check worker after deriveRiskFlags: a planted look-alike (decoy.ts)
// gets the poisoning_decoy flag. Gated on what the decode already read, so a wallet
// that has sent a transaction or has code costs no extra read. Base only, through
// Alchemy's transfer index. A failed read adds no flag and is named in not_assessed.

import { detectDecoy, type DecoyDeps, type DecoyState } from './decoy.js';
import { withDecoyFlag, type RiskAssessment } from './risk-flags.js';
import type { DecodeChain, QuickDecodeResultData } from './types.js';

/** The parts of a decode this step reads. */
export interface DecoyReportData {
  target: Pick<QuickDecodeResultData['target'], 'wallet_address'>;
  wallet: Pick<QuickDecodeResultData['wallet'], 'nonce' | 'code_size'>;
  balances: { eth: { wei: string }; usdc: { amount: number } };
  fetch_meta: Pick<QuickDecodeResultData['fetch_meta'], 'state_unavailable'>;
}

export const DECOY_NOT_ASSESSED = "Address-poisoning decoy check (Alchemy's Base transfer index did not answer)";

export async function checkDecoyForReport(
  assessment: RiskAssessment,
  data: DecoyReportData,
  chain: DecodeChain,
  deps: DecoyDeps | null,
): Promise<RiskAssessment> {
  if (chain !== 'base' || !deps) return assessment;
  const unread = new Set(data.fetch_meta.state_unavailable ?? []);
  // A nonce or code we could not read is not a zero: no gate, no read.
  if (unread.has('nonce') || unread.has('code')) return assessment;
  if (data.wallet.nonce > 0 || data.wallet.code_size > 0) return assessment;
  // The decode's balances when it read them; otherwise detectDecoy reads its own.
  const known: DecoyState | undefined =
    unread.has('eth_balance') || unread.has('usdc_balance')
      ? undefined
      : { sentTxs: 0, isWallet: true, native: Number(BigInt(data.balances.eth.wei || '0')) / 1e18, usdc: data.balances.usdc.amount };
  try {
    const decoy = await detectDecoy(data.target.wallet_address, chain, deps, known);
    return withDecoyFlag(assessment, decoy, data.target.wallet_address, chain);
  } catch {
    return { ...assessment, not_assessed: [...assessment.not_assessed, DECOY_NOT_ASSESSED] };
  }
}
