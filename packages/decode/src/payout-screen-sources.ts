// ─── Payout screen: live sources ──────────────────────────────────────────────
//
// First fundings, with their transactions, from Alchemy's transfer index
// (alchemy_getAssetTransfers, oldest first); hubs and contracts decided exactly
// as the hire check's funding graph decides them (hire-sources.ts).

import { chainFundingGraph, type FundingGraphOptions } from './hire-sources.js';
import type { ScreenFundingSource } from './payout-screen.js';
import { SELLER_STABLECOINS, alchemyFirstFunderSource, type SellerChain } from './seller-demand.js';

export function payoutScreenSource(opts: FundingGraphOptions & { chain: SellerChain }): ScreenFundingSource {
  const graph = chainFundingGraph(opts);
  return {
    firstFunding: alchemyFirstFunderSource(opts.alchemyUrl, SELLER_STABLECOINS[opts.chain], opts.log),
    isHub: graph.isHub,
    isContract: graph.isContract,
  };
}
