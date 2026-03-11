/**
 * Observatory Agent Seed Data
 *
 * Verified AI agent operator wallets on Base, sourced from:
 * - Virtuals Protocol API (api2.virtuals.io)
 * - Basescan verification
 * - RPC nonce checks (all addresses confirmed active)
 *
 * Run: npx tsx packages/db/seeds/observatory-agents.ts
 */

import postgres from 'postgres';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';
const SYSTEM_WALLET = '0x0000000000000000000000000000000000000000';

interface ObservatoryAgent {
  address: string;
  name: string;
  framework: string;
  project: string;
  source: string;
  virtualsId?: number;
  agentType?: string;
}

const OBSERVATORY_AGENTS: ObservatoryAgent[] = [
  // ── Tier 1: Headline agents (high profile, well-known) ────────────
  {
    address: '0x8DFb37AaE4f8fCbD1f90015A9e75b48F50Fd9f59',
    name: 'AIXBT',
    framework: 'virtuals',
    project: 'AIXBT by Virtuals',
    source: 'Virtuals API #1199',
    virtualsId: 1199,
  },
  {
    address: '0x0D177181E3763B20D47DC3a72dD584368BD8bF43',
    name: 'Luna',
    framework: 'virtuals',
    project: 'Luna by Virtuals',
    source: 'Virtuals API #68 (sentientWalletAddress)',
    virtualsId: 68,
  },
  {
    address: '0x8eac1F5F6Cd8Cb92dE1b33160Ed2BF226270BC76',
    name: 'VaderAI',
    framework: 'virtuals',
    project: 'VaderAI by Virtuals',
    source: 'Virtuals API #896',
    virtualsId: 896,
  },
  {
    address: '0xD38493119859b8806ff28C32c41fdd67Ef41b8Ef',
    name: 'G.A.M.E',
    framework: 'virtuals',
    project: 'GAME by Virtuals',
    source: 'Virtuals API #273',
    virtualsId: 273,
  },
  {
    address: '0x062e1DC8d0aB6Ec4EA7B9D2CF18cC439dCcd7C2B',
    name: 'Sekoia',
    framework: 'virtuals',
    project: 'Sekoia by Virtuals',
    source: 'Virtuals API #743',
    virtualsId: 743,
  },
  {
    address: '0x1Fb2f7ce91391F24659AD86E9a8C3ce8bfFb3Ef6',
    name: 'ai16z',
    framework: 'virtuals',
    project: 'ai16z by Virtuals',
    source: 'Virtuals API #750',
    virtualsId: 750,
  },

  // ── Tier 2: High-activity agents (100+ txs) ──────────────────────
  {
    address: '0x6Cc3E709499c5E91F65391a017a37f4dEB876142',
    name: 'Chi',
    framework: 'virtuals',
    project: 'Chi by Virtuals',
    source: 'Virtuals API #1100',
    virtualsId: 1100,
  },
  {
    address: '0x28276281Ba3e0001931614404D2C6313a79B3925',
    name: 'Mircea Brs',
    framework: 'virtuals',
    project: 'Mircea Brs by Virtuals',
    source: 'Virtuals API #5000',
    virtualsId: 5000,
  },
  {
    address: '0x8340A88e9B3A81F5e638f32b09f4f5e4dF7E49F5',
    name: 'ACT AI',
    framework: 'virtuals',
    project: 'ACT AI by Virtuals',
    source: 'Virtuals API #7000',
    virtualsId: 7000,
  },
  {
    address: '0x9f6971f905D582167D30281893190ECcb10bf16e',
    name: 'Grey Eth',
    framework: 'virtuals',
    project: 'Grey Eth by Virtuals',
    source: 'Virtuals API #1500',
    virtualsId: 1500,
  },
  {
    address: '0xf682b3203523419aC637ca2c6aa0b71dEebF91c3',
    name: 'Takeshi Kurosawa',
    framework: 'virtuals',
    project: 'Takeshi by Virtuals',
    source: 'Virtuals API #1050',
    virtualsId: 1050,
  },
  {
    address: '0xA7706732Ed7a13e5934408638a5E67306CD58Ce4',
    name: 'TeacherAI',
    framework: 'virtuals',
    project: 'TeacherAI by Virtuals',
    source: 'Virtuals API #2000',
    virtualsId: 2000,
  },
  {
    address: '0xC1A2f762F67aF72FD05e79afa23F8358A4d7dbaF',
    name: '$TRUST ME BROs',
    framework: 'virtuals',
    project: 'TRUST by Virtuals',
    source: 'Virtuals API #9042',
    virtualsId: 9042,
  },
  {
    address: '0xEC1Ee38e3e451A979bD0232be188C606D0ce0E13',
    name: 'NANCYPELOSI',
    framework: 'virtuals',
    project: 'NANCYPELOSI by Virtuals',
    source: 'Virtuals API #2200',
    virtualsId: 2200,
  },
  {
    address: '0x6fA793962994ff07b35048a216d1d813D725fa37',
    name: 'ArAIstotle',
    framework: 'virtuals',
    project: 'FACY by Virtuals',
    source: 'Virtuals API #35498',
    virtualsId: 35498,
  },
  {
    address: '0x17Fd460a86bB57FcBf0062d3AFe199eB54d657E0',
    name: 'Ghislaine Dedoldia',
    framework: 'virtuals',
    project: 'Ghislaine by Virtuals',
    source: 'Virtuals API #400',
    virtualsId: 400,
  },
  {
    address: '0xf1E9278C61076eE52859c53fec2693FBB150C062',
    name: 'TAOCat',
    framework: 'virtuals',
    project: 'TAOCat by Virtuals',
    source: 'Virtuals API #15546',
    virtualsId: 15546,
  },
  {
    address: '0x53AbfbBE8b3B210134f42e126DF642849bA05277',
    name: 'Solace',
    framework: 'virtuals',
    project: 'Solace by Virtuals',
    source: 'Virtuals API #25648',
    virtualsId: 25648,
  },
  {
    address: '0x0a5Ff24969EDA4905E26961707cbBD05593a7146',
    name: 'Ape AI',
    framework: 'virtuals',
    project: 'Ape AI by Virtuals',
    source: 'Virtuals API #950',
    virtualsId: 950,
  },
  {
    address: '0xE7B082A7Dfe95a8DD2c8738041a73Ffd23fBAA10',
    name: 'nftxbt',
    framework: 'virtuals',
    project: 'nftxbt by Virtuals',
    source: 'Virtuals API #8401',
    virtualsId: 8401,
  },
  {
    address: '0xc8eb51949dC9536d2d5910F20b789aC6CA446810',
    name: 'Satoshi AI',
    framework: 'virtuals',
    project: 'SAINT by Virtuals',
    source: 'Virtuals API #2047',
    virtualsId: 2047,
  },
  {
    address: '0x34A3C816AF70C4Cf8597Ad5E6fFAa83E962a0605',
    name: 'KOLscan',
    framework: 'virtuals',
    project: 'KOLscan by Virtuals',
    source: 'Virtuals API #7335',
    virtualsId: 7335,
  },
  {
    address: '0xf138d76669f3ad191340E57F2d4B5f59d4819423',
    name: 'Degen Dave',
    framework: 'virtuals',
    project: 'Degen Dave by Virtuals',
    source: 'Virtuals API #900',
    virtualsId: 900,
  },
  {
    address: '0x5E53Bc4b3F0738c3FE9009E377C7E6eB4Cb35897',
    name: 'Seraph',
    framework: 'virtuals',
    project: 'Seraph by Virtuals',
    source: 'Virtuals API #12398',
    virtualsId: 12398,
  },
  {
    address: '0xf3885cb44B7303D8F743359EA2C4Cd35666832a6',
    name: 'Misato',
    framework: 'virtuals',
    project: 'Misato by Virtuals',
    source: 'Virtuals API #657',
    virtualsId: 657,
  },

  // ── Tier 3: Active agents (25-100 txs) ────────────────────────────
  {
    address: '0x4baADbA26C3C0bdEf9E8fAf173925d463aA53BB2',
    name: 'Acolyt',
    framework: 'virtuals',
    project: 'Acolyt by Virtuals',
    source: 'Virtuals API #12944',
    virtualsId: 12944,
  },
  {
    address: '0x12C1255c35A7F6afC3fedd16A6a44Edc213B9F7B',
    name: 'Trevor Philips',
    framework: 'virtuals',
    project: 'Trevor by Virtuals',
    source: 'Virtuals API #274',
    virtualsId: 274,
  },
  {
    address: '0x29F9F467DD3A9111c566d290f1999C5C255cE261',
    name: 'Pharmachain AI',
    framework: 'virtuals',
    project: 'PHAI by Virtuals',
    source: 'Virtuals API #36589',
    virtualsId: 36589,
  },
  {
    address: '0xC82711a2Eef450704447D5596ff27F4DB971e165',
    name: 'Gigabrain',
    framework: 'virtuals',
    project: 'BRAIN by Virtuals',
    source: 'Virtuals API #18114',
    virtualsId: 18114,
  },
  {
    address: '0xF8a45f00418470EA54Fb7627C1a802BCbD87971f',
    name: 'Pixie',
    framework: 'virtuals',
    project: 'Pixie by Virtuals',
    source: 'Virtuals API #500',
    virtualsId: 500,
  },
  {
    address: '0x2cA28F2b94b1B11858a5A540636b5BCb28C6a8f7',
    name: 'SAM',
    framework: 'virtuals',
    project: 'SAM by Virtuals',
    source: 'Virtuals API #2500',
    virtualsId: 2500,
  },
  {
    address: '0xa3003CF209afbAa656CA35930D37059824b4922E',
    name: 'zuck',
    framework: 'virtuals',
    project: 'zuck by Virtuals',
    source: 'Virtuals API #2100',
    virtualsId: 2100,
  },
  {
    address: '0x52FdA0056F04AD93177B2884Fb58607839C71a60',
    name: 'Nuwa World',
    framework: 'virtuals',
    project: 'Nuwa by Virtuals',
    source: 'Virtuals API #37251',
    virtualsId: 37251,
  },
  {
    address: '0xA0477b2705829F355a08a436A4AE061917A2D281',
    name: 'Mechanic Cat',
    framework: 'virtuals',
    project: 'MECCAT by Virtuals',
    source: 'Virtuals API #1150',
    virtualsId: 1150,
  },
  {
    address: '0x1eB65117D2e5Ba58CfdB078F8063836CE1337C5a',
    name: 'FeVerAI',
    framework: 'virtuals',
    project: 'FeVerAI by Virtuals',
    source: 'Virtuals API #10000',
    virtualsId: 10000,
  },
  {
    address: '0x660763A04736D9eF6c9128351a6173026039E35B',
    name: 'Decentra Degen',
    framework: 'virtuals',
    project: 'Decentra Degen by Virtuals',
    source: 'Virtuals API #1200',
    virtualsId: 1200,
  },
  {
    address: '0x80a8F11201Bc1962D0Dfff0a5B9C49B14bb2b7c2',
    name: 'Ribbita',
    framework: 'virtuals',
    project: 'Ribbita by Virtuals',
    source: 'Virtuals API #18820',
    virtualsId: 18820,
  },
  {
    address: '0xd96936901F8F33E35A6Fd1bCFE9E5A90B53816f9',
    name: 'Backroom',
    framework: 'virtuals',
    project: 'Backroom Protocol',
    source: 'Virtuals API #30676',
    virtualsId: 30676,
  },

  // ── Our own agent ─────────────────────────────────────────────────
  {
    address: '0x670d6fB01E1F220fc93F8615f694327589EdF8Eb',
    name: 'Aerodrome Rebalancer',
    framework: 'custom',
    project: 'Aerodrome',
    source: 'Internal',
    agentType: 'defi',
  },
];

async function seed() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('DATABASE_URL is required');
    process.exit(1);
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

    for (const agent of OBSERVATORY_AGENTS) {
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
          'virtuals',
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
    console.log(`Total: ${OBSERVATORY_AGENTS.length} agents configured`);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

seed();
