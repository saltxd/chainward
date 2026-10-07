// The x402 seller board's report fields (GET /api/x402/board, built by
// packages/indexer/src/workers/x402Board.ts with @chainward/decode's seller check).

/** Payers named behind one facilitator proxy that delivered payments to the seller. */
export interface ProxiedPayers {
  proxy: string;
  name: string;
  payers_resolved: number;
  coverage_share: number;
  source: 'x402scan' | 'receipts' | null;
  receipts: { read: number; matched: number };
  payers_checked: number;
  payers_funded_by_seller: number;
}

/** e.g. "payers behind Meridian: 5, all funded by the seller". */
export function proxiedPayersLabel(p: ProxiedPayers): string {
  if (p.payers_resolved === 0) return `payers behind ${p.name} not resolved`;
  const partial = p.coverage_share < 1 ? ` (${Math.round(p.coverage_share * 100)}% of its volume)` : '';
  const head = `payers behind ${p.name}: ${p.payers_resolved}${partial}`;
  const funded = p.payers_funded_by_seller;
  if (funded === 0) return `${head}, none traced to the seller`;
  if (funded === p.payers_checked && p.payers_checked === p.payers_resolved) return `${head}, all funded by the seller`;
  return `${head}, ${funded} of ${p.payers_checked} checked funded by the seller`;
}
