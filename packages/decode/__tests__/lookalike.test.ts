import { describe, expect, it } from 'vitest';
import { imitatedToken, realToken, sharesEnds, symbolSkeleton } from '../src/lookalike.js';

// Fake "USDC" symbols that address-poisoning bots airdropped on Base in October 2026,
// exactly as symbol() returns them (Would Pay Again's payout wallet history, Oct 5-21).
const FAKE_USDC = {
  ethiopicCyrillic: 'ሀ‌‍Ѕ​‌D​​С', // 0x72846b6b…, Oct 21
  lisu: 'U⁯S⁯Dꓚ', // 0x4a161230… and four more contracts, Oct 5-19
  syllabicsCherokee: 'ᑌ‌‍S‌​ᗞ‍Ꮯ', // 0xf9eed0a2…, Oct 16
  ethiopicGreek: 'ሀ‍‌S​ᗞ​Ϲ', // 0x157c99a8…, Oct 14
};
// A launch-mill token on Base (0x06cbcba1…): its symbol spells "TetherUSD" in Cyrillic and Armenian.
const FAKE_TETHER_SYMBOL = 'ТеthеrՍՏD ​‌​‍​';
const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_BSC = '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d';
const USDT_BSC = '0x55d398326f99059fF775485246999027B3197955';
const FAKE_CONTRACT = '0x72846b6b37ee99e88e1cfb0acd490ed766d91a00';

describe('symbolSkeleton', () => {
  it('reads every fake USDC seen in October as USDC', () => {
    for (const s of Object.values(FAKE_USDC)) expect(symbolSkeleton(s)).toBe('USDC');
  });

  it('uppercases ordinary symbols and leaves their letters alone', () => {
    expect(symbolSkeleton('USDC')).toBe('USDC');
    expect(symbolSkeleton('USDbC')).toBe('USDBC');
    expect(symbolSkeleton('cbBTC')).toBe('CBBTC');
  });

  it('folds fullwidth letters, accents, spaces and direction overrides', () => {
    expect(symbolSkeleton('ＵＳＤＣ')).toBe('USDC');
    expect(symbolSkeleton('ÚSDC')).toBe('USDC');
    expect(symbolSkeleton('‮USD Coin')).toBe('USDCOIN');
  });
});

describe('symbolSkeleton look-alike table (review fixes)', () => {
  it('maps lowercase look-alikes after uppercasing, so a Greek tau reads as T', () => {
    expect(symbolSkeleton('USDτ')).toBe('USDT');
  });

  it('reads Cherokee Ꮢ as R and Ꮥ as S', () => {
    expect(symbolSkeleton('ᑌᏕDᏟ')).toBe('USDC');
    expect(symbolSkeleton('Ꮢ')).toBe('R');
  });
});

describe('imitatedToken', () => {
  it('names USDC and the real contract for each fake spelling', () => {
    for (const s of Object.values(FAKE_USDC)) expect(imitatedToken({ symbol: s, contract: FAKE_CONTRACT, chain: 'base' })).toEqual({ imitates: 'USDC', real: USDC_BASE });
  });

  it('does not flag the real USDC, in any letter case of its address', () => {
    expect(imitatedToken({ symbol: 'USDC', name: 'USD Coin', contract: USDC_BASE.toLowerCase(), chain: 'base' })).toBeNull();
    expect(imitatedToken({ symbol: 'USDC', name: 'USD Coin', contract: USDC_BSC, chain: 'bsc' })).toBeNull();
  });

  it('flags a plain USDC or USD Coin on another contract on Base, where Circle has one USDC', () => {
    expect(imitatedToken({ symbol: 'USDC', contract: FAKE_CONTRACT, chain: 'base' })).toEqual({ imitates: 'USDC', real: USDC_BASE });
    expect(imitatedToken({ symbol: 'USDCoin', name: 'USD Coin', contract: FAKE_CONTRACT, chain: 'base' })).toEqual({ imitates: 'USDC', real: USDC_BASE });
  });

  it('leaves tokens with their own symbols alone: bridged, wrapped and prefixed USDC', () => {
    expect(imitatedToken({ symbol: 'USDbC', name: 'USD Base Coin', contract: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', chain: 'base' })).toBeNull();
    expect(imitatedToken({ symbol: 'USDC.e', contract: FAKE_CONTRACT, chain: 'base' })).toBeNull();
    expect(imitatedToken({ symbol: 'axlUSDC', contract: FAKE_CONTRACT, chain: 'base' })).toBeNull();
  });

  it('flags look-alike spellings of other well-known tokens, with the real contract only where it is known', () => {
    expect(imitatedToken({ symbol: 'U​SDT', contract: FAKE_CONTRACT, chain: 'base' })).toEqual({ imitates: 'USDT', real: null });
    expect(imitatedToken({ symbol: 'U​SDT', contract: FAKE_CONTRACT, chain: 'bsc' })).toEqual({ imitates: 'USDT', real: USDT_BSC });
    expect(imitatedToken({ symbol: 'ЕΤН', contract: FAKE_CONTRACT, chain: 'base' })).toEqual({ imitates: 'ETH', real: null });
    expect(imitatedToken({ symbol: FAKE_TETHER_SYMBOL, contract: '0x06cbcba122a967a62c3e013423f3f34456b62b07', chain: 'base' })).toEqual({ imitates: 'USDT', real: null });
  });

  it('does not flag a plain-letter USDT or ETH, which several real bridged tokens use', () => {
    expect(imitatedToken({ symbol: 'USDT', name: 'Tether USD', contract: FAKE_CONTRACT, chain: 'base' })).toBeNull();
    expect(imitatedToken({ symbol: 'ETH', contract: FAKE_CONTRACT, chain: 'bsc' })).toBeNull();
  });

  it('does not treat a no-break space in a plain name as a disguise', () => {
    expect(imitatedToken({ name: 'Tether\u00a0USD', symbol: 'USDT', contract: FAKE_CONTRACT, chain: 'bsc' })).toBeNull();
  });

  it('knows USDbC as a real Base token, so a look-alike of it is a fake', () => {
    expect(imitatedToken({ symbol: 'USDbC', contract: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA', chain: 'base' })).toBeNull();
    expect(imitatedToken({ symbol: 'USDЬC', contract: FAKE_CONTRACT, chain: 'base' })?.imitates).toBe('USDBC');
  });

  it('answers null without a symbol or name', () => {
    expect(imitatedToken({ symbol: null, name: null, contract: FAKE_CONTRACT, chain: 'base' })).toBeNull();
    expect(imitatedToken({ symbol: '', contract: FAKE_CONTRACT, chain: 'base' })).toBeNull();
  });
});

// A QA run over 34 tokens launched on Base on 2026-10-21 found a USDT spelled with N'Ko and
// Armenian letters (0x6da26e91…) that the hand-picked table missed: the table now carries every
// look-alike Unicode's confusables.txt lists for the letters these symbols and names use.
describe("imitatedToken: look-alikes from Unicode's confusables table", () => {
  const C4 = '0x6da26e91cd05277924b4b8458246d18439382b07';

  it("reads N'Ko Na Woloso as T, so ՍՏDߠ and ߠеthеr USD are a USDT imitation", () => {
    expect(symbolSkeleton('ՍՏDߠ')).toBe('USDT');
    expect(imitatedToken({ symbol: 'ՍՏDߠ', name: 'ߠеthеr USD', contract: C4, chain: 'base' })).toEqual({ imitates: 'USDT', real: null });
    expect(imitatedToken({ name: 'ߠеthеr USD', contract: C4, chain: 'base' })).toEqual({ imitates: 'USDT', real: null });
  });

  it('catches look-alikes from scripts the hand-picked table never listed', () => {
    expect(symbolSkeleton('ᎠΑΙ')).toBe('DAI'); // Cherokee Da, Greek Alpha and Iota
    expect(imitatedToken({ symbol: 'ѡΕΤН', contract: FAKE_CONTRACT, chain: 'base' })?.imitates).toBe('WETH'); // Cyrillic omega as W
  });

  // Real tokens spell these with their own characters: Tether's USD₮ and USD₮0, Overnight's USD+,
  // World Liberty's USD1, the bridged and wrapped USDCs, and the plain-letter majors.
  it.each(['USD₮', 'USD₮0', 'USD+', 'USD1', 'USDbC', 'USDC.e', 'axlUSDC', 'USDT', 'ETH', 'WETH', 'DAI', 'cbBTC'])('leaves %s alone', (symbol) => {
    expect(imitatedToken({ symbol, contract: FAKE_CONTRACT, chain: 'base' })).toBeNull();
  });
});

describe('sharesEnds', () => {
  it('matches a look-alike sharing the first 4 and last 4 hex characters, in any case', () => {
    expect(sharesEnds('0xf7eea0bae744497d7e7dcf93c7bc4a46b61667cd', '0xf7ee65130fb2b3bb42cc5cbfed085d7d482667cd')).toBe(true);
    expect(sharesEnds('0x2284822677fb1adb234f97e6d807d7b59db94bfb', '0x228440F8D5DF8B2E29C37255B291599060894BFB')).toBe(true);
  });

  it('does not match an address with itself, or one with different ends', () => {
    expect(sharesEnds('0xf7ee65130fb2b3bb42cc5cbfed085d7d482667cd', '0xF7EE65130FB2B3BB42CC5CBFED085D7D482667CD')).toBe(false);
    expect(sharesEnds('0xf7ee65130fb2b3bb42cc5cbfed085d7d482667cd', '0xf7ee00000fb2b3bb42cc5cbfed085d7d482667cd')).toBe(true);
    expect(sharesEnds('0xf7ee65130fb2b3bb42cc5cbfed085d7d482667cd', '0xf7ef65130fb2b3bb42cc5cbfed085d7d482667cd')).toBe(false);
    expect(sharesEnds('0xf7ee65130fb2b3bb42cc5cbfed085d7d482667cd', '0xf7e065130fb2b3bb42cc5cbfed085d7d482667cd')).toBe(false);
    expect(sharesEnds('0xf7ee65130fb2b3bb42cc5cbfed085d7d482667cd', '0xf7ee65130fb2b3bb42cc5cbfed085d7d482667ce')).toBe(false);
  });
});

describe('realToken', () => {
  it('names the real listed token at a contract, with the dust floor below which a transfer proves nothing', () => {
    expect(realToken('0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', 'base')).toEqual({ symbol: 'USDC', dust: 0.01 });
    expect(realToken('0x4200000000000000000000000000000000000006', 'base')).toEqual({ symbol: 'WETH', dust: 0.000005 });
    expect(realToken(FAKE_CONTRACT, 'base')).toBeNull();
    expect(realToken(null, 'base')).toBeNull();
  });
});
