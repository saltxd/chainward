-- Token transfers used to be priced by the token's own symbol(), so lookalike
-- contracts named "WETH", "ETH", "USDC", "VIRTUAL" or "AERO" were valued as the
-- real tokens (one fake "Wrapped Ether" transfer alone was booked at $24,551.90).
-- The indexer now prices by contract address (packages/indexer/src/lib/pricedTokens.ts).
-- Clear the USD value of every token transfer that isn't one of those contracts.
-- Idempotent: rows already NULL are untouched.
UPDATE transactions
SET amount_usd = NULL
WHERE token_address IS NOT NULL
  AND amount_usd IS NOT NULL
  AND lower(token_address) NOT IN (
    '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', -- USDC
    '0x4200000000000000000000000000000000000006', -- WETH
    '0x50c5725949a6f0c72e6c4a641f24049a917db0cb', -- DAI
    '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf', -- cbBTC
    '0x940181a94a35a4569e4529a3cdfb74e38fd98631', -- AERO
    '0xc1cba3fcea344f92d9239c08c0568f6f2f0ee452', -- wstETH
    '0xfde4c96c8593536e31f229ea8f37b2ada2699bb2', -- USDT
    '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca', -- USDbC
    '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b'  -- VIRTUAL
  );
