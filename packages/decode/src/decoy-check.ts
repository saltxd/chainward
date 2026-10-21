// ─── The risk report's decoy step ─────────────────────────────────────────────
//
// Run by the risk-check worker after deriveRiskFlags: a planted look-alike (decoy.ts)
// gets the poisoning_decoy flag. Gated on what the decode already read, so a wallet
// that has sent a transaction or has code costs no extra read. Base only, through
// Alchemy's transfer index. The status is stored with the report (fetch_meta.decoy_check)
// so coverage and the verdict know whether the check ran. A failed read fails the check:
// a decoy's fake transfers count as activity, so a report without this step could say Pay.

import { detectDecoy, type DecoyDeps, type DecoyState } from './decoy.js';
import { loadAllowlist, withDecoyFlag, type RiskAssessment } from './risk-flags.js';
import type { DecodeChain, QuickDecodeResultData } from './types.js';

/** The parts of a decode this step reads. */
export interface DecoyReportData {
  target: Pick<QuickDecodeResultData['target'], 'wallet_address'>;
  wallet: Pick<QuickDecodeResultData['wallet'], 'nonce' | 'code_size'>;
  balances: { eth: { wei: string }; usdc: { amount: number } };
  fetch_meta: Pick<QuickDecodeResultData['fetch_meta'], 'state_unavailable'>;
}

/** ran: the detection ran (flag or not); not_applicable: a wallet that sent transactions, a contract, off Base or our own; unavailable: it could not run. */
export type DecoyCheckStatus = NonNullable<QuickDecodeResultData['fetch_meta']['decoy_check']>;

export const DECOY_NOT_ASSESSED = "Address-poisoning decoy check (needs Alchemy's Base transfer index, which this deployment does not have)";

export async function checkDecoyForReport(
  assessment: RiskAssessment,
  data: DecoyReportData,
  chain: DecodeChain,
  deps: DecoyDeps | null,
): Promise<{ assessment: RiskAssessment; status: DecoyCheckStatus }> {
  const address = data.target.wallet_address.toLowerCase();
  if (chain !== 'base') return { assessment, status: 'not_applicable' };
  // The self-flag guard deriveRiskFlags applies: ChainWard's own wallets and known infra are never flagged.
  if (loadAllowlist().has(address)) return { assessment, status: 'not_applicable' };
  const unread = new Set(data.fetch_meta.state_unavailable ?? []);
  // A nonce or code we could not read is not a zero: coverage names the failed read.
  if (unread.has('nonce') || unread.has('code')) return { assessment, status: 'unavailable' };
  if (data.wallet.nonce > 0 || data.wallet.code_size > 0) return { assessment, status: 'not_applicable' };
  if (!deps) return { assessment: { ...assessment, not_assessed: [...assessment.not_assessed, DECOY_NOT_ASSESSED] }, status: 'unavailable' };
  // The decode's balances when it read them; otherwise detectDecoy reads its own.
  const known: DecoyState | undefined =
    unread.has('eth_balance') || unread.has('usdc_balance')
      ? undefined
      : { sentTxs: 0, isWallet: true, native: Number(BigInt(data.balances.eth.wei || '0')) / 1e18, usdc: data.balances.usdc.amount };
  let decoy;
  try {
    decoy = await detectDecoy(address, chain, deps, known);
  } catch (err) {
    throw new Error(`decoy check: ${err instanceof Error ? err.message : String(err)}`);
  }
  return { assessment: withDecoyFlag(assessment, decoy, address, chain), status: 'ran' };
}
