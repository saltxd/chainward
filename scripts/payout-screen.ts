/**
 * Screen a payout list before it is paid (chainward.ai/screen): which wallets
 * share a funder, with the transactions that link each group, and OFAC hits.
 *
 * Run: pnpm payout:screen --chain base --in list.csv
 *      pnpm payout:screen --chain bsc --in list.csv --out ./screen --hops 3 --max-calls 1500 --rate 3
 *
 * The list: one wallet per line, optionally followed by the amount to pay it
 * (parsePayoutList in packages/decode/src/payout-screen.ts). Needs an Alchemy
 * RPC in BASE_RPC_URL (BNB Chain reuses its key) or SELLER_DEMAND_RPC_URL /
 * SELLER_DEMAND_BSC_RPC_URL; the URL is never printed. Alchemy calls are capped
 * by --max-calls and paced to --rate per second, because production shares the
 * key: wallets left when the cap is reached are reported as not traced. Nonce
 * and code reads use the chain's public RPC. Writes payout-screen.json and
 * payout-screen.md to --out (default: the list's folder).
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { riskChainRpcs } from '../packages/common/src/constants/riskChains.js';
import { jsonRpcResult } from '../packages/decode/src/data-fetch.js';
import { withRpcFallback } from '../packages/decode/src/hire-sources.js';
import { ofacList, refreshOfacList } from '../packages/decode/src/ofac.js';
import { buildPayoutScreen, parsePayoutList, renderPayoutScreen, traceWallets, SCREEN_MAX_HOPS } from '../packages/decode/src/payout-screen.js';
import { payoutScreenSource } from '../packages/decode/src/payout-screen-sources.js';
import { SELLER_BLOCKS_PER_DAY, sellerDemandRpcUrl, type SellerChain } from '../packages/decode/src/seller-demand.js';
import type { RpcCall } from '../packages/decode/src/rpc-fixtures.js';

const RPC_TIMEOUT_MS = 15_000;
/** The inflow hub rule counts stablecoin transfers over the last 30 days. */
const HUB_WINDOW_DAYS = 30;

function fail(msg: string): never {
  console.error(`payout-screen: ${msg}`);
  process.exit(1);
}

/** Counts and paces every request to the Alchemy URL; past the cap, requests fail and the wallet is reported untraced. */
function capAlchemy(alchemyUrl: string, maxCalls: number, perSecond: number): { calls: () => number } {
  const realFetch = globalThis.fetch;
  const interval = 1000 / perSecond;
  let calls = 0;
  let nextSlot = 0;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === alchemyUrl) {
      if (calls >= maxCalls) throw new Error('Alchemy call cap reached');
      calls += 1;
      const now = Date.now();
      const wait = Math.max(0, nextSlot - now);
      nextSlot = Math.max(now, nextSlot) + interval;
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
    return realFetch(input, init);
  };
  return { calls: () => calls };
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      chain: { type: 'string', default: 'base' },
      in: { type: 'string' },
      out: { type: 'string' },
      hops: { type: 'string', default: String(SCREEN_MAX_HOPS) },
      'max-calls': { type: 'string', default: '1500' },
      rate: { type: 'string', default: '3' },
    },
  });
  const chain = values.chain as SellerChain;
  if (chain !== 'base' && chain !== 'bsc') fail('--chain must be base or bsc');
  if (!values.in) fail('--in <list.csv> is required');
  const hops = Number(values.hops);
  const maxCalls = Number(values['max-calls']);
  const rate = Number(values.rate);
  if (!(hops >= 1) || !(maxCalls >= 1) || !(rate > 0)) fail('--hops, --max-calls and --rate must be positive numbers');

  const listPath = resolve(values.in);
  const list = parsePayoutList(readFileSync(listPath, 'utf8'));
  if (list.entries.length === 0) fail(`no wallet addresses in ${listPath}`);

  const alchemyUrl = sellerDemandRpcUrl(chain, process.env);
  if (!alchemyUrl) fail('set BASE_RPC_URL (or SELLER_DEMAND_RPC_URL) to an Alchemy URL');
  const cap = capAlchemy(alchemyUrl, maxCalls, rate);

  const rpcs = riskChainRpcs(chain, process.env);
  const rpcCall = withRpcFallback((url, method, params, timeoutMs) => jsonRpcResult(url, method, params, timeoutMs), rpcs) satisfies RpcCall;
  const rpcUrl = rpcs[0]!.url;
  const head = Number(BigInt(String(await rpcCall(rpcUrl, 'eth_blockNumber', [], RPC_TIMEOUT_MS))));

  const refresh = await refreshOfacList();
  if (!refresh.ok) console.error(`payout-screen: OFAC refresh failed (${refresh.reason}); using the list from ${ofacList().fetched_at}`);

  const wallets = list.entries.map((e) => e.address);
  console.error(`payout-screen: ${wallets.length} wallets on ${chain}, up to ${hops} funders back, at most ${maxCalls} Alchemy calls at ${rate}/s`);
  const source = payoutScreenSource({
    chain,
    alchemyUrl,
    rpcUrl,
    rpcCall,
    windowFromBlock: head - HUB_WINDOW_DAYS * SELLER_BLOCKS_PER_DAY[chain],
    log: { warn: (msg) => console.error(`payout-screen: ${msg}`) },
  });
  const trails = await traceWallets(wallets, source, {
    maxHops: hops,
    onWallet: (done) => {
      if (done % 25 === 0 || done === wallets.length) console.error(`payout-screen: ${done}/${wallets.length} traced, ${cap.calls()} Alchemy calls`);
    },
  });

  const report = buildPayoutScreen({ chain, list, trails, generatedAt: new Date().toISOString(), maxHops: hops });
  const outDir = resolve(values.out ?? dirname(listPath));
  mkdirSync(outDir, { recursive: true });
  const run = { list: listPath, head_block: head, alchemy_calls: cap.calls(), max_calls: maxCalls, ofac: ofacList() };
  writeFileSync(join(outDir, 'payout-screen.json'), JSON.stringify({ ...report, run }, null, 2) + '\n');
  writeFileSync(join(outDir, 'payout-screen.md'), renderPayoutScreen(report));

  const s = report.summary;
  console.log(`${s.grouped_wallets} of ${report.wallets.listed} wallets in ${s.groups} groups (largest ${s.largest_group}); OFAC hits: ${s.sanctioned.length}`);
  console.log(`${cap.calls()} Alchemy calls. Wrote ${join(outDir, 'payout-screen.md')} and payout-screen.json`);
  if (report.wallets.not_traced > 0) {
    console.error(`payout-screen: ${report.wallets.not_traced} wallets not fully traced${cap.calls() >= maxCalls ? ' (call cap reached; raise --max-calls)' : ''}`);
  }
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
