/**
 * Observatory Agent Seed Script
 *
 * Seeds observatory agents from intelligence data (packages/intelligence/).
 * For self-hosted instances without intelligence data, this will exit gracefully.
 *
 * Run: npx tsx packages/db/seeds/observatory-agents.ts
 */

import postgres from 'postgres';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import type { ObservatoryAgent } from '@chainward/intelligence-loader';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';
const SYSTEM_WALLET = '0x0000000000000000000000000000000000000000';

function loadAgents(): ObservatoryAgent[] {
  const dataPath = resolve(process.cwd(), 'packages/intelligence/observatory-agents.json');
  if (!existsSync(dataPath)) {
    console.log('No intelligence data found at packages/intelligence/observatory-agents.json');
    console.log('See packages/intelligence/README.md for setup instructions.');
    return [];
  }
  return JSON.parse(readFileSync(dataPath, 'utf-8'));
}

async function seed() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }

  const agents = loadAgents();
  if (agents.length === 0) {
    console.log('No observatory agents to seed. Exiting.');
    process.exit(0);
  }

  const sql = postgres(dbUrl);

  try {
    // 1. Create system user (upsert)
    await sql`
      INSERT INTO users (id, wallet_address, display_name, tier, agent_limit, event_limit)
      VALUES (
        ${SYSTEM_USER_ID},
        ${SYSTEM_WALLET},
        'Observatory System',
        'enterprise',
        1000,
        999999999
      )
      ON CONFLICT (id) DO UPDATE SET
        display_name = 'Observatory System',
        tier = 'enterprise',
        agent_limit = 1000
    `;
    console.log(`Created/updated system user: ${SYSTEM_USER_ID}`);

    // 2. Insert observatory agents (upsert by wallet)
    let inserted = 0;
    let skipped = 0;

    for (const agent of agents) {
      const registrySource = agent.framework === 'virtuals'
        ? 'virtuals'
        : agent.framework === 'olas'
          ? 'olas'
          : 'manual';

      const result = await sql`
        INSERT INTO agent_registry (
          chain, wallet_address, agent_name, agent_framework,
          registry_source, registry_id, is_public, is_observatory,
          user_id, tags, agent_type
        ) VALUES (
          'base',
          ${agent.address},
          ${agent.name},
          ${agent.framework},
          ${registrySource},
          ${agent.virtualsId?.toString() ?? null},
          true,
          true,
          ${SYSTEM_USER_ID},
          ${sql.array([agent.project, agent.source])},
          ${agent.agentType ?? 'trading'}
        )
        ON CONFLICT (chain, wallet_address, user_id) DO UPDATE SET
          agent_name = ${agent.name},
          agent_framework = ${agent.framework},
          is_public = true,
          is_observatory = true,
          registry_source = ${registrySource},
          registry_id = ${agent.virtualsId?.toString() ?? null},
          tags = ${sql.array([agent.project, agent.source])},
          agent_type = ${agent.agentType ?? 'trading'}
        RETURNING id
      `;
      if (result.length > 0) {
        inserted++;
        console.log(`  [${inserted}] ${agent.name} → ${agent.address.slice(0, 10)}...`);
      } else {
        skipped++;
      }
    }

    console.log(`\nSeeded ${inserted} observatory agents (${skipped} skipped)`);
    console.log(`Total: ${agents.length} agents configured`);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

seed();
