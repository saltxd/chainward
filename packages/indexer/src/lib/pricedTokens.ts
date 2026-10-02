import { TRACKED_TOKENS } from '@chainward/common';

/**
 * Base token contracts we price, by lowercase address → price symbol.
 *
 * Transfers must be priced by contract address, never by the token's own
 * symbol(): anyone can deploy a token named "USDC" or "WETH" and send it to a
 * monitored wallet, which used to value it as the real thing (USD amounts,
 * large-transfer alerts, observatory volume). Unknown contracts stay unpriced.
 */
const PRICED_TOKEN_ADDRESSES = new Map<string, string>([
  ...TRACKED_TOKENS.base.map((t) => [t.address.toLowerCase(), t.symbol.toUpperCase()] as [string, string]),
  ['0xfde4c96c8593536e31f229ea8f37b2ada2699bb2', 'USDT'],
  ['0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca', 'USDC'], // USDbC (bridged USDC)
  ['0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b', 'VIRTUAL'],
]);

/** Price symbol for a Base token contract, or null if it isn't one we price. */
export function pricedSymbolForToken(tokenAddress: string): string | null {
  return PRICED_TOKEN_ADDRESSES.get(tokenAddress.toLowerCase()) ?? null;
}
