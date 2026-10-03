// Manual check for the BNB Chain risk path (docs/BSC.md): runs the risk-check
// worker's core path — fetchRpcFixtures → computeQuickDecodeData → deriveRiskFlags —
// against the live keyless RPC and prints what a report would contain. No Redis/DB.
//
//   pnpm --filter @chainward/indexer exec tsx scripts/verify-bsc-risk.mts 0x<address> [...]
import { fetchRpcFixtures, computeQuickDecodeData, deriveRiskFlags } from '@chainward/decode';
import { riskChainRpcs } from '@chainward/common';

const addresses = process.argv.slice(2);
const log = { warn: (o: Record<string, unknown>, m: string) => console.error('[warn]', m, JSON.stringify(o)) };

console.log('rpcs:', riskChainRpcs('bsc').map((r) => `${r.url} (chunk ${r.logChunkBlocks})`).join(', '));
for (const address of addresses) {
  const t0 = Date.now();
  const fx = await fetchRpcFixtures('bsc', address, { fetchTimeoutMs: 15_000, logger: log });
  const fetchMs = Date.now() - t0;
  const { data, meta, sources } = computeQuickDecodeData({
    input: address,
    wallet_address: address,
    job_id: `risk-bsc-${address}`,
    pipeline_version: 'verify',
    chain: 'bsc',
    fixtures: {
      ...fx,
      window: { days: fx.window.days, requested_days: fx.window.requested_days, from_block: fx.window.from_block, to_block: fx.window.to_block },
    },
  });
  const assessment = deriveRiskFlags(data);
  console.log('\n==', address, `(fetch ${fetchMs}ms)`);
  console.log('window:', JSON.stringify(fx.window));
  console.log('head/as_of_block:', meta.as_of_block.number, 'head age s:', fx.data_source.head_age_seconds);
  console.log('wallet:', JSON.stringify(data.wallet));
  console.log('balances:', JSON.stringify(data.balances), 'stables raw:', JSON.stringify(fx.stablecoin_balances));
  console.log('activity:', JSON.stringify(data.activity));
  console.log('fetch_meta:', JSON.stringify(data.fetch_meta));
  console.log('survival:', JSON.stringify(data.survival), 'usdc_pattern:', data.usdc_pattern);
  console.log('teaser-ish: tx_count', parseInt(fx.sentinel_nonce.result, 16), 'token_count', fx.token_count, 'lower_bound', fx.token_count_lower_bound);
  console.log('band:', assessment.band);
  for (const f of assessment.flags) console.log(`  flag [${f.severity}] ${f.id}: ${f.title} — ${f.evidence} (${f.source})`);
  console.log('not_assessed:');
  for (const n of assessment.not_assessed) console.log('  -', n);
  console.log('sources:', JSON.stringify(sources));
}
