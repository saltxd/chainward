// Runs the full decode pipeline against a real target wallet, with all data
// sources live (sentinel, Blockscout, ACP API, GeckoTerminal). Identical to
// what the deployed agent does on `job.funded` — minus the ACP socket layer.
//
// Usage:
//   pnpm --filter @chainward/acp-decoder simulate -- 0x47296c5760e27813e41d8c09e1f7464c70cc1f5d
//   pnpm --filter @chainward/acp-decoder simulate -- @axelrodAI
//
// Prints the full QuickDecodeResult JSON envelope to stdout and the markdown
// report to stderr (so JSON can be piped without noise).

import { quickDecode } from '@chainward/decode';
import { fetchFixtures } from '../src/data-fetch.js';

async function resolveHandle(handle: string): Promise<string | null> {
  const resp = await fetch(
    `https://acpx.virtuals.io/api/agents?filters[twitterHandle][$eqi]=${encodeURIComponent(handle)}&pagination[pageSize]=1`,
    { signal: AbortSignal.timeout(8000), headers: { 'User-Agent': 'Mozilla/5.0' } },
  );
  if (!resp.ok) return null;
  const body: any = await resp.json();
  const agent = body?.data?.[0];
  return agent?.walletAddress ?? agent?.wallet_address ?? null;
}

async function main() {
  const targetArg = process.argv[2];
  if (!targetArg) {
    console.error('Usage: simulate-decode.ts <0xADDRESS|@handle>');
    process.exit(1);
  }

  let walletAddress: string;
  let agentHandle: string | undefined;

  if (targetArg.startsWith('@')) {
    const handle = targetArg.slice(1);
    agentHandle = handle;
    const resolved = await resolveHandle(handle);
    if (!resolved) {
      console.error(`Could not resolve @${handle} via ACP API`);
      process.exit(1);
    }
    walletAddress = resolved;
    console.error(`@${handle} → ${walletAddress}`);
  } else {
    walletAddress = targetArg;
  }

  const sentinelRpc = process.env.SENTINEL_RPC ?? 'https://mainnet.base.org';
  const fetchTimeoutMs = parseInt(process.env.FETCH_TIMEOUT_MS ?? '8000', 10);

  console.error(`fetching fixtures from ${sentinelRpc}…`);
  const t0 = Date.now();
  const fixtures = await fetchFixtures(walletAddress, {
    sentinelRpc,
    fetchTimeoutMs,
    agentName: agentHandle ? `@${agentHandle}` : undefined,
  });
  console.error(`fixtures fetched in ${Date.now() - t0}ms`);

  console.error('running quickDecode…');
  const t1 = Date.now();
  const result = await quickDecode({
    input: targetArg,
    wallet_address: walletAddress,
    job_id: 'sim-' + Date.now(),
    pipeline_version: process.env.GIT_SHA ?? 'simulate',
    fixtures,
    replayMode: process.env.REPLAY_MODE === '1',
  });
  console.error(`quickDecode finished in ${Date.now() - t1}ms`);
  console.error(`report_source: ${result.meta.report_source}`);
  console.error('');
  console.error('=== MARKDOWN REPORT ===');
  console.error(result.report);
  console.error('=== END REPORT ===');
  console.error('');

  // Stable JSON to stdout for easy piping into jq, etc.
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
}

main().catch((err: any) => {
  console.error('fatal:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
