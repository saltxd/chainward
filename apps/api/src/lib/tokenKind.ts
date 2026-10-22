import type { Context } from 'hono';
import { decodeAbiParameters, hexToString, type Hex } from 'viem';
import { alchemyTokenCheckDeps, imitatedToken, sellerDemandRpcUrl } from '@chainward/decode';
import { getRedis } from './redis.js';
import { logger } from './logger.js';
import { budget } from '../middleware/rateLimit.js';
import { AppError } from '../middleware/errorHandler.js';

// Is the address a token? Asked before the paid rug check's 402, so nobody signs a payment
// to learn that an address is not a token. The same two reads the check starts with:
// eth_getCode (no code: not a contract) and totalSupply() (no answer: not an ERC-20). A
// contract without totalSupply() whose name or symbol passes for a well-known token still
// goes on to the 402, because the check answers it with a hold.
//
// Kept in Redis: a token for a week (it stays one), a contract that is not a token for five
// minutes, an empty address for fifteen seconds (a token can be deployed there in the next
// block). When the reads fail, or are past their cap, the request goes on to the 402: the
// paid handler refuses a non-token too, so a non-token is never charged either way.

export type TokenKind = 'token' | 'lookalike' | 'not_a_contract' | 'not_a_token';
export type NotATokenFlag = Extract<TokenKind, 'not_a_contract' | 'not_a_token'>;

const KIND_TTL_SEC: Record<TokenKind, number> = {
  token: 7 * 86_400,
  lookalike: 7 * 86_400,
  not_a_token: 300,
  not_a_contract: 15,
};
const kindKey = (token: string) => `token-kind:v1:base:${token}`;
/** Uncached addresses read before payment, for everyone: a few reads a second at most. */
const reads = budget({ max: 120, windowSec: 60, prefix: 'bud:token-kind', scope: 'global' });

const SEL = { totalSupply: '0x18160ddd', symbol: '0x95d89b41', name: '0x06fdde03' } as const;
/** The contract itself refused the call: its answer is no (the check reads it the same way). */
const EXECUTION_ERROR = /revert|invalid opcode|out of gas|stack (?:under|over)flow|EVM error/i;
const hasCode = (code: unknown) => typeof code === 'string' && code !== '0x' && code !== '0x0' && code.length > 2;

export type Rpc = (method: string, params: unknown[]) => Promise<unknown>;

async function call(rpc: Rpc, to: string, data: string): Promise<string | null> {
  try {
    const result = await rpc('eth_call', [{ to, data }, 'latest']);
    return typeof result === 'string' && result.length > 2 ? result : null;
  } catch (err) {
    if (err instanceof Error && EXECUTION_ERROR.test(err.message)) return null;
    throw err;
  }
}

/** An ABI string, or the bytes32 some older tokens return, as text. */
function text(hex: string | null): string | null {
  if (!hex) return null;
  try {
    return decodeAbiParameters([{ type: 'string' }], hex as Hex)[0];
  } catch {
    return hex.length === 66 ? hexToString(hex as Hex, { size: 32 }) : null;
  }
}

/** What the address is on Base, from the chain: two reads, four for a contract without totalSupply(). */
export async function readTokenKind(rpc: Rpc, token: string): Promise<TokenKind> {
  const [code, supply] = await Promise.all([rpc('eth_getCode', [token, 'latest']), call(rpc, token, SEL.totalSupply)]);
  if (!hasCode(code)) return 'not_a_contract';
  if (supply !== null) return 'token';
  const [symbol, name] = await Promise.all([call(rpc, token, SEL.symbol), call(rpc, token, SEL.name)]);
  return imitatedToken({ symbol: text(symbol), name: text(name), contract: token, chain: 'base' }) ? 'lookalike' : 'not_a_token';
}

/** Keeps what an address is, for as long as that can hold. */
export async function rememberKind(token: string, kind: TokenKind): Promise<void> {
  await getRedis().set(kindKey(token), kind, 'EX', KIND_TTL_SEC[kind]);
}

/** What the address is, from the cache or the chain; null when it was not read. */
async function tokenKind(c: Context, token: string): Promise<TokenKind | null> {
  const cached = await getRedis().get(kindKey(token));
  if (cached && Object.hasOwn(KIND_TTL_SEC, cached)) return cached as TokenKind;
  const rpcUrl = sellerDemandRpcUrl('base', process.env);
  if (!rpcUrl) return null;
  try {
    await reads.spend(c);
  } catch {
    return null;
  }
  const kind = await readTokenKind(alchemyTokenCheckDeps(rpcUrl).rpc, token);
  await rememberKind(token, kind);
  return kind;
}

const NOT_A_TOKEN_REASON: Record<NotATokenFlag, string> = {
  not_a_contract: 'There is no contract at this address on Base, so it is not a token.',
  not_a_token: 'This contract does not answer totalSupply(), so it is not an ERC-20 token.',
};

/** 400 NOT_A_TOKEN, with the flag the free check shows for the address and why. */
export function notATokenError(flag: NotATokenFlag, reason: string = NOT_A_TOKEN_REASON[flag]): AppError {
  return new AppError(400, 'NOT_A_TOKEN', `${reason} You were not charged.`, { flag });
}

/**
 * The paid rug check's input check, ahead of the payment middleware: 400 NOT_A_TOKEN for an
 * address that is not a token. An address it could not read goes on to the 402.
 */
export async function requireToken(c: Context, token: string): Promise<void> {
  let kind: TokenKind | null;
  try {
    kind = await tokenKind(c, token);
  } catch (err) {
    logger.warn({ err, token }, 'token kind: could not read the address, asking for payment');
    return;
  }
  if (kind === 'not_a_contract' || kind === 'not_a_token') throw notATokenError(kind);
}
