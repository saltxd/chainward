import type { Context, MiddlewareHandler } from 'hono';
import { RISK_CHAIN_IDS, isPlaceholderAddress, type RiskChainId } from '@chainward/common';
import type { HireAgentInput } from '@chainward/decode';
import { AppError } from '../middleware/errorHandler.js';

// Input rules for the paid x402 routes. The route handlers parse with these, and
// app.ts runs the same parse before the payment middleware, so a request that can
// only fail is refused with 400 instead of a 402 the client would sign.

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const AGENT_ID_RE = /^\d{1,12}$/;
const SELLER_CHAINS = ['base', 'bsc'] as const;
type SellerChain = (typeof SELLER_CHAINS)[number];

function parseAddress(raw: string | undefined): string {
  if (!raw || !ADDRESS_RE.test(raw)) throw new AppError(400, 'INVALID_TARGET', 'Invalid wallet address format');
  return raw.toLowerCase();
}

/** GET /api/risk/x402: the address to check, on base (default) or bsc. */
export function parseCounterpartyInput(
  rawAddress: string | undefined,
  rawChain: string | undefined,
): { address: string; chain: RiskChainId } {
  const address = parseAddress(rawAddress);
  if (isPlaceholderAddress(address)) {
    throw new AppError(400, 'INVALID_TARGET', 'That is a placeholder address (0x000…), not a wallet to check');
  }
  const chain = rawChain ?? 'base';
  if (!(RISK_CHAIN_IDS as readonly string[]).includes(chain)) {
    throw new AppError(400, 'INVALID_CHAIN', `chain must be one of: ${RISK_CHAIN_IDS.join(', ')}`);
  }
  return { address, chain: chain as RiskChainId };
}

/** GET /api/risk/seller-demand: the seller's payTo, on base (default) or bsc. */
export function parseSellerInput(
  rawAddress: string | undefined,
  rawChain: string | undefined,
): { address: string; chain: SellerChain } {
  const address = parseAddress(rawAddress);
  const chain = rawChain ?? 'base';
  if (!(SELLER_CHAINS as readonly string[]).includes(chain)) {
    throw new AppError(400, 'INVALID_TARGET', 'chain must be base or bsc');
  }
  return { address, chain: chain as SellerChain };
}

/** GET /api/risk/hires: an ERC-8004 agent id or owner address, BNB Chain only. */
export function parseHireInput(rawAgent: string | undefined, rawChain: string | undefined): HireAgentInput {
  const chain = rawChain || 'bsc';
  if (chain === 'base') throw new AppError(400, 'INVALID_CHAIN', 'hire check is BNB Chain only for now');
  if (chain !== 'bsc') throw new AppError(400, 'INVALID_CHAIN', 'chain must be bsc');
  const agent = (rawAgent ?? '').trim();
  if (AGENT_ID_RE.test(agent)) return { kind: 'id', id: Number(agent) };
  if (ADDRESS_RE.test(agent)) return { kind: 'owner', address: agent.toLowerCase() };
  throw new AppError(400, 'INVALID_TARGET', 'agent must be an ERC-8004 agent id or a 0x owner address');
}

/** Runs a route's input parse before the payment middleware; a bad request throws its 4xx here. */
export function checkPaidInput(parse: (c: Context) => unknown): MiddlewareHandler {
  return async (c, next) => {
    await parse(c);
    await next();
  };
}
