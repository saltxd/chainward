// ─── Look-alike tokens and addresses ─────────────────────────────────────────
//
// Address-poisoning bots airdrop fake tokens whose symbols read "USDC" through
// look-alike letters from other scripts (Ethiopic ሀ, Cyrillic Ѕ and С, Lisu ꓚ,
// Cherokee Ꮯ...) and invisible characters, sent from or to addresses that share
// the first and last characters of a real counterparty. These helpers spot both.
// A skeleton is a matching key, never a display string.

import type { SellerChain } from './seller-demand.js';

/** A token passing itself off as a well-known one, and that token's real contract here (null when we do not list one). */
export interface Imitation {
  imitates: string;
  real: string | null;
}

/**
 * Well-known tokens fakes copy: symbol, the names they go by, the real contract per chain
 * (verified on chain 2026-10-21) and a dust floor: a transfer at or below it proves nothing
 * about a wallet being in use, since dust is one more way to plant a look-alike.
 */
const KNOWN: ReadonlyArray<{ symbol: string; names: readonly string[]; real: Partial<Record<SellerChain, string>>; dust: number }> = [
  { symbol: 'USDC', names: ['USD Coin'], real: { base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', bsc: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d' }, dust: 0.01 },
  { symbol: 'USDBC', names: ['USD Base Coin'], real: { base: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA' }, dust: 0.01 },
  { symbol: 'USDT', names: ['Tether USD', 'TetherUSD', 'Tether'], real: { bsc: '0x55d398326f99059fF775485246999027B3197955' }, dust: 0.01 },
  { symbol: 'DAI', names: ['Dai Stablecoin'], real: { base: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb' }, dust: 0.01 },
  { symbol: 'EURC', names: [], real: { base: '0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42' }, dust: 0.01 },
  { symbol: 'WETH', names: ['Wrapped Ether'], real: { base: '0x4200000000000000000000000000000000000006' }, dust: 0.000005 },
  { symbol: 'ETH', names: ['Ether', 'Ethereum'], real: {}, dust: 0.000005 },
  { symbol: 'CBBTC', names: ['Coinbase Wrapped BTC'], real: { base: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf' }, dust: 0.0000002 },
  { symbol: 'WBTC', names: ['Wrapped BTC'], real: {}, dust: 0.0000002 },
  { symbol: 'WBNB', names: ['Wrapped BNB'], real: { bsc: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c' }, dust: 0.00002 },
  { symbol: 'BNB', names: [], real: {}, dust: 0.00002 },
  { symbol: 'USD', names: [], real: {}, dust: 0.01 },
];

/**
 * A token whose plain-letter symbol (or name) matches one of these on another contract is
 * still a fake: Circle issues one USDC on Base (the bridged one is USDbC). Other plain
 * symbols are left alone, since real bridged USDTs and ETHs exist under many contracts.
 */
const ONE_CONTRACT: ReadonlyArray<{ symbol: string; chain: SellerChain }> = [{ symbol: 'USDC', chain: 'base' }];

/** Look-alikes from other scripts, mapped to the Latin capital they pass for (from Unicode's confusables data). */
const CONFUSABLES: Record<string, string> = {
  // Cyrillic
  А: 'A', В: 'B', С: 'C', Е: 'E', Н: 'H', І: 'I', Ј: 'J', К: 'K', М: 'M', О: 'O', Р: 'P', Ѕ: 'S', Т: 'T', Х: 'X', У: 'Y', Ү: 'Y', Ԁ: 'D', Ԛ: 'Q', Ԝ: 'W', Ь: 'B',
  а: 'A', с: 'C', е: 'E', һ: 'H', і: 'I', ј: 'J', о: 'O', р: 'P', ѕ: 'S', х: 'X', у: 'Y', ԁ: 'D', ԛ: 'Q', ԝ: 'W',
  // Greek
  Α: 'A', Β: 'B', Ε: 'E', Ζ: 'Z', Η: 'H', Ι: 'I', Κ: 'K', Μ: 'M', Ν: 'N', Ο: 'O', Ρ: 'P', Τ: 'T', Υ: 'Y', Χ: 'X', Ϲ: 'C', ϲ: 'C', ο: 'O', ρ: 'P', ν: 'V',
  // Armenian
  Ս: 'U', Տ: 'S', Օ: 'O', ս: 'U', օ: 'O',
  // Ethiopic
  ሀ: 'U', ዐ: 'O',
  // Canadian syllabics
  ᐯ: 'V', ᑌ: 'U', ᑎ: 'N', ᑕ: 'C', ᑭ: 'P', ᒪ: 'L', ᔕ: 'S', ᕼ: 'H', ᖇ: 'R', ᗞ: 'D', ᗩ: 'A', ᗯ: 'W', ᗰ: 'M', ᗷ: 'B',
  // Cherokee
  Ꭰ: 'D', Ꭱ: 'R', Ꭲ: 'T', Ꭺ: 'A', Ꭼ: 'E', Ꮃ: 'W', Ꮇ: 'M', Ꮋ: 'H', Ꮓ: 'Z', Ꮢ: 'R', Ꮥ: 'S', Ꮪ: 'S', Ꮯ: 'C', Ꮲ: 'P', Ꮶ: 'K', Ᏼ: 'B',
  // Lisu
  ꓐ: 'B', ꓑ: 'P', ꓓ: 'D', ꓔ: 'T', ꓖ: 'G', ꓗ: 'K', ꓙ: 'J', ꓚ: 'C', ꓜ: 'Z', ꓝ: 'F', ꓟ: 'M', ꓠ: 'N', ꓡ: 'L', ꓢ: 'S', ꓣ: 'R', ꓦ: 'V', ꓧ: 'H', ꓪ: 'W', ꓫ: 'X', ꓬ: 'Y', ꓮ: 'A', ꓰ: 'E', ꓲ: 'I', ꓳ: 'O', ꓴ: 'U',
  // Latin small capitals and Coptic
  ᴀ: 'A', ʙ: 'B', ᴄ: 'C', ᴅ: 'D', ᴇ: 'E', ʜ: 'H', ᴋ: 'K', ᴍ: 'M', ɴ: 'N', ᴏ: 'O', ᴘ: 'P', ꜱ: 'S', ᴛ: 'T', ᴜ: 'U', ᴠ: 'V', ᴡ: 'W', ʏ: 'Y', ᴢ: 'Z', Ⲥ: 'C', Ⲟ: 'O',
};

// Invisible and layout characters: format controls (zero-width, joiners, direction
// overrides, word joiners), combining marks once decomposed, Hangul fillers, the braille
// blank and any whitespace. None of them changes what a reader sees as the token's name.
const INVISIBLE = /[\p{Cf}\p{Mn}\p{Me}ᅟᅠㅤﾠ⠀\s]/gu;

const mapConfusables = (s: string) => Array.from(s, (ch) => CONFUSABLES[ch] ?? ch).join('');

/**
 * The matching key a reader's eye sees: look-alikes mapped to Latin, compatibility-folded,
 * invisibles stripped, uppercase. Look-alikes are mapped before folding too, because NFKD
 * turns some of them into letters that look like nothing (the lunate sigma Ϲ becomes Σ),
 * and again after uppercasing, so a lowercase look-alike (Greek τ) meets its capital.
 */
export function symbolSkeleton(s: string): string {
  return mapConfusables(mapConfusables(s).normalize('NFKD').replace(INVISIBLE, '').toUpperCase());
}

const plainLetters = (s: string) => /^[\x20-\x7e]+$/.test(s);
/** Any space separator (no-break, narrow, thin) as a plain space: spacing is not a disguise. */
const flatSpaces = (s: string) => s.replace(/\p{Zs}/gu, ' ').trim();
const lower = (a: string | null | undefined) => (a ?? '').toLowerCase();

function knownFor(skeleton: string) {
  return KNOWN.find((k) => k.symbol === skeleton || k.names.some((n) => symbolSkeleton(n) === skeleton));
}

/**
 * The well-known token this one passes itself off as, or null. A symbol or name that
 * reads as a known token through look-alike or invisible characters is a fake wherever
 * it lives; a plain-letter one is a fake only where the real token has one contract
 * (USDC on Base) and this is not it. The real contract itself never matches.
 */
export function imitatedToken(t: { symbol?: string | null; name?: string | null; contract: string | null | undefined; chain: SellerChain }): Imitation | null {
  for (const raw of [t.symbol, t.name]) {
    if (!raw) continue;
    const known = knownFor(symbolSkeleton(raw));
    if (!known) continue;
    const real = known.real[t.chain] ?? null;
    if (real && lower(real) === lower(t.contract)) return null;
    const flat = flatSpaces(raw);
    const disguised = !plainLetters(flat) || flat !== flat.normalize('NFKC');
    const oneContract = ONE_CONTRACT.some((o) => o.symbol === known.symbol && o.chain === t.chain);
    if (disguised || (oneContract && real)) return { imitates: known.symbol, real };
  }
  return null;
}

/** The listed real token at this contract on this chain, with its dust floor; null for anything else. */
export function realToken(contract: string | null | undefined, chain: SellerChain): { symbol: string; dust: number } | null {
  const c = lower(contract);
  if (!c) return null;
  const known = KNOWN.find((k) => lower(k.real[chain]) === c);
  return known ? { symbol: known.symbol, dust: known.dust } : null;
}

/**
 * Two different addresses sharing their first and last 4 hex characters: what
 * wallets show of an address, and what poisoning bots grind look-alikes to match.
 */
export function sharesEnds(a: string, b: string): boolean {
  const x = lower(a).replace(/^0x/, '');
  const y = lower(b).replace(/^0x/, '');
  return x.length === 40 && y.length === 40 && x !== y && x.slice(0, 4) === y.slice(0, 4) && x.slice(-4) === y.slice(-4);
}
