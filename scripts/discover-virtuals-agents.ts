/**
 * Discover active Virtuals Protocol agent wallets on Base.
 *
 * Strategy:
 * 1. Call Agent NFT contract nextVirtualId() to get total count
 * 2. Batch-call virtualInfo(id) to get TBA + founder for each agent
 * 3. Cross-reference with Virtuals API for sentientWalletAddress (the real execution wallet)
 * 4. Check on-chain tx count to filter for active wallets
 * 5. Output new agents not already in the observatory seed
 *
 * Usage: DATABASE_URL=... BASE_RPC_URL=... npx tsx scripts/discover-virtuals-agents.ts
 */

import { createPublicClient, http, type Address } from 'viem';
import { base } from 'viem/chains';
import postgres from 'postgres';

// ── Config ──────────────────────────────────────────────────────────────

const BASE_RPC = process.env.BASE_RPC_URL!;
const DATABASE_URL = process.env.DATABASE_URL;

if (!BASE_RPC) {
  console.error('BASE_RPC_URL is required');
  process.exit(1);
}

const AGENT_NFT = '0x50725af160260a316b2673C71C8c21469f6732c0' as Address;

const AGENT_NFT_ABI = [
  {
    type: 'function',
    name: 'nextVirtualId',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'virtualInfo',
    stateMutability: 'view',
    inputs: [{ name: 'virtualId', type: 'uint256' }],
    outputs: [
      {
        type: 'tuple',
        components: [
          { name: 'dao', type: 'address' },
          { name: 'token', type: 'address' },
          { name: 'founder', type: 'address' },
          { name: 'tba', type: 'address' },
          { name: 'coreTypes', type: 'uint8[]' },
        ],
      },
    ],
  },
] as const;

const VIRTUALS_API = 'https://api.virtuals.io/api/virtuals';
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
const BATCH_SIZE = 50; // multicall batch size
const API_CONCURRENCY = 5;
const RPC_DELAY = 200; // ms between RPC batches
const API_DELAY = 150; // ms between API calls
const MIN_TX_COUNT = 2; // at least 2 outbound txs to be "active"
const MIN_HOLDERS = 0; // no holder filter — we filter by activity instead

// ── Viem Client ─────────────────────────────────────────────────────────

const client = createPublicClient({
  chain: base,
  transport: http(BASE_RPC, { retryCount: 3, retryDelay: 1000 }),
});

// ── Types ───────────────────────────────────────────────────────────────

interface OnChainAgent {
  virtualId: number;
  tba: string;
  founder: string;
  token: string;
  dao: string;
}

interface EnrichedAgent {
  address: string;
  name: string;
  symbol: string;
  framework: string;
  project: string;
  source: string;
  virtualsId: number;
  holders: number;
  walletType: 'sentient' | 'tba' | 'founder';
  txCount: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'ChainWard-Discovery/2.0' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  return res.json();
}

// ── Phase 1: On-Chain Enumeration ───────────────────────────────────────

async function getNextVirtualId(): Promise<number> {
  const result = await client.readContract({
    address: AGENT_NFT,
    abi: AGENT_NFT_ABI,
    functionName: 'nextVirtualId',
  });
  return Number(result);
}

async function batchGetVirtualInfo(startId: number, count: number): Promise<OnChainAgent[]> {
  const contracts = [];
  for (let i = startId; i < startId + count; i++) {
    contracts.push({
      address: AGENT_NFT,
      abi: AGENT_NFT_ABI,
      functionName: 'virtualInfo' as const,
      args: [BigInt(i)] as const,
    });
  }

  try {
    const results = await client.multicall({ contracts, allowFailure: true });
    const agents: OnChainAgent[] = [];

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === 'success' && r.result) {
        const info = r.result as unknown as { dao: string; token: string; founder: string; tba: string; coreTypes: number[] };
        if (info.tba && info.tba !== ZERO_ADDR) {
          agents.push({
            virtualId: startId + i,
            tba: info.tba,
            founder: info.founder,
            token: info.token,
            dao: info.dao,
          });
        }
      }
    }
    return agents;
  } catch (err) {
    console.error(`  Multicall failed for IDs ${startId}-${startId + count - 1}:`, (err as Error).message?.slice(0, 100));
    return [];
  }
}

// ── Phase 2: API Enrichment ─────────────────────────────────────────────

interface ApiAgent {
  name: string;
  symbol: string;
  holders: number;
  sentientWallet: string;
  walletAddress: string;
}

async function fetchVirtualsAgent(virtualId: number): Promise<ApiAgent | null> {
  try {
    const data = await fetchJson(`${VIRTUALS_API}/${virtualId}`) as { data?: Record<string, unknown> } | null;
    if (!data || !data.data) return null;
    const v = data.data;
    return {
      name: String(v.name || `Agent #${virtualId}`),
      symbol: String(v.symbol || ''),
      holders: Number(v.holderCount || 0),
      sentientWallet: String(v.sentientWalletAddress || ''),
      walletAddress: String(v.walletAddress || ''),
    };
  } catch {
    return null;
  }
}

// ── Phase 3: Activity Check ─────────────────────────────────────────────

async function batchGetTxCounts(addresses: string[]): Promise<Map<string, number>> {
  const results = new Map<string, number>();

  // Use multicall-style batching via raw RPC
  for (let i = 0; i < addresses.length; i += 20) {
    const batch = addresses.slice(i, i + 20);
    const body = batch.map((addr, idx) => ({
      id: idx + 1,
      jsonrpc: '2.0',
      method: 'eth_getTransactionCount',
      params: [addr, 'latest'],
    }));

    try {
      const res = await fetch(BASE_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      const data = await res.json() as { id: number; result: string }[];

      if (Array.isArray(data)) {
        for (const item of data) {
          const addr = batch[item.id - 1];
          if (addr) {
            results.set(addr.toLowerCase(), parseInt(item.result || '0x0', 16));
          }
        }
      }
    } catch (err) {
      console.error(`  Tx count batch failed:`, (err as Error).message?.slice(0, 80));
    }

    if (i + 20 < addresses.length) await sleep(RPC_DELAY);
  }

  return results;
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  ChainWard — Virtuals Agent Discovery (On-Chain + API)     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Load existing observatory addresses from DB if available, otherwise from seed
  const existingAddrs = new Set<string>();

  if (DATABASE_URL) {
    console.log('Loading existing agents from database...');
    const sql = postgres(DATABASE_URL);
    const rows = await sql`SELECT LOWER(wallet_address) as addr FROM agent_registry WHERE is_observatory = true`;
    for (const row of rows) existingAddrs.add(row.addr);
    await sql.end();
    console.log(`  ${existingAddrs.size} existing observatory addresses loaded\n`);
  } else {
    console.log('No DATABASE_URL — will output all discovered agents\n');
  }

  // ── Phase 1: Enumerate all agents via Agent NFT contract ──
  console.log('Phase 1: On-chain enumeration via Agent NFT contract...');
  const nextId = await getNextVirtualId();
  console.log(`  nextVirtualId() = ${nextId} (${nextId - 1} agents exist)\n`);

  const allOnChain: OnChainAgent[] = [];
  const totalBatches = Math.ceil(nextId / BATCH_SIZE);

  for (let batch = 0; batch < totalBatches; batch++) {
    const startId = batch * BATCH_SIZE + 1;
    const count = Math.min(BATCH_SIZE, nextId - startId + 1);

    if (count <= 0) break;

    const agents = await batchGetVirtualInfo(startId, count);
    allOnChain.push(...agents);

    if ((batch + 1) % 100 === 0 || batch === totalBatches - 1) {
      const pct = Math.round(((batch + 1) / totalBatches) * 100);
      console.log(`  [${pct}%] Scanned IDs ${1}-${startId + count - 1}, found ${allOnChain.length} agents with TBAs`);
    }

    await sleep(RPC_DELAY);
  }

  console.log(`\n  Total on-chain agents with TBAs: ${allOnChain.length}\n`);

  // ── Collect unique candidate addresses ──
  // For each agent: prefer sentientWallet > TBA > founder
  // But we need the API to get sentientWallet, so first collect TBAs

  // Filter out already-known addresses
  const candidatesByVirtualId = new Map<number, OnChainAgent>();
  for (const agent of allOnChain) {
    if (!existingAddrs.has(agent.tba.toLowerCase()) &&
        !existingAddrs.has(agent.founder.toLowerCase())) {
      candidatesByVirtualId.set(agent.virtualId, agent);
    }
  }

  console.log(`  New candidates (not in observatory): ${candidatesByVirtualId.size}\n`);

  // ── Phase 2: API enrichment for candidates ──
  console.log('Phase 2: Enriching with Virtuals API (names, holders, sentientWallet)...');

  const enriched = new Map<number, OnChainAgent & ApiAgent>();
  const candidateIds = Array.from(candidatesByVirtualId.keys());
  let apiDone = 0;
  let apiFound = 0;

  // Process in parallel batches
  for (let i = 0; i < candidateIds.length; i += API_CONCURRENCY) {
    const batch = candidateIds.slice(i, i + API_CONCURRENCY);
    const promises = batch.map(async (vid) => {
      const apiData = await fetchVirtualsAgent(vid);
      if (apiData) {
        const onChain = candidatesByVirtualId.get(vid)!;
        enriched.set(vid, { ...onChain, ...apiData });
        apiFound++;
      }
    });
    await Promise.all(promises);
    apiDone += batch.length;

    if (apiDone % 500 === 0 || apiDone === candidateIds.length) {
      console.log(`  [${Math.round((apiDone / candidateIds.length) * 100)}%] API: ${apiDone}/${candidateIds.length} queried, ${apiFound} found`);
    }

    await sleep(API_DELAY);
  }

  console.log(`\n  Enriched ${enriched.size} agents with API data\n`);

  // ── Build candidate wallet list ──
  // Priority: sentientWallet > walletAddress (if unique) > TBA
  const walletCandidates = new Map<string, { virtualId: number; walletType: 'sentient' | 'tba'; name: string; symbol: string; holders: number }>();

  for (const [vid, agent] of enriched) {
    const sentient = agent.sentientWallet;
    const tba = agent.tba;
    const wallet = agent.walletAddress;

    // Priority: sentient > wallet (operator EOA) > TBA
    for (const [addr, wtype] of [
      [sentient, 'sentient'] as const,
      [wallet, 'sentient'] as const,  // operator wallets are often the real execution wallet
      [tba, 'tba'] as const,
    ]) {
      if (addr && addr !== ZERO_ADDR && addr.length === 42 &&
          !existingAddrs.has(addr.toLowerCase()) &&
          !walletCandidates.has(addr.toLowerCase())) {
        walletCandidates.set(addr.toLowerCase(), {
          virtualId: vid,
          walletType: wtype,
          name: agent.name,
          symbol: agent.symbol,
          holders: agent.holders,
        });
      }
    }
  }

  console.log(`Phase 3: Checking on-chain activity for ${walletCandidates.size} candidate wallets...\n`);

  // ── Phase 3: Activity check ──
  const allAddresses = Array.from(walletCandidates.keys());
  const txCounts = await batchGetTxCounts(allAddresses);

  // Filter for active wallets
  const activeAgents: EnrichedAgent[] = [];

  for (const [addr, info] of walletCandidates) {
    const txCount = txCounts.get(addr) || 0;
    if (txCount >= MIN_TX_COUNT) {
      activeAgents.push({
        address: addr.startsWith('0x') ? addr : `0x${addr}`,
        name: info.name,
        symbol: info.symbol,
        framework: 'virtuals',
        project: `${info.name} by Virtuals`,
        source: `Virtuals API #${info.virtualId} (${info.walletType}, ${info.holders.toLocaleString()} holders, ${txCount} txs)`,
        virtualsId: info.virtualId,
        holders: info.holders,
        walletType: info.walletType,
        txCount,
      });
    }
  }

  // Sort by tx count descending
  activeAgents.sort((a, b) => b.txCount - a.txCount);

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`RESULTS: ${activeAgents.length} active new agents discovered`);
  console.log(`${'═'.repeat(60)}\n`);

  console.log(`Top 50 most active:`);
  for (const a of activeAgents.slice(0, 50)) {
    const nameStr = a.name.slice(0, 30).padEnd(30);
    const typeStr = a.walletType.padEnd(8);
    console.log(`  ${nameStr} ${typeStr} ${String(a.txCount).padStart(6)} txs  ${a.holders.toLocaleString().padStart(8)} holders  ${a.address.slice(0, 14)}...`);
  }

  // ── Output ──
  const outputPath = '/tmp/discovered-onchain-agents.json';
  const fs = await import('fs');
  fs.writeFileSync(outputPath, JSON.stringify(activeAgents, null, 2));
  console.log(`\nSaved ${activeAgents.length} agents to ${outputPath}`);

  // ── Generate TypeScript seed entries ──
  const seedPath = '/tmp/new-observatory-agents.ts';
  const lines: string[] = [];
  lines.push('  // ════════════════════════════════════════════════════════════════════');
  lines.push('  // Discovered via on-chain Agent NFT enumeration + API enrichment');
  lines.push(`  // Added ${new Date().toISOString().slice(0, 10)} — ${activeAgents.length} active agents`);
  lines.push('  // ════════════════════════════════════════════════════════════════════');

  for (const a of activeAgents) {
    const escapedName = a.name.replace(/'/g, "\\'").replace(/—/g, '-');
    const escapedProject = a.project.replace(/'/g, "\\'").replace(/—/g, '-');
    const escapedSource = a.source.replace(/'/g, "\\'");
    lines.push('  {');
    lines.push(`    address: '${a.address}',`);
    lines.push(`    name: '${escapedName}',`);
    lines.push(`    framework: 'virtuals',`);
    lines.push(`    project: '${escapedProject}',`);
    lines.push(`    source: '${escapedSource}',`);
    lines.push(`    virtualsId: ${a.virtualsId},`);
    lines.push('  },');
  }

  fs.writeFileSync(seedPath, lines.join('\n'));
  console.log(`Generated seed entries at ${seedPath}`);

  console.log('\nDone!');
}

main().catch((err) => {
  console.error('Discovery failed:', err);
  process.exit(1);
});
