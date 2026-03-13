/**
 * Observatory Agent Seed Data
 *
 * Verified AI agent operator wallets on Base, sourced from:
 * - Virtuals Protocol API (api2.virtuals.io) — walletAddress + sentientWalletAddress
 * - Olas/Autonolas service registry on Base
 * - Basescan labeled accounts (trading bots, DEX routers)
 * - Known DeFi agent/bot contracts
 *
 * Holder counts verified 2026-03-13 via Virtuals API.
 * Agents with <200 holders removed as likely inactive.
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
  // ════════════════════════════════════════════════════════════════════
  // Tier 1: Headline Virtuals agents (top market cap, 100K+ holders)
  // ════════════════════════════════════════════════════════════════════
  {
    address: '0x8DFb37AaE4f8fCbD1f90015A9e75b48F50Fd9f59',
    name: 'AIXBT',
    framework: 'virtuals',
    project: 'AIXBT by Virtuals',
    source: 'Virtuals API #1199 (walletAddress, 413K holders)',
    virtualsId: 1199,
  },
  {
    address: '0x0D177181E3763B20D47DC3a72dD584368BD8bF43',
    name: 'Luna',
    framework: 'virtuals',
    project: 'Luna by Virtuals',
    source: 'Virtuals API #68 (sentientWalletAddress, 457K holders)',
    virtualsId: 68,
  },
  {
    address: '0x8eac1F5F6Cd8Cb92dE1b33160Ed2BF226270BC76',
    name: 'VaderAI',
    framework: 'virtuals',
    project: 'VaderAI by Virtuals',
    source: 'Virtuals API #896 (walletAddress, 228K holders)',
    virtualsId: 896,
  },
  {
    address: '0xD38493119859b8806ff28C32c41fdd67Ef41b8Ef',
    name: 'G.A.M.E',
    framework: 'virtuals',
    project: 'GAME by Virtuals',
    source: 'Virtuals API #273 (walletAddress, 282K holders)',
    virtualsId: 273,
  },
  {
    address: '0x062e1DC8d0aB6Ec4EA7B9D2CF18cC439dCcd7C2B',
    name: 'FewShot (Sekoia)',
    framework: 'virtuals',
    project: 'Sekoia by Virtuals',
    source: 'Virtuals API #743 (walletAddress, 171K holders)',
    virtualsId: 743,
  },
  {
    address: '0x140591903f35375AA78B01272882C2De3AeFE21c',
    name: 'Iona',
    framework: 'virtuals',
    project: 'Iona by Virtuals (AI-DOL)',
    source: 'Virtuals API #69 (walletAddress, 99K holders)',
    virtualsId: 69,
  },
  {
    address: '0x5E53Bc4b3F0738c3FE9009E377C7E6eB4Cb35897',
    name: 'Seraph',
    framework: 'virtuals',
    project: 'Seraph by Virtuals',
    source: 'Virtuals API #12398 (walletAddress, 124K holders)',
    virtualsId: 12398,
  },
  {
    address: '0xc8eb51949dC9536d2d5910F20b789aC6CA446810',
    name: 'Satoshi AI',
    framework: 'virtuals',
    project: 'SAINT by Virtuals',
    source: 'Virtuals API #2047 (walletAddress, 101K holders)',
    virtualsId: 2047,
  },
  {
    address: '0xE7B082A7Dfe95a8DD2c8738041a73Ffd23fBAA10',
    name: 'nftxbt',
    framework: 'virtuals',
    project: 'nftxbt by Virtuals',
    source: 'Virtuals API #8401 (walletAddress, 101K holders)',
    virtualsId: 8401,
  },
  {
    address: '0x2cA28F2b94b1B11858a5A540636b5BCb28C6a8f7',
    name: 'SAM',
    framework: 'virtuals',
    project: 'SAM by Virtuals',
    source: 'Virtuals API #2500 (walletAddress, 93K holders)',
    virtualsId: 2500,
  },
  {
    address: '0xC1A2f762F67aF72FD05e79afa23F8358A4d7dbaF',
    name: '$TRUST ME BROs',
    framework: 'virtuals',
    project: 'TRUST by Virtuals',
    source: 'Virtuals API #9042 (walletAddress, 83K holders)',
    virtualsId: 9042,
  },

  // ════════════════════════════════════════════════════════════════════
  // Tier 2: Virtuals agents with sentient wallets (on-chain active)
  // These have dedicated autonomous wallets that transact on-chain
  // ════════════════════════════════════════════════════════════════════
  {
    address: '0x6a30a843efC24fEC1C7bf81cfcD72410d5163246',
    name: 'Ribbita',
    framework: 'virtuals',
    project: 'Ribbita by Virtuals',
    source: 'Virtuals API #18820 (sentientWalletAddress, 70K holders, $207M mcap)',
    virtualsId: 18820,
  },
  {
    address: '0x6b0d2C609675F4CA7d57d37145e9A256d254338A',
    name: 'TAOCat',
    framework: 'virtuals',
    project: 'TAOCat by Virtuals',
    source: 'Virtuals API #15546 (sentientWalletAddress, 116K holders)',
    virtualsId: 15546,
  },
  {
    address: '0xC18be31dd9F5a0F75f4da9b4A23A3fDFe3464171',
    name: 'Acolyt',
    framework: 'virtuals',
    project: 'Acolyt by Virtuals',
    source: 'Virtuals API #12944 (sentientWalletAddress, 110K holders)',
    virtualsId: 12944,
  },
  {
    address: '0xa3d23244338f33C6c7a58fCa1e5D68ee857D424e',
    name: 'Ethy AI',
    framework: 'virtuals',
    project: 'Ethy AI by Virtuals',
    source: 'Virtuals API #19520 (sentientWalletAddress, 13K holders, $85K vol/24h)',
    virtualsId: 19520,
  },
  {
    address: '0x680923B163679e0b0bb5907a266521f014173738',
    name: 'Agent YP',
    framework: 'virtuals',
    project: 'Agent YP by Virtuals',
    source: 'Virtuals API #14722 (sentientWalletAddress, 73K holders)',
    virtualsId: 14722,
  },
  {
    address: '0x20e551D0E60496ca891e1C8ECCdEF92567b84260',
    name: 'Gigabrain',
    framework: 'virtuals',
    project: 'BRAIN by Virtuals',
    source: 'Virtuals API #18114 (sentientWalletAddress, 40K holders)',
    virtualsId: 18114,
  },
  {
    address: '0xCE85939c7fCe938348376BaBf404db8E3643C0EE',
    name: 'Solace',
    framework: 'virtuals',
    project: 'Solace by Virtuals',
    source: 'Virtuals API #25648 (sentientWalletAddress, 46K holders)',
    virtualsId: 25648,
  },
  {
    address: '0x30b91c50a03aF6eDD7693fCAEf629cE6044b079b',
    name: 'ArAIstotle',
    framework: 'virtuals',
    project: 'FACY by Virtuals',
    source: 'Virtuals API #35498 (sentientWalletAddress, 28K holders)',
    virtualsId: 35498,
  },
  {
    address: '0x1bC4FA0C9dCd5C6D4c1e42cA80e2F3abaC9966Da',
    name: 'Backroom',
    framework: 'virtuals',
    project: 'Backroom Protocol',
    source: 'Virtuals API #30676 (sentientWalletAddress, 21K holders)',
    virtualsId: 30676,
  },
  {
    address: '0x87DCc8E06B736D323Fac0D6FAe50f57A6327DFC4',
    name: 'Nuwa World',
    framework: 'virtuals',
    project: 'Nuwa by Virtuals',
    source: 'Virtuals API #37251 (sentientWalletAddress, 6K holders)',
    virtualsId: 37251,
  },
  {
    address: '0x6D06711a4C58e71b21E0cBED7743e49ECe16D4fa',
    name: 'Pharmachain AI',
    framework: 'virtuals',
    project: 'PHAI by Virtuals',
    source: 'Virtuals API #36589 (sentientWalletAddress, 4K holders)',
    virtualsId: 36589,
  },
  {
    address: '0x5d24063ce77a5821Eae3C4B8e00499dB180e3Ba0',
    name: 'KOLscan',
    framework: 'virtuals',
    project: 'KOLscan by Virtuals',
    source: 'Virtuals API #7335 (sentientWalletAddress, 4K holders)',
    virtualsId: 7335,
  },

  // ════════════════════════════════════════════════════════════════════
  // Tier 3: Virtuals agents — walletAddress (no sentient wallet)
  // Still popular by holder count / market cap
  // ════════════════════════════════════════════════════════════════════
  {
    address: '0x80a8F11201Bc1962D0Dfff0a5B9C49B14bb2b7c2',
    name: 'Ribbita (operator)',
    framework: 'virtuals',
    project: 'Ribbita by Virtuals',
    source: 'Virtuals API #18820 (walletAddress)',
    virtualsId: 18820,
  },
  {
    address: '0xf1E9278C61076eE52859c53fec2693FBB150C062',
    name: 'TAOCat (operator)',
    framework: 'virtuals',
    project: 'TAOCat by Virtuals',
    source: 'Virtuals API #15546 (walletAddress)',
    virtualsId: 15546,
  },
  {
    address: '0x4baADbA26C3C0bdEf9E8fAf173925d463aA53BB2',
    name: 'Acolyt (operator)',
    framework: 'virtuals',
    project: 'Acolyt by Virtuals',
    source: 'Virtuals API #12944 (walletAddress)',
    virtualsId: 12944,
  },
  {
    address: '0xf3885cb44B7303D8F743359EA2C4Cd35666832a6',
    name: 'Misato',
    framework: 'virtuals',
    project: 'Misato by Virtuals',
    source: 'Virtuals API #657 (walletAddress, 67K holders)',
    virtualsId: 657,
  },
  {
    address: '0x52Af56e5811A3456981a09A704B20Ba5Da0Dbf67',
    name: 'Axelrod',
    framework: 'virtuals',
    project: 'Axelrod by Virtuals',
    source: 'Virtuals API #22564 (walletAddress, 27K holders)',
    virtualsId: 22564,
  },
  {
    address: '0xe0865fFca21a8f120a80997CBbDBa8C92cac5697',
    name: 'Ethy AI (operator)',
    framework: 'virtuals',
    project: 'Ethy AI by Virtuals',
    source: 'Virtuals API #19520 (walletAddress)',
    virtualsId: 19520,
  },
  {
    address: '0xf8B12Bbb4Cb5B320f53B4a3A2D808e677488a190',
    name: 'Agent YP (operator)',
    framework: 'virtuals',
    project: 'Agent YP by Virtuals',
    source: 'Virtuals API #14722 (walletAddress)',
    virtualsId: 14722,
  },
  {
    address: '0xC82711a2Eef450704447D5596ff27F4DB971e165',
    name: 'Gigabrain (operator)',
    framework: 'virtuals',
    project: 'BRAIN by Virtuals',
    source: 'Virtuals API #18114 (walletAddress)',
    virtualsId: 18114,
  },
  {
    address: '0x53AbfbBE8b3B210134f42e126DF642849bA05277',
    name: 'Solace (operator)',
    framework: 'virtuals',
    project: 'Solace by Virtuals',
    source: 'Virtuals API #25648 (walletAddress)',
    virtualsId: 25648,
  },
  {
    address: '0x6fA793962994ff07b35048a216d1d813D725fa37',
    name: 'ArAIstotle (operator)',
    framework: 'virtuals',
    project: 'FACY by Virtuals',
    source: 'Virtuals API #35498 (walletAddress)',
    virtualsId: 35498,
  },
  {
    address: '0xd96936901F8F33E35A6Fd1bCFE9E5A90B53816f9',
    name: 'Backroom (operator)',
    framework: 'virtuals',
    project: 'Backroom Protocol',
    source: 'Virtuals API #30676 (walletAddress)',
    virtualsId: 30676,
  },
  {
    address: '0x52FdA0056F04AD93177B2884Fb58607839C71a60',
    name: 'Nuwa World (operator)',
    framework: 'virtuals',
    project: 'Nuwa by Virtuals',
    source: 'Virtuals API #37251 (walletAddress)',
    virtualsId: 37251,
  },
  {
    address: '0x29F9F467DD3A9111c566d290f1999C5C255cE261',
    name: 'Pharmachain AI (operator)',
    framework: 'virtuals',
    project: 'PHAI by Virtuals',
    source: 'Virtuals API #36589 (walletAddress)',
    virtualsId: 36589,
  },
  {
    address: '0x34A3C816AF70C4Cf8597Ad5E6fFAa83E962a0605',
    name: 'KOLscan (operator)',
    framework: 'virtuals',
    project: 'KOLscan by Virtuals',
    source: 'Virtuals API #7335 (walletAddress)',
    virtualsId: 7335,
  },
  {
    address: '0x1Fb2f7ce91391F24659AD86E9a8C3ce8bfFb3Ef6',
    name: 'ai16z',
    framework: 'virtuals',
    project: 'ai16z by Virtuals',
    source: 'Virtuals API #750 (walletAddress)',
    virtualsId: 750,
  },

  // ════════════════════════════════════════════════════════════════════
  // Olas / Autonolas autonomous agent infrastructure on Base
  // ════════════════════════════════════════════════════════════════════
  {
    address: '0x3C1fF68f5aa342D296d4DEe4Bb1cACCA912D95fE',
    name: 'Olas Service Registry (Base)',
    framework: 'olas',
    project: 'Olas / Autonolas',
    source: 'Olas docs (ServiceRegistryL2 on Base)',
    agentType: 'utility',
  },
  {
    address: '0x34C895f302D0b5cf52ec0Edd3945321EB0f83dd5',
    name: 'Olas Token Utility (Base)',
    framework: 'olas',
    project: 'Olas / Autonolas',
    source: 'Olas docs (ServiceRegistryTokenUtility on Base)',
    agentType: 'utility',
  },
  {
    address: '0x63e66d7ad413C01A7b49C7FF4e3Bb765C4E4bd1b',
    name: 'Olas Service Manager (Base)',
    framework: 'olas',
    project: 'Olas / Autonolas',
    source: 'Olas docs (ServiceManagerToken on Base)',
    agentType: 'utility',
  },

  // ════════════════════════════════════════════════════════════════════
  // Additional Virtuals agent operator wallets
  // These are agents with moderate holder counts but active on-chain
  // ════════════════════════════════════════════════════════════════════
  {
    address: '0x12C1255c35A7F6afC3fedd16A6a44Edc213B9F7B',
    name: 'Trevor Philips',
    framework: 'virtuals',
    project: 'Trevor by Virtuals',
    source: 'Virtuals API #274 (walletAddress)',
    virtualsId: 274,
  },
  {
    address: '0x17Fd460a86bB57FcBf0062d3AFe199eB54d657E0',
    name: 'Ghislaine Dedoldia',
    framework: 'virtuals',
    project: 'Ghislaine by Virtuals',
    source: 'Virtuals API #400 (walletAddress)',
    virtualsId: 400,
  },
  {
    address: '0xF8a45f00418470EA54Fb7627C1a802BCbD87971f',
    name: 'Pixie',
    framework: 'virtuals',
    project: 'Pixie by Virtuals',
    source: 'Virtuals API #500 (walletAddress)',
    virtualsId: 500,
  },
  {
    address: '0x0a5Ff24969EDA4905E26961707cbBD05593a7146',
    name: 'Ape AI',
    framework: 'virtuals',
    project: 'Ape AI by Virtuals',
    source: 'Virtuals API #950 (walletAddress)',
    virtualsId: 950,
  },
  {
    address: '0xf138d76669f3ad191340E57F2d4B5f59d4819423',
    name: 'Degen Dave',
    framework: 'virtuals',
    project: 'Degen Dave by Virtuals',
    source: 'Virtuals API #900 (walletAddress)',
    virtualsId: 900,
  },
  {
    address: '0x660763A04736D9eF6c9128351a6173026039E35B',
    name: 'Decentra Degen',
    framework: 'virtuals',
    project: 'Decentra Degen by Virtuals',
    source: 'Virtuals API #1200 (walletAddress)',
    virtualsId: 1200,
  },
  {
    address: '0x1eB65117D2e5Ba58CfdB078F8063836CE1337C5a',
    name: 'FeVerAI',
    framework: 'virtuals',
    project: 'FeVerAI by Virtuals',
    source: 'Virtuals API #10000 (walletAddress)',
    virtualsId: 10000,
  },

  // ════════════════════════════════════════════════════════════════════
  // Our own agent
  // ════════════════════════════════════════════════════════════════════
  {
    address: '0x670d6fB01E1F220fc93F8615f694327589EdF8Eb',
    name: 'ChainWard Rebalancer',
    framework: 'custom',
    project: 'ChainWard',
    source: 'Internal (swap agent v2)',
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
    console.log(`Total: ${OBSERVATORY_AGENTS.length} agents configured`);
  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

seed();
