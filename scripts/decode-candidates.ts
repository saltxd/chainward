/**
 * Surface the most decode-worthy ACP agents.
 *
 * Pulls the top N agents from the ACP API by aGDP, scores each on signals
 * we'd actually use to pick a research target, drops anything we've already
 * decoded, and prints a ranked table with rationale.
 *
 * Run: pnpm decode:candidates
 *      pnpm decode:candidates --top 100
 *      pnpm decode:candidates --json
 */

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ACP_API = 'https://acpx.virtuals.io/api';

interface AcpAgent {
  id: number;
  name: string;
  walletAddress: string;
  role: string | null;
  category: string | null;
  twitterHandle: string | null;
  grossAgenticAmount: number;
  revenue: number;
  successfulJobCount: number;
  successRate: number;
  uniqueBuyerCount: number;
  transactionCount: number;
  walletBalance: string;
  lastActiveAt: string;
  hasGraduated: boolean;
}

interface AcpListResponse {
  data: AcpAgent[];
  meta: { pagination: { page: number; pageCount: number; total: number } };
}

// ── Args ─────────────────────────────────────────────────────────────────

function getArg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(name);
  return idx > 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}
const TOP_N = parseInt(getArg('--top', '100'), 10);
const SHOW = parseInt(getArg('--show', '10'), 10);
const AS_JSON = process.argv.includes('--json');

// ── Already-decoded set ──────────────────────────────────────────────────

function readDecodedAgents(): Set<string> {
  const decodedNames = new Set<string>();
  const deliverablesDir = join(__dirname, '..', 'deliverables');
  if (!existsSync(deliverablesDir)) return decodedNames;

  for (const dir of readdirSync(deliverablesDir, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const dirPath = join(deliverablesDir, dir.name);
    const candidates = readdirSync(dirPath).filter(
      (f) => f.endsWith('.md') && !['publish-checklist.md', 'thread.md', 'findings.md', 'architecture.md'].includes(f),
    );
    for (const file of candidates) {
      const content = readFileSync(join(dirPath, file), 'utf-8');
      const fm = content.match(/^---\s*\n([\s\S]*?)\n---/);
      if (!fm) continue;
      const titleMatch = fm[1].match(/^title:\s*"?([^"\n]+?)"?\s*$/m);
      if (!titleMatch) continue;
      // "AIXBT On-Chain Decode" → "aixbt"
      // "Wasabot On-Chain Decode" → "wasabot"
      const title = titleMatch[1].toLowerCase();
      const agentToken = title.split(/\s+(on-chain|deep dive|decode)/)[0].trim();
      if (agentToken) decodedNames.add(agentToken);
    }
  }
  return decodedNames;
}

// ── ACP fetch ────────────────────────────────────────────────────────────

/** Statuses worth another try: rate limiting, upstream wobble, and the 401 the
 * gateway intermittently returns on an endpoint that needs no auth. We saw a
 * single 401 kill a whole run on 2026-10-31, then the same URL answer 200
 * minutes later, so a bare throw here takes out the caller for no reason. */
const RETRYABLE = new Set([401, 408, 425, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchAgentPage(page: number): Promise<AcpListResponse> {
  const url = `${ACP_API}/agents?pagination%5Bpage%5D=${page}&pagination%5BpageSize%5D=50&sort=grossAgenticAmount:desc`;

  let lastError = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response;
    try {
      res = await fetch(url);
    } catch (err) {
      // Network-level failure (DNS, reset, timeout) is retryable too.
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt === MAX_ATTEMPTS) break;
      await sleep(500 * 2 ** (attempt - 1));
      continue;
    }

    if (res.ok) return (await res.json()) as AcpListResponse;

    lastError = `ACP API ${res.status}`;
    // A non-retryable status is a real answer: fail now rather than hammer it.
    if (!RETRYABLE.has(res.status)) throw new Error(lastError);
    if (attempt === MAX_ATTEMPTS) break;

    const backoff = 500 * 2 ** (attempt - 1);
    console.warn(`  ${lastError} on page ${page}, retry ${attempt}/${MAX_ATTEMPTS - 1} in ${backoff}ms`);
    await sleep(backoff);
  }

  throw new Error(`${lastError} on page ${page} after ${MAX_ATTEMPTS} attempts`);
}

async function fetchTopAgents(n: number): Promise<AcpAgent[]> {
  const out: AcpAgent[] = [];
  let page = 1;
  while (out.length < n) {
    const json = await fetchAgentPage(page);
    out.push(...json.data);
    if (page >= json.meta.pagination.pageCount) break;
    page++;
  }
  return out.slice(0, n);
}

// ── Scoring ──────────────────────────────────────────────────────────────

interface ScoreResult {
  total: number;
  outlier: number;
  mismatch: number;
  audience: number;
  recency: number;
  rationale: string;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function daysSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}

function computeScore(agent: AcpAgent, medianAgdpPerJob: number): ScoreResult {
  // Guard against agents with zero or near-zero job count.
  const jobs = Math.max(agent.successfulJobCount, 1);
  const agdpPerJob = agent.grossAgenticAmount / jobs;
  const balance = parseFloat(agent.walletBalance) || 0;

  // 1. Outlier index — how far is this agent's aGDP/job from the median?
  // log-space distance, normalized roughly to 0–3.
  const outlier =
    medianAgdpPerJob > 0 && agdpPerJob > 0
      ? Math.min(Math.abs(Math.log10(agdpPerJob) - Math.log10(medianAgdpPerJob)), 4) / 4
      : 0;

  // 2. Reported aGDP against reported wallet balance.
  //
  // CAUTION: both inputs are ACP API fields. Nothing here reads the chain, so
  // this signal must never be described as an on-chain mismatch.
  //
  // It has one large false-positive class, found the hard way in Oct 2026.
  // When aGDP dwarfs revenue, aGDP is NOTIONAL (trade volume, tokens
  // transferred, perp position size) rather than money the agent kept. Those
  // agents are routinely non-custodial: funds sit in the user's own wallet, so
  // a walletBalance of "0" is the correct and expected state, not a red flag.
  // Otto AI topped this list on exactly that basis ($18.3M aGDP, $2.0K revenue,
  // $0 wallet) and turned out to be a legitimate non-custodial trade executor.
  // test_owl (a transfer utility) and Sympson (perps) are the same shape.
  const revenue = agent.revenue ?? 0;
  const notionalVolume = revenue > 0 && agent.grossAgenticAmount / revenue > 50;

  // Known remaining weakness: an agent that simply sweeps its earnings to an
  // owner wallet also shows a low balance, so this signal still rewards normal
  // treasury hygiene. Treat a high score here as "worth a look", never as
  // evidence of a false claim.
  const mismatch =
    agent.grossAgenticAmount > 1000 && balance < 100 && !notionalVolume
      ? Math.min(Math.log10(agent.grossAgenticAmount + 1) / 9, 1)
      : 0;

  // 3. Audience pull — uniqueBuyers as a proxy for organic interest.
  const audience = Math.min(Math.log10(agent.uniqueBuyerCount + 1) / 4, 1);

  // 4. Recency — currently active = more interesting.
  //
  // The ACP API returns 2999-12-31T00:00:00.000Z as a placeholder when it has
  // no real last-active timestamp. Read literally that is ~973 years in the
  // future, every `days < N` test passes, and the agent scores maximum recency
  // for having no activity data at all. In Oct 2026 that was three of the top
  // ten, including the #1 and #2 candidates. Treat any date more than a day
  // ahead as the placeholder it is; under a day is ordinary clock skew.
  const days = daysSince(agent.lastActiveAt);
  const recencyKnown = Number.isFinite(days) && days > -1;
  const recency = !recencyKnown
    ? 0
    : days < 7
      ? 1.0
      : days < 30
        ? 0.5
        : days < 90
          ? 0.2
          : 0.0;

  const total = outlier * 0.30 + mismatch * 0.30 + audience * 0.25 + recency * 0.15;

  // Pick strongest signal as the rationale.
  const signals: [string, number][] = [
    [
      `outlier aGDP/job ($${agdpPerJob.toFixed(2)} vs median $${medianAgdpPerJob.toFixed(2)})`,
      outlier * 0.30,
    ],
    [
      `reported aGDP vs reported balance ($${(agent.grossAgenticAmount / 1e6).toFixed(1)}M aGDP, API walletBalance $${balance.toFixed(2)}, unverified)`,
      mismatch * 0.30,
    ],
    [`high audience pull (${agent.uniqueBuyerCount.toLocaleString()} unique buyers)`, audience * 0.25],
    [
      recencyKnown
        ? `recently active (${Math.max(days, 0).toFixed(0)}d ago)`
        : 'last-active unknown (API placeholder date)',
      recency * 0.15,
    ],
  ];
  const top = signals.sort((a, b) => b[1] - a[1])[0];

  return { total, outlier, mismatch, audience, recency, rationale: top[0] };
}

// ── Output ───────────────────────────────────────────────────────────────

function formatRow(rank: number, agent: AcpAgent, score: ScoreResult): string {
  const name = agent.name.padEnd(28).slice(0, 28);
  const aGDP =
    agent.grossAgenticAmount >= 1e6
      ? `$${(agent.grossAgenticAmount / 1e6).toFixed(1)}M`
      : agent.grossAgenticAmount >= 1e3
        ? `$${(agent.grossAgenticAmount / 1e3).toFixed(1)}K`
        : `$${agent.grossAgenticAmount.toFixed(0)}`;
  const aGDPpad = aGDP.padStart(8);
  const role = (agent.role ?? '?').padEnd(8).slice(0, 8);
  const scoreStr = score.total.toFixed(2);
  return `${String(rank).padStart(3)}  ${name}  ${aGDPpad}  ${role}  ${scoreStr}  ${score.rationale}`;
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const decoded = readDecodedAgents();
  console.error(
    `Already decoded (excluded): ${decoded.size > 0 ? [...decoded].join(', ') : 'none'}\n`,
  );

  const agents = await fetchTopAgents(TOP_N);
  console.error(`Pulled ${agents.length} agents from ACP API.`);

  // Compute median across non-trivial agents.
  const ratios = agents
    .filter((a) => a.successfulJobCount > 0 && a.grossAgenticAmount > 0)
    .map((a) => a.grossAgenticAmount / a.successfulJobCount);
  const medianAgdpPerJob = median(ratios);
  console.error(`Median aGDP/job across pool: $${medianAgdpPerJob.toFixed(2)}\n`);

  const eligible = agents.filter((a) => {
    const tok = a.name.toLowerCase().split(/\s+/)[0];
    return !decoded.has(tok) && !decoded.has(a.name.toLowerCase());
  });

  const ranked = eligible
    .map((a) => ({ agent: a, score: computeScore(a, medianAgdpPerJob) }))
    .sort((a, b) => b.score.total - a.score.total)
    .slice(0, SHOW);

  if (AS_JSON) {
    console.log(
      JSON.stringify(
        ranked.map((r, i) => ({
          rank: i + 1,
          agent: r.agent,
          score: r.score,
        })),
        null,
        2,
      ),
    );
    return;
  }

  console.log('Rank Agent                          aGDP    Role     Score Rationale');
  console.log('───────────────────────────────────────────────────────────────────────────────────');
  ranked.forEach((r, i) => console.log(formatRow(i + 1, r.agent, r.score)));
  console.log();
  console.log(
    `Run \`pnpm decode:candidates --json\` for the full payload, or \`--top 200\` to pull deeper.`,
  );
}

main().catch((err) => {
  console.error('decode-candidates failed:', err);
  process.exit(1);
});
