/**
 * Known Contracts Seed Data
 *
 * Major DeFi protocols on Base chain. Used by protocolResolver to tag
 * transactions with protocol_name for observatory analytics.
 *
 * Run: npx tsx packages/db/seeds/known-contracts.ts
 */

import postgres from 'postgres';

interface KnownContract {
  chain: string;
  contractAddress: string;
  protocolName: string;
  contractLabel: string;
}

const KNOWN_CONTRACTS: KnownContract[] = [
  // ── Aerodrome (Base-native DEX, #1 by TVL) ────────────────────────────
  {
    chain: 'base',
    contractAddress: '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43',
    protocolName: 'Aerodrome',
    contractLabel: 'Router',
  },
  {
    chain: 'base',
    contractAddress: '0x420DD381b31aEf6683db6B902084cB0FFECe40Da',
    protocolName: 'Aerodrome',
    contractLabel: 'Voter',
  },
  {
    chain: 'base',
    contractAddress: '0x940181a94A35A4569E4529A3CDfB74e38FD98631',
    protocolName: 'Aerodrome',
    contractLabel: 'AERO Token',
  },

  // ── Uniswap V3 ────────────────────────────────────────────────────────
  {
    chain: 'base',
    contractAddress: '0x2626664c2603336E57B271c5C0b26F421741e481',
    protocolName: 'Uniswap V3',
    contractLabel: 'SwapRouter02',
  },
  {
    chain: 'base',
    contractAddress: '0x33128a8fC17869897dcE68Ed026d694621f6FDfD',
    protocolName: 'Uniswap V3',
    contractLabel: 'Factory',
  },
  {
    chain: 'base',
    contractAddress: '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a',
    protocolName: 'Uniswap V3',
    contractLabel: 'NonfungiblePositionManager',
  },
  {
    chain: 'base',
    contractAddress: '0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24',
    protocolName: 'Uniswap V2',
    contractLabel: 'Router02',
  },

  // ── Aave V3 ────────────────────────────────────────────────────────────
  {
    chain: 'base',
    contractAddress: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
    protocolName: 'Aave V3',
    contractLabel: 'Pool',
  },
  {
    chain: 'base',
    contractAddress: '0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D',
    protocolName: 'Aave V3',
    contractLabel: 'PoolAddressesProvider',
  },

  // ── Compound III (Comet) ───────────────────────────────────────────────
  {
    chain: 'base',
    contractAddress: '0xb125E6687d4313864e53df431d5425969c15Eb2F',
    protocolName: 'Compound III',
    contractLabel: 'cUSDCv3',
  },
  {
    chain: 'base',
    contractAddress: '0x46e6b214b524310239732D51387075E0e70970bf',
    protocolName: 'Compound III',
    contractLabel: 'cWETHv3',
  },

  // ── Moonwell ───────────────────────────────────────────────────────────
  {
    chain: 'base',
    contractAddress: '0xfBb21d0380beE3312B33c4353c8936a0F13EF26C',
    protocolName: 'Moonwell',
    contractLabel: 'Comptroller',
  },
  {
    chain: 'base',
    contractAddress: '0x628ff693426583D9a7FB391E54366292F509D457',
    protocolName: 'Moonwell',
    contractLabel: 'mWETH',
  },
  {
    chain: 'base',
    contractAddress: '0xEdc817A28E8B93B03976FBd4a3dDBc9f7D176c22',
    protocolName: 'Moonwell',
    contractLabel: 'mUSDbC',
  },

  // ── Morpho ─────────────────────────────────────────────────────────────
  {
    chain: 'base',
    contractAddress: '0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb',
    protocolName: 'Morpho',
    contractLabel: 'Morpho Blue',
  },

  // ── Virtuals Protocol ──────────────────────────────────────────────────
  {
    chain: 'base',
    contractAddress: '0x0512A8ecE58F96710DFC97EF9C0E5a6DDd4C5409',
    protocolName: 'Virtuals Protocol',
    contractLabel: 'FunTokenFactory (Bonding)',
  },
  {
    chain: 'base',
    contractAddress: '0xF66DeA7b3e897cD44A5a231c61B6B4423dAe7862',
    protocolName: 'Virtuals Protocol',
    contractLabel: 'VIRTUAL Token',
  },

  // ── 1inch ──────────────────────────────────────────────────────────────
  {
    chain: 'base',
    contractAddress: '0x1111111254EEB25477B68fb85Ed929f73A960582',
    protocolName: '1inch',
    contractLabel: 'AggregationRouterV5',
  },

  // ── 0x / Matcha ────────────────────────────────────────────────────────
  {
    chain: 'base',
    contractAddress: '0xDef1C0ded9bec7F1a1670819833240f027b25EfF',
    protocolName: '0x',
    contractLabel: 'ExchangeProxy',
  },

  // ── Stargate (LayerZero bridge) ────────────────────────────────────────
  {
    chain: 'base',
    contractAddress: '0x45f1A95A4D3f3836523F5c83673c797f4d4d263B',
    protocolName: 'Stargate',
    contractLabel: 'StargatePoolNative (ETH)',
  },

  // ── Across (bridge) ───────────────────────────────────────────────────
  {
    chain: 'base',
    contractAddress: '0x09aea4b2242abC8bb4BB78D537A67a245A7bEC64',
    protocolName: 'Across',
    contractLabel: 'SpokePool',
  },

  // ── Wormhole (bridge) ─────────────────────────────────────────────────
  {
    chain: 'base',
    contractAddress: '0xbEbdb6C8ddC678FfA9f8748f85C815C556Dd8239',
    protocolName: 'Wormhole',
    contractLabel: 'TokenBridge',
  },

  // ── Base Names (ENS on Base) ──────────────────────────────────────────
  {
    chain: 'base',
    contractAddress: '0x4cCb0720cd023bfAb21A3D73B006efCaC3B88278',
    protocolName: 'Base Names',
    contractLabel: 'RegistrarController',
  },

  // ── KyberSwap ─────────────────────────────────────────────────────────
  {
    chain: 'base',
    contractAddress: '0x6131B5fae19EA4f9D964eAc0408E4408b66337b5',
    protocolName: 'KyberSwap',
    contractLabel: 'Meta Aggregation Router v2',
  },

  // ── PancakeSwap ──────────────────────────────────────────────────────
  {
    chain: 'base',
    contractAddress: '0x13f4EA83D0bd40E75C8222255bc855a974568Dd4',
    protocolName: 'PancakeSwap',
    contractLabel: 'SmartRouter',
  },
  {
    chain: 'base',
    contractAddress: '0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865',
    protocolName: 'PancakeSwap',
    contractLabel: 'V3 Factory',
  },

  // ── SushiSwap ────────────────────────────────────────────────────────
  {
    chain: 'base',
    contractAddress: '0xf2614A233c7C3e7f08b1F887Ba133a13f1eb2c55',
    protocolName: 'SushiSwap',
    contractLabel: 'RouteProcessor4',
  },

  // ── Balancer ─────────────────────────────────────────────────────────
  {
    chain: 'base',
    contractAddress: '0xBA12222222228d8Ba445958a75a0704d566BF2C8',
    protocolName: 'Balancer',
    contractLabel: 'Vault',
  },

  // ── Curve ────────────────────────────────────────────────────────────
  {
    chain: 'base',
    contractAddress: '0x11C907CeCe2c4aB22A2980dDD1943E0a1B3F42bE',
    protocolName: 'Curve',
    contractLabel: 'Router',
  },

  // ── OpenOcean ────────────────────────────────────────────────────────
  {
    chain: 'base',
    contractAddress: '0x6352a56caadc4f1e25cd6c75970fa768a3304e64',
    protocolName: 'OpenOcean',
    contractLabel: 'Exchange V2',
  },

  // ── ParaSwap ─────────────────────────────────────────────────────────
  {
    chain: 'base',
    contractAddress: '0xDEF171Fe48CF0115B1d80b88dc8eAB59176FEe57',
    protocolName: 'ParaSwap',
    contractLabel: 'Augustus V6',
  },

  // ── Odos ─────────────────────────────────────────────────────────────
  {
    chain: 'base',
    contractAddress: '0x19cEeAd7105607Cd444F5ad10dd51356436095a1',
    protocolName: 'Odos',
    contractLabel: 'Router V2',
  },

  // ── BaseSwap ─────────────────────────────────────────────────────────
  {
    chain: 'base',
    contractAddress: '0x327Df1E6de05895d2ab08513aaDD9313Fe505d86',
    protocolName: 'BaseSwap',
    contractLabel: 'Router',
  },
  {
    chain: 'base',
    contractAddress: '0xFDa619b6d20975be80A10332cD39b9a4b0FAa8BB',
    protocolName: 'BaseSwap',
    contractLabel: 'Factory',
  },

  // ── SwapBased ────────────────────────────────────────────────────────
  {
    chain: 'base',
    contractAddress: '0xaaa3b1F1bd7BCc97fD1917c18ADE665C5D31F066',
    protocolName: 'SwapBased',
    contractLabel: 'UniswapV2Router02',
  },
  {
    chain: 'base',
    contractAddress: '0x756C6BbDd915202adac7beBB1c6C89aC0886503f',
    protocolName: 'SwapBased',
    contractLabel: 'V3 Router',
  },

  // ── Velodrome ────────────────────────────────────────────────────────
  {
    chain: 'base',
    contractAddress: '0xcDAC0d6c6C59727a65F871236188350531885C43',
    protocolName: 'Velodrome',
    contractLabel: 'Router',
  },

  // ── Seamless Protocol ────────────────────────────────────────────────
  {
    chain: 'base',
    contractAddress: '0x8F44Fd754285aa6A2b8B9B97739B79746e0475a7',
    protocolName: 'Seamless',
    contractLabel: 'Pool',
  },
  {
    chain: 'base',
    contractAddress: '0x1c7a460413dD4e964f96D8dFC56E7223cE88CD85',
    protocolName: 'Seamless',
    contractLabel: 'SEAM Token',
  },

  // ── Common tokens ─────────────────────────────────────────────────────
  {
    chain: 'base',
    contractAddress: '0x4200000000000000000000000000000000000006',
    protocolName: 'WETH',
    contractLabel: 'Wrapped Ether',
  },
  {
    chain: 'base',
    contractAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    protocolName: 'USDC',
    contractLabel: 'USD Coin (native)',
  },
  {
    chain: 'base',
    contractAddress: '0xd9aAEc86B65D86f6A7B5B1b0c42FFA531710b6CA',
    protocolName: 'USDbC',
    contractLabel: 'USD Coin (bridged)',
  },
  {
    chain: 'base',
    contractAddress: '0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb',
    protocolName: 'DAI',
    contractLabel: 'Dai Stablecoin',
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
    let inserted = 0;

    for (const contract of KNOWN_CONTRACTS) {
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
