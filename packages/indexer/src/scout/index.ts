import { join } from 'node:path';
import { createDb } from '@chainward/db';
import { fetchCandidates, MALFUNCTION } from './detect.js';
import { scoreCandidate } from './scoring.js';
import { readDeliverables, recoverDecodedNames, isDecoded, recentlySurfaced, recordSurfaced } from './dedup.js';
import { renderCandidate, renderHeartbeat, renderFailure, postDiscord } from './ping.js';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing env ${name}`);
  return v;
}

async function main(): Promise<void> {
  const DATABASE_URL = requireEnv('DATABASE_URL');
  const SCOUT_WEBHOOK = requireEnv('SCOUT_DISCORD_WEBHOOK');
  const OPS_WEBHOOK = requireEnv('OPS_DISCORD_WEBHOOK');
  const deliverablesDir = process.env.DELIVERABLES_DIR ?? join(process.cwd(), 'deliverables');

  const db = createDb(DATABASE_URL);
  let rows;
  try {
    rows = await fetchCandidates(db);
  } catch (e) {
    await postDiscord(OPS_WEBHOOK, renderFailure('detect', String(e)));
    throw e;
  }

  if (MALFUNCTION.emptyRows(rows.length) || MALFUNCTION.allNullAgdp(rows)) {
    await postDiscord(OPS_WEBHOOK, renderFailure('detect', `malfunction: ${rows.length} rows, all-null aGDP=${MALFUNCTION.allNullAgdp(rows)}`));
    process.exit(1);
  }

  const decoded = recoverDecodedNames(readDeliverables(deliverablesDir));
  if (MALFUNCTION.noDecodedNames(decoded)) {
    await postDiscord(OPS_WEBHOOK, renderFailure('dedup', `no decoded names recovered from ${deliverablesDir} — deliverables missing/unmounted; refusing to risk re-surfacing decoded agents`));
    process.exit(1);
  }
  const cooled = await recentlySurfaced(db, 4);

  const ranked = rows
    .map((r) => ({ row: r, score: scoreCandidate(r) }))
    .filter(({ row, score }) =>
      !score.belowFloor &&
      score.juice > 0 &&
      !isDecoded(row.name, decoded) &&
      !cooled.has(row.walletAddress.toLowerCase()))
    .sort((a, b) => b.score.juice - a.score.juice);

  const top = ranked[0] ?? null;

  await postDiscord(OPS_WEBHOOK, renderHeartbeat({
    scanned: rows.length,
    topJuice: top?.score.juice ?? 0,
    candidate: top?.row.name ?? null,
  }));

  if (!top) {
    console.log('[scout] no candidate above threshold; heartbeat sent.');
    return;
  }

  const delivered = await postDiscord(SCOUT_WEBHOOK, renderCandidate({
    name: top.row.name,
    walletAddress: top.row.walletAddress,
    proof: top.score.proof,
  }));

  if (!delivered) {
    await postDiscord(OPS_WEBHOOK, renderFailure('ping', `candidate webhook non-2xx for ${top.row.name}`));
    process.exit(1);
  }

  await recordSurfaced(db, top.row.walletAddress, `${top.row.name.toLowerCase().replace(/\s+/g, '-')}-on-chain`);
  console.log(`[scout] surfaced ${top.row.name} (${top.row.walletAddress}); juice=${top.score.juice.toFixed(3)}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error('[scout] fatal', e); process.exit(1); });
