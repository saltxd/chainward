import type { QuickDecodeResultData } from './types.js';

export interface ExtractInput {
  acp_details: {
    tokenAddress?: string | null;
    symbol?: string | null;
    token24hVolume?: number | null;
    tokenFDV?: number | null;
    tokenHolderCount?: number | null;
  };
  geckoterminal: {
    data?: {
      attributes?: {
        fdv_usd?: string | null;
        volume_usd?: { h24?: string | null };
      };
    };
  } | null;
  blockscout_token_holders?: number | null;
}

export function extractTokenTrading(input: ExtractInput): QuickDecodeResultData['token_trading'] {
  const tokenAddr = input.acp_details.tokenAddress;
  if (!tokenAddr) return null;

  const symbol = input.acp_details.symbol ?? '';
  const fetched_at = new Date().toISOString();

  const gt = input.geckoterminal?.data?.attributes;
  if (gt && (gt.fdv_usd || gt.volume_usd?.h24)) {
    return {
      contract_address: tokenAddr,
      symbol,
      fdv_usd: gt.fdv_usd ? parseFloat(gt.fdv_usd) : null,
      volume_24h_usd: gt.volume_usd?.h24 ? parseFloat(gt.volume_usd.h24) : null,
      holder_count: input.blockscout_token_holders ?? null,
      source: 'geckoterminal',
      fetched_at,
    };
  }

  if (input.acp_details.token24hVolume !== undefined && input.acp_details.token24hVolume !== null) {
    return {
      contract_address: tokenAddr,
      symbol,
      fdv_usd: input.acp_details.tokenFDV ?? null,
      volume_24h_usd: input.acp_details.token24hVolume ?? null,
      holder_count: input.acp_details.tokenHolderCount ?? input.blockscout_token_holders ?? null,
      source: 'virtuals_api',
      fetched_at,
    };
  }

  return null;
}
