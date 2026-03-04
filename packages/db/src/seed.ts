import { createDb } from './index';
import { users, agentRegistry } from './schema/index';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const db = createDb(DATABASE_URL);

async function seed() {
  console.log('Seeding database...');

  const [demoUser] = await db
    .insert(users)
    .values({
      id: 'demo-user-001',
      walletAddress: '0x3cAc468EF749d75af4a864903a17D0870f38CBfA',
      displayName: 'Demo User',
      tier: 'pro',
      agentLimit: 50,
      eventLimit: 1_000_000,
      eventsUsed: 0,
    })
    .onConflictDoNothing()
    .returning();

  if (!demoUser) {
    console.log('Demo user already exists, skipping seed.');
    process.exit(0);
  }

  const userId = demoUser.id;

  await db.insert(agentRegistry).values([
    {
      chain: 'base',
      walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
      agentName: 'Trading Bot Alpha',
      agentFramework: 'agentkit',
      registrySource: 'manual',
      tags: ['trading', 'defi'],
      userId,
    },
    {
      chain: 'base',
      walletAddress: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd',
      agentName: 'Prediction Market Agent',
      agentFramework: 'olas',
      registrySource: 'olas',
      tags: ['prediction-market'],
      userId,
    },
    {
      chain: 'base',
      walletAddress: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      agentName: 'Data Collector',
      agentFramework: 'elizaos',
      registrySource: 'manual',
      tags: ['data', 'indexing'],
      userId,
    },
  ]);

  console.log('Seed complete: 1 user, 3 agents');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
