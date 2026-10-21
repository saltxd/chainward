/**
 * Remove labels (a correction), keeping the row with when and why. A later import or
 * detection of the same address, kind and source does not bring it back.
 *
 * Run (DATABASE_URL set):
 *   pnpm labels:remove --address 0x… --chain base [--kind run_together] [--source-ref <ref>] --reason "why"
 */
import { and, eq, isNull } from 'drizzle-orm';
import { walletLabels } from '@chainward/db';
import { args, connect } from './db.mts';

async function main(): Promise<void> {
  const { flags } = args(process.argv.slice(2));
  const address = flags.get('address')?.toLowerCase();
  const chain = flags.get('chain');
  const reason = flags.get('reason');
  if (!address || !/^0x[0-9a-f]{40}$/.test(address) || !chain || !reason || reason === 'true') {
    throw new Error('usage: labels-remove --address 0x… --chain base|bsc [--kind k] [--source-ref r] --reason "why"');
  }
  const kind = flags.get('kind');
  const ref = flags.get('source-ref');
  const removed = await connect()
    .update(walletLabels)
    .set({ removedAt: new Date(), removedReason: reason, updatedAt: new Date() })
    .where(
      and(
        eq(walletLabels.address, address),
        eq(walletLabels.chain, chain),
        isNull(walletLabels.removedAt),
        ...(kind ? [eq(walletLabels.kind, kind)] : []),
        ...(ref ? [eq(walletLabels.sourceRef, ref)] : []),
      ),
    )
    .returning({ id: walletLabels.id });
  console.log(`${removed.length} labels removed`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
