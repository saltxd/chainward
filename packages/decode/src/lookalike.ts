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

/**
 * Every character Unicode lists as confusable with one of the Latin letters the KNOWN symbols and
 * names use, by that letter. Derived from Unicode's confusables.txt (UTS #39), version 18.0.0,
 * 2026-08-06: each non-ASCII source whose prototype is one Latin letter. Left out: ASCII sources (I,
 * l, 0 and 1 are real characters in real symbols, USD1 among them), prototypes longer than one
 * letter (₮ is T plus an overlay, so Tether's own USD₮ stays USD₮), and characters NFKD already
 * folds into that letter (fullwidth, circled, mathematical Latin). The I/l class, whose prototype is
 * l, reads as I in an uppercase skeleton.
 */
const UNICODE_CONFUSABLES: Record<string, string> = {
  A: '\u0251\u0391\u03B1\u0410\u0430\u13AA\u15C5\u237A\uA4EE\uAB64\u{102A0}\u{16F40}\u{1D6A8}\u{1D6C2}\u{1D6E2}\u{1D6FC}\u{1D71C}\u{1D736}\u{1D756}\u{1D770}\u{1D790}\u{1D7AA}\u{1DF5A}\u{1DF6A}',
  B: '\u0184\u0392\u0412\u042C\u07D5\u13CF\u13F4\u1472\u15AF\u15F7\u2C82\uA4D0\uA557\uA7B4\u{10282}\u{102A1}\u{10301}\u{1031C}\u{16EB6}\u{1D207}\u{1D6A9}\u{1D6E3}\u{1D71D}\u{1D757}\u{1D791}',
  C: '\u03F2\u03F9\u0421\u0441\u1004\u105A\u13DF\u1C83\u1D04\u2CA4\u2CA5\uA4DA\uABAF\u{102A2}\u{10302}\u{10415}\u{1043D}\u{1051B}\u{118E9}\u{118F2}\u{1D134}\u{1F74C}',
  D: '\u0501\u13A0\u13E7\u146F\u15DE\u15EA\uA4D2\uA4D3\u{1018B}',
  E: '\u0395\u0415\u0435\u04BD\u13AC\u212E\u22FF\u2D39\uA4F0\uA5CB\uAB32\u{10286}\u{118A6}\u{118AE}\u{1D6AC}\u{1D6E6}\u{1D720}\u{1D75A}\u{1D794}\u{1DF81}',
  H: '\u0397\u041D\u04BA\u04BB\u0570\u10B9\u13BB\u13C2\u157C\u2C8E\uA4E7\u{102CF}\u{1D6AE}\u{1D6E8}\u{1D722}\u{1D75C}\u{1D796}',
  I:
    '\u00A1\u0196\u01C0\u0269\u026A\u0399\u03B9\u0406\u0456\u04C0\u04CF\u0582\u05C0\u05D5\u05DF\u0627\u0661\u06F1\u07CA\u0964\u104A\u13A5\u16C1\u16D0\u2113\u217C\u21BF\u2223\u2373\u23FD\u2502\u2503' +
    '\u2C92\u2C93\u2D4A\u2D4F\uA4F2\uA56F\uA647\uA781\uA7AE\uA7FE\uA830\uA8CE\uAA5D\uAB75\uFE31\uFE8D\uFE8E\uFF11\uFF4C\uFF5C\uFFE8\u{1028A}\u{10309}\u{10320}\u{1050E}\u{10926}\u{10C3E}\u{10CA5}\u{10CFA}\u{11047}\u{110C0}\u{11141}' +
    '\u{111C5}\u{113D4}\u{1144B}\u{115C5}\u{11641}\u{118C3}\u{11C41}\u{11DDA}\u{11DE1}\u{16D63}\u{16EAA}\u{16F28}\u{1CCF1}\u{1D100}\u{1D377}\u{1D425}\u{1D459}\u{1D48D}\u{1D4C1}\u{1D4F5}\u{1D529}\u{1D55D}\u{1D591}\u{1D5C5}\u{1D5F9}\u{1D62D}\u{1D661}\u{1D695}\u{1D6B0}\u{1D6CA}\u{1D6EA}\u{1D704}' +
    '\u{1D724}\u{1D73E}\u{1D75E}\u{1D778}\u{1D798}\u{1D7B2}\u{1D7CF}\u{1D7D9}\u{1D7E3}\u{1D7ED}\u{1D7F7}\u{1E141}\u{1E8C7}\u{1ED01}\u{1EE00}\u{1EE80}\u{1FBF1}',
  L: '\u13DE\u14AA\u2CD0\uA4E1\u{1041B}\u{10526}\u{118A3}\u{118B2}\u{16F16}\u{1D22A}',
  M: '\u039C\u03FA\u041C\u13B7\u15F0\u16D6\u2C98\uA4DF\u{102B0}\u{10311}\u{10C21}\u{1D6B3}\u{1D6ED}\u{1D727}\u{1D761}\u{1D79B}',
  N: '\u039D\u0578\u057C\u2C9A\uA4E0\u{10513}\u{11ABE}\u{1D6B4}\u{1D6EE}\u{1D728}\u{1D762}\u{1D79C}',
  O:
    '\u039F\u03BF\u03C3\u03ED\u041E\u043E\u0555\u0585\u05E1\u0647\u0665\u06BE\u06C1\u06D5\u06F5\u07C0\u07CB\u0840\u0966\u09E6\u0A66\u0AE6\u0B20\u0B66\u0BE6\u0C02\u0C66\u0C82\u0CE6\u0D02\u0D20\u0D66' +
    '\u0D82\u0E50\u0ED0\u101D\u1040\u10FF\u110B\u11BC\u12D0\u17E0\u1A45\u1A80\u1A90\u1BEA\u1C82\u1CBF\u1D0F\u1D11\u2C9E\u2C9F\u2D54\u3007\u3147\uA4F3\uAB3D\uFBA6\uFBA7\uFBA8\uFBA9\uFBAA\uFBAB\uFBAC' +
    '\uFBAD\uFEE9\uFEEA\uFEEB\uFEEC\uFF10\uFFB7\u{10292}\u{102AB}\u{1030F}\u{10404}\u{1042C}\u{104C2}\u{104EA}\u{10516}\u{1092C}\u{10C17}\u{10D07}\u{11124}\u{11302}\u{114D0}\u{118B5}\u{118C8}\u{118D7}\u{118E0}\u{11DE0}\u{16AE9}\u{1CCF0}\u{1D6B6}\u{1D6D0}\u{1D6D4}\u{1D6F0}' +
    '\u{1D70A}\u{1D70E}\u{1D72A}\u{1D744}\u{1D748}\u{1D764}\u{1D77E}\u{1D782}\u{1D79E}\u{1D7B8}\u{1D7BC}\u{1D7CE}\u{1D7D8}\u{1D7E2}\u{1D7EC}\u{1D7F6}\u{1E140}\u{1E2F0}\u{1EE24}\u{1EE84}\u{1FBF0}',
  P: '\u00FE\u01BF\u03A1\u03C1\u03F1\u03F8\u0420\u0440\u13E2\u146D\u2374\u2CA2\u2CA3\u2CCE\u2CCF\uA4D1\u{10295}\u{1D6B8}\u{1D6D2}\u{1D6E0}\u{1D6F2}\u{1D70C}\u{1D71A}\u{1D72C}\u{1D746}\u{1D754}\u{1D766}\u{1D780}\u{1D78E}\u{1D7A0}\u{1D7BA}\u{1D7C8}',
  R: '\u01A6\u024C\u0433\u13A1\u13D2\u1587\u1D26\u2C85\uA4E3\uAB47\uAB48\uAB81\u{104B4}\u{16A19}\u{16F35}\u{1D216}',
  S: '\u01BD\u0405\u0455\u054F\u0D1F\u10BD\u10FD\u13D5\u13DA\u1CBD\uA4E2\uA576\uA731\uABAA\u{10296}\u{10420}\u{10448}\u{118C1}\u{16AD6}\u{16F3A}',
  T: '\u03A4\u0422\u07E0\u13A2\u22A4\u27D9\u2CA6\u3112\u4E05\uA4D4\uA50B\u{10297}\u{102B1}\u{10315}\u{118BC}\u{16F0A}\u{1D373}\u{1D6BB}\u{1D6F5}\u{1D72F}\u{1D769}\u{1D7A3}\u{1F768}',
  U: '\u028B\u03C5\u054D\u057D\u1200\u144C\u1D1C\u222A\u22C3\uA4F4\uA79F\uAB4E\uAB52\u{104CE}\u{104F6}\u{118B8}\u{118D8}\u{16F42}\u{1D6D6}\u{1D710}\u{1D74A}\u{1D784}\u{1D7BE}',
  W: '\u026F\u0448\u0461\u051C\u051D\u0561\u13B3\u13D4\u1D21\u29E2\u2CBD\uA4EA\uA7FA\uAB83\uABA4\u{1170A}\u{1170E}\u{1170F}\u{118E6}\u{118EF}\u{1D20C}\u{1DF7D}',
};

/** Look-alikes from other scripts, mapped to the Latin capital they pass for: Unicode's table, then the hand-picked ones seen in fakes. */
const CONFUSABLES: Record<string, string> = {
  ...Object.fromEntries(Object.entries(UNICODE_CONFUSABLES).flatMap(([letter, chars]) => Array.from(chars, (ch) => [ch, letter]))),
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

/** The chain's native coin (ETH on Base, BNB on BNB Chain) with its dust floor: what an imitation ETH copies. */
export function nativeToken(chain: SellerChain): { symbol: string; dust: number } {
  const symbol = chain === 'bsc' ? 'BNB' : 'ETH';
  return { symbol, dust: KNOWN.find((k) => k.symbol === symbol)!.dust };
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
