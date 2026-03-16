/**
 * Known Contracts Seed Script
 *
 * Seeds DeFi protocol contract mappings from intelligence data (packages/intelligence/).
 * Used by protocolResolver to tag transactions with protocol_name for analytics.
 *
 * Run: npx tsx packages/db/seeds/known-contracts.ts
 */

import postgres from 'postgres';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import type { KnownContract } from '@chainward/intelligence-loader';

function loadContracts(): KnownContract[] {
  const dataPath = resolve(process.cwd(), 'packages/intelligence/protocol-registry.json');
  if (!existsSync(dataPath)) {
    console.log('No intelligence data found at packages/intelligence/protocol-registry.json');
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

  const contracts = loadContracts();
  if (contracts.length === 0) {
    console.log('No known contracts to seed. Exiting.');
    process.exit(0);
  }

  const sql = postgres(dbUrl);

  try {
    let inserted = 0;

    for (const contract of contracts) {
      await sql`
        INSERT INTO known_contracts (chain, contract_address, protocol_name, contract_label)
        VALUES (
          ${contract.chain},
          ${contract.contractAddress},
          ${contract.protocolName},
          ${contract.contractLabel}
        )
        ON CONFLICT (chain, LOWER(contract_address)) DO UPDATE SET
          protocol_name = ${contract.protocolName},
          contract_label = ${contract.contractLabel}
      `;
      inserted++;
      console.log(`  [${inserted}] ${contract.protocolName} - ${contract.contractLabel}`);
    }

    console.log(`\nSeeded ${inserted} known contracts`);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

seed();
