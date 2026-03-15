/**
 * Observatory Agent Seed Data
 *
 * Verified AI agent operator wallets on Base, sourced from:
 * - Virtuals Protocol API (api2.virtuals.io) — walletAddress + sentientWalletAddress
 * - Olas/Autonolas service registry on Base
 * - Basescan labeled accounts (trading bots, DEX routers)
 * - Known DeFi agent/bot contracts
 *
 * Holder counts verified 2026-03-14 via Virtuals API.
 * Expanded to 148 agents via bulk Virtuals API discovery (2026-03-14).
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
  // Discovered: Sentient wallets (autonomous on-chain agents)
  // Added 2026-03-14 via Virtuals API bulk discovery
  // ════════════════════════════════════════════════════════════════════
  {
    address: '0x6b07f51dE3f7bcDe651B9073d2a69cc3260d11f3',
    name: '1000x',
    framework: 'virtuals',
    project: '1000x by Virtuals',
    source: 'Virtuals API #14910 (sentientWalletAddress, 82,832 holders)',
    virtualsId: 14910,
  },
  {
    address: '0xaf59Dc42A7D05878c0f3B2020f2F2Bc038641877',
    name: 'DORA AI',
    framework: 'virtuals',
    project: 'DORA AI by Virtuals',
    source: 'Virtuals API #15240 (sentientWalletAddress, 80,674 holders)',
    virtualsId: 15240,
  },
  {
    address: '0x16f174B510A784895fe76433aE729CA5ed8DBD53',
    name: '0xMonk',
    framework: 'virtuals',
    project: '0xMonk by Virtuals',
    source: 'Virtuals API #19280 (sentientWalletAddress, 56,127 holders)',
    virtualsId: 19280,
  },
  {
    address: '0x609B654eb6664A2e7b005f7dc79D6af0Cf9c954f',
    name: 'S.A.N.T.A by Virtuals',
    framework: 'virtuals',
    project: 'S.A.N.T.A by Virtuals',
    source: 'Virtuals API #15734 (sentientWalletAddress, 37,136 holders)',
    virtualsId: 15734,
  },
  {
    address: '0xF068155A9a1160E0f21423d739a8e236bF117200',
    name: 'Based Mert',
    framework: 'virtuals',
    project: 'Based Mert by Virtuals',
    source: 'Virtuals API #9600 (sentientWalletAddress, 29,105 holders)',
    virtualsId: 9600,
  },
  {
    address: '0xf13EF08A7C8fad01c0898281AcA4D5567b3E5857',
    name: 'Starly the $STAR™ Guide',
    framework: 'virtuals',
    project: 'Starly the $STAR™ Guide by Virtuals',
    source: 'Virtuals API #40850 (sentientWalletAddress, 27,175 holders)',
    virtualsId: 40850,
  },
  {
    address: '0x2f7722BA92Bf6d5988c8d1E957C19C1D6F624733',
    name: 'vAlpha FST bot',
    framework: 'virtuals',
    project: 'vAlpha FST bot by Virtuals',
    source: 'Virtuals API #4969 (sentientWalletAddress, 25,344 holders)',
    virtualsId: 4969,
  },
  {
    address: '0x996e493775A4ED6a755FA048fA0B33dB1574f807',
    name: 'Eye Future',
    framework: 'virtuals',
    project: 'Eye Future by Virtuals',
    source: 'Virtuals API #19050 (sentientWalletAddress, 21,187 holders)',
    virtualsId: 19050,
  },
  {
    address: '0x8230c43144237a6E70b8f701C916dA3BE23fD9a5',
    name: 'Gloria',
    framework: 'virtuals',
    project: 'Gloria by Virtuals',
    source: 'Virtuals API #22418 (sentientWalletAddress, 9,780 holders)',
    virtualsId: 22418,
  },
  {
    address: '0x157CE6676684267e52FB58055E6b0FCc599930db',
    name: 'Fuku',
    framework: 'virtuals',
    project: 'Fuku by Virtuals',
    source: 'Virtuals API #41781 (sentientWalletAddress, 8,302 holders)',
    virtualsId: 41781,
  },
  {
    address: '0x50E4c30D70382ab048A09AD09422Bb3EB52Fc4BF',
    name: 'ReplyCorp',
    framework: 'virtuals',
    project: 'ReplyCorp by Virtuals',
    source: 'Virtuals API #40858 (sentientWalletAddress, 7,898 holders)',
    virtualsId: 40858,
  },
  {
    address: '0xE09f33518Fabe5757CADa54c81E2d85e0dbeF836',
    name: 'VPay',
    framework: 'virtuals',
    project: 'VPay by Virtuals',
    source: 'Virtuals API #29233 (sentientWalletAddress, 7,792 holders)',
    virtualsId: 29233,
  },
  {
    address: '0x0de0C42706FAD7eEca1bb571e1038a24CbBdA869',
    name: 'PRXVT',
    framework: 'virtuals',
    project: 'PRXVT by Virtuals',
    source: 'Virtuals API #40792 (sentientWalletAddress, 7,549 holders)',
    virtualsId: 40792,
  },
  {
    address: '0x203207623999C7ecd248d56257a32245ACa549D9',
    name: 'Zaia',
    framework: 'virtuals',
    project: 'Zaia by Virtuals',
    source: 'Virtuals API #29300 (sentientWalletAddress, 6,776 holders)',
    virtualsId: 29300,
  },
  {
    address: '0x761BFA372e9a58792C98e3539a3c5D7A5512cD06',
    name: 'Waveform',
    framework: 'virtuals',
    project: 'Waveform by Virtuals',
    source: 'Virtuals API #37813 (sentientWalletAddress, 5,457 holders)',
    virtualsId: 37813,
  },
  {
    address: '0x39F8AD7613856CD2E6475db43b42eEc6ECC52b56',
    name: 'BLACK HOLE',
    framework: 'virtuals',
    project: 'BLACK HOLE by Virtuals',
    source: 'Virtuals API #41450 (sentientWalletAddress, 5,292 holders)',
    virtualsId: 41450,
  },
  {
    address: '0x9e6412817F073dD2AEe0416C1BB6E3078eF21cAa',
    name: 'Verdant',
    framework: 'virtuals',
    project: 'Verdant by Virtuals',
    source: 'Virtuals API #23844 (sentientWalletAddress, 4,846 holders)',
    virtualsId: 23844,
  },
  {
    address: '0xdE995A205ed13399cB163D24d06adfdFb258E860',
    name: 'MORSE',
    framework: 'virtuals',
    project: 'MORSE by Virtuals',
    source: 'Virtuals API #41850 (sentientWalletAddress, 4,320 holders)',
    virtualsId: 41850,
  },
  {
    address: '0xCFbA34f90D76200952F8E13340d19ab55Ca2EDe9',
    name: 'GM FM',
    framework: 'virtuals',
    project: 'GM FM by Virtuals',
    source: 'Virtuals API #36700 (sentientWalletAddress, 4,034 holders)',
    virtualsId: 36700,
  },
  {
    address: '0x9242416F59fb02a21d5EF156b13148644540844D',
    name: 'LORA',
    framework: 'virtuals',
    project: 'LORA by Virtuals',
    source: 'Virtuals API #38075 (sentientWalletAddress, 3,184 holders)',
    virtualsId: 38075,
  },
  {
    address: '0xBb084d4db1659408C7FA9C692A0Cdc5542DeEE6e',
    name: 'Lily Turner — The First NSFW AI Agent',
    framework: 'virtuals',
    project: 'Lily Turner — The First NSFW AI Agent by Virtuals',
    source: 'Virtuals API #30550 (sentientWalletAddress, 3,044 holders)',
    virtualsId: 30550,
  },
  {
    address: '0xA8Ee59D5002D0936Eb3C494E072D411b892f5375',
    name: 'azaelite',
    framework: 'virtuals',
    project: 'azaelite by Virtuals',
    source: 'Virtuals API #19240 (sentientWalletAddress, 2,515 holders)',
    virtualsId: 19240,
  },
  {
    address: '0x0D7ce6be6AB2AB2e14d6673D3aE59Ef9073bBdcF',
    name: 'JARVIS AIGENT',
    framework: 'virtuals',
    project: 'JARVIS AIGENT by Virtuals',
    source: 'Virtuals API #28325 (sentientWalletAddress, 2,445 holders)',
    virtualsId: 28325,
  },
  {
    address: '0x9718c8e0afd4Cb7EF1db4205328749d882b44c57',
    name: '10x',
    framework: 'virtuals',
    project: '10x by Virtuals',
    source: 'Virtuals API #43550 (sentientWalletAddress, 2,169 holders)',
    virtualsId: 43550,
  },
  {
    address: '0x43B54c07ec751a5E9a443c38c617615FD69029de',
    name: 'Nemesis AI Trader',
    framework: 'virtuals',
    project: 'Nemesis AI Trader by Virtuals',
    source: 'Virtuals API #28600 (sentientWalletAddress, 2,147 holders)',
    virtualsId: 28600,
  },
  {
    address: '0x43E1d0b48f93D2F362a0aCb375DCA1A58DCD6469',
    name: 'MAFIA AI',
    framework: 'virtuals',
    project: 'MAFIA AI by Virtuals',
    source: 'Virtuals API #25080 (sentientWalletAddress, 1,544 holders)',
    virtualsId: 25080,
  },
  {
    address: '0x6c7e726696860A6da70D4D2d480ceC3C158E2a00',
    name: 'Canza',
    framework: 'virtuals',
    project: 'Canza by Virtuals',
    source: 'Virtuals API #35100 (sentientWalletAddress, 1,181 holders)',
    virtualsId: 35100,
  },
  {
    address: '0x2Fc4C1206F9503415429fe9CA992eD79951cCb4E',
    name: 'Lyra',
    framework: 'virtuals',
    project: 'Lyra by Virtuals',
    source: 'Virtuals API #20075 (sentientWalletAddress, 807 holders)',
    virtualsId: 20075,
  },
  {
    address: '0xEdC83519f2B43084B8F24C83e37933C05D799133',
    name: 'Pro Agent (Old)',
    framework: 'virtuals',
    project: 'Pro Agent (Old) by Virtuals',
    source: 'Virtuals API #20375 (sentientWalletAddress, 755 holders)',
    virtualsId: 20375,
  },
  {
    address: '0x44B951B28fcc651e29800d2C7574894066665F4E',
    name: 'AI INU',
    framework: 'virtuals',
    project: 'AI INU by Virtuals',
    source: 'Virtuals API #35600 (sentientWalletAddress, 732 holders)',
    virtualsId: 35600,
  },
  {
    address: '0x6eC3581F60E3B0C392EED7B8755Ad50f363762E7',
    name: 'Lorra',
    framework: 'virtuals',
    project: 'Lorra by Virtuals',
    source: 'Virtuals API #14400 (sentientWalletAddress, 423 holders)',
    virtualsId: 14400,
  },

  // ════════════════════════════════════════════════════════════════════
  // Discovered: Operator wallets (agent deployer/controller wallets)
  // Added 2026-03-14 via Virtuals API bulk discovery
  // ════════════════════════════════════════════════════════════════════
  {
    address: '0x1122De0928407D6E2323932Ec297365222928480',
    name: 'Toshi',
    framework: 'virtuals',
    project: 'Toshi by Virtuals',
    source: 'Virtuals API #5700 (walletAddress, 1,081,563 holders)',
    virtualsId: 5700,
  },
  {
    address: '0x8d655b1AF80200A6b81E11482fdeA66328b16E05',
    name: 'Athena',
    framework: 'virtuals',
    project: 'Athena by Virtuals',
    source: 'Virtuals API #3803 (walletAddress, 87,512 holders)',
    virtualsId: 3803,
  },
  {
    address: '0xC3046B26F809918DD4756680C9E9D344af6764A6',
    name: 'Velvet Unicorn',
    framework: 'virtuals',
    project: 'Velvet Unicorn by Virtuals',
    source: 'Virtuals API #630 (walletAddress, 83,940 holders)',
    virtualsId: 630,
  },
  {
    address: '0x7A5723a3971e74dcA9fc42A6359C31D0e64e2e3D',
    name: '1000x (operator)',
    framework: 'virtuals',
    project: '1000x by Virtuals',
    source: 'Virtuals API #14910 (walletAddress, 82,832 holders)',
    virtualsId: 14910,
  },
  {
    address: '0xe088c7A62557e3e9823ABD3356b20d187697fBa9',
    name: 'Freya',
    framework: 'virtuals',
    project: 'Freya by Virtuals',
    source: 'Virtuals API #9877 (walletAddress, 82,065 holders)',
    virtualsId: 9877,
  },
  {
    address: '0x24fB0FD3c3A2766C8763a3231829ADF76D155b80',
    name: 'Polytrader',
    framework: 'virtuals',
    project: 'Polytrader by Virtuals',
    source: 'Virtuals API #6348 (walletAddress, 80,899 holders)',
    virtualsId: 6348,
  },
  {
    address: '0xF09ca38783161cd0d3BDFcE28799F09b23894805',
    name: 'DORA AI (operator)',
    framework: 'virtuals',
    project: 'DORA AI by Virtuals',
    source: 'Virtuals API #15240 (walletAddress, 80,674 holders)',
    virtualsId: 15240,
  },
  {
    address: '0x26c158A4CD56d148c554190A95A921d90F00C160',
    name: 'Mamo',
    framework: 'virtuals',
    project: 'Mamo by Virtuals',
    source: 'Virtuals API #25437 (walletAddress, 72,131 holders)',
    virtualsId: 25437,
  },
  {
    address: '0x0b20A97F6e96b19eD0b81856f4f9F2a4c053fC12',
    name: '0xMonk (operator)',
    framework: 'virtuals',
    project: '0xMonk by Virtuals',
    source: 'Virtuals API #19280 (walletAddress, 56,127 holders)',
    virtualsId: 19280,
  },
  {
    address: '0x090cFf46Ed8655673Ef8605126e757EEFB90db7b',
    name: 'S.A.N.T.A by Virtuals (operator)',
    framework: 'virtuals',
    project: 'S.A.N.T.A by Virtuals',
    source: 'Virtuals API #15734 (walletAddress, 37,136 holders)',
    virtualsId: 15734,
  },
  {
    address: '0x9B42b5b6027B10888007aCD04d38D9A85C58EdBa',
    name: 'CrashAI',
    framework: 'virtuals',
    project: 'CrashAI by Virtuals',
    source: 'Virtuals API #3260 (walletAddress, 35,395 holders)',
    virtualsId: 3260,
  },
  {
    address: '0xcd1baf2B33781c088B30106289e745972E41b0E8',
    name: 'DegenAI',
    framework: 'virtuals',
    project: 'DegenAI by Virtuals',
    source: 'Virtuals API #15500 (walletAddress, 33,475 holders)',
    virtualsId: 15500,
  },
  {
    address: '0x8BFA6a80f7d384F85A3222eEdc0858477Caa272D',
    name: 'Wokie Plumpkin',
    framework: 'virtuals',
    project: 'Wokie Plumpkin by Virtuals',
    source: 'Virtuals API #2250 (walletAddress, 32,735 holders)',
    virtualsId: 2250,
  },
  {
    address: '0x9f267640a1E7845E30051Ae29Ba715d556F480A7',
    name: 'Onyx',
    framework: 'virtuals',
    project: 'Onyx by Virtuals',
    source: 'Virtuals API #7388 (walletAddress, 32,232 holders)',
    virtualsId: 7388,
  },
  {
    address: '0x2d7a5D8F9aCF90403efe81361318CC4Ee88CBd0e',
    name: 'The Css God',
    framework: 'virtuals',
    project: 'The Css God by Virtuals',
    source: 'Virtuals API #2231 (walletAddress, 30,557 holders)',
    virtualsId: 2231,
  },
  {
    address: '0xE2E34dbcBd112e598BD8Dc0C8C91d1D5226f055d',
    name: 'Virtual Alpha',
    framework: 'virtuals',
    project: 'Virtual Alpha by Virtuals',
    source: 'Virtuals API #2160 (walletAddress, 29,532 holders)',
    virtualsId: 2160,
  },
  {
    address: '0x2fd07d8dEcf03F9859f2a0f4b4F63693c26e5b60',
    name: 'Based Mert (operator)',
    framework: 'virtuals',
    project: 'Based Mert by Virtuals',
    source: 'Virtuals API #9600 (walletAddress, 29,105 holders)',
    virtualsId: 9600,
  },
  {
    address: '0x17B752Ed0c2e09Aa156b905C8F878929BcD19aC6',
    name: 'HadesAI',
    framework: 'virtuals',
    project: 'HadesAI by Virtuals',
    source: 'Virtuals API #7295 (walletAddress, 27,640 holders)',
    virtualsId: 7295,
  },
  {
    address: '0x00A38cf191900dA6Ccf98A845E1aB4663EAc27D6',
    name: 'Starly the $STAR™ Guide (operator)',
    framework: 'virtuals',
    project: 'Starly the $STAR™ Guide by Virtuals',
    source: 'Virtuals API #40850 (walletAddress, 27,175 holders)',
    virtualsId: 40850,
  },
  {
    address: '0x68dDe099900b44Ae70eACD966d248e84Ede6dfF3',
    name: 'vAlpha FST bot (operator)',
    framework: 'virtuals',
    project: 'vAlpha FST bot by Virtuals',
    source: 'Virtuals API #4969 (walletAddress, 25,344 holders)',
    virtualsId: 4969,
  },
  {
    address: '0xB976dBFcbaECa1A31e570780ABD624b8708f6D4a',
    name: 'Eye Future (operator)',
    framework: 'virtuals',
    project: 'Eye Future by Virtuals',
    source: 'Virtuals API #19050 (walletAddress, 21,187 holders)',
    virtualsId: 19050,
  },
  {
    address: '0x49eEe6C1603225b25e1146C7Fcc1AC7430E8510e',
    name: 'Gloria (operator)',
    framework: 'virtuals',
    project: 'Gloria by Virtuals',
    source: 'Virtuals API #22418 (walletAddress, 9,780 holders)',
    virtualsId: 22418,
  },
  {
    address: '0x6C37bc9ae00c07415Aa2d495213391E0B08369B3',
    name: 'Fuku (operator)',
    framework: 'virtuals',
    project: 'Fuku by Virtuals',
    source: 'Virtuals API #41781 (walletAddress, 8,302 holders)',
    virtualsId: 41781,
  },
  {
    address: '0x62c432759C8544E0080179d909e146ef39D26c2D',
    name: 'Sage',
    framework: 'virtuals',
    project: 'Sage by Virtuals',
    source: 'Virtuals API #36261 (walletAddress, 8,218 holders)',
    virtualsId: 36261,
  },
  {
    address: '0xE622e4E758827008a774f4AD3d8578FE0b0Be989',
    name: 'ReplyCorp (operator)',
    framework: 'virtuals',
    project: 'ReplyCorp by Virtuals',
    source: 'Virtuals API #40858 (walletAddress, 7,898 holders)',
    virtualsId: 40858,
  },
  {
    address: '0xAAd99A9271c789F142Bf59136A749DCeBc6b62F7',
    name: 'VPay (operator)',
    framework: 'virtuals',
    project: 'VPay by Virtuals',
    source: 'Virtuals API #29233 (walletAddress, 7,792 holders)',
    virtualsId: 29233,
  },
  {
    address: '0x9CfB451BdFC47279342874f21C2E52514C588ED6',
    name: 'PRXVT (operator)',
    framework: 'virtuals',
    project: 'PRXVT by Virtuals',
    source: 'Virtuals API #40792 (walletAddress, 7,549 holders)',
    virtualsId: 40792,
  },
  {
    address: '0x4e515427dDfFcCdFe8F91c24D86efd918c9BE00A',
    name: 'Zaia (operator)',
    framework: 'virtuals',
    project: 'Zaia by Virtuals',
    source: 'Virtuals API #29300 (walletAddress, 6,776 holders)',
    virtualsId: 29300,
  },
  {
    address: '0xdC7e78395293883F4dCB3fA1BDB8Ed286E71072C',
    name: 'Agent Zeek',
    framework: 'virtuals',
    project: 'Agent Zeek by Virtuals',
    source: 'Virtuals API #7500 (walletAddress, 5,510 holders)',
    virtualsId: 7500,
  },
  {
    address: '0x8aaC54BB75e3ff909e1FcCf1950bD49EFbb53502',
    name: 'Waveform (operator)',
    framework: 'virtuals',
    project: 'Waveform by Virtuals',
    source: 'Virtuals API #37813 (walletAddress, 5,457 holders)',
    virtualsId: 37813,
  },
  {
    address: '0x82acef3Fc82A2e39fd352496E4CB5545D33D4bF1',
    name: 'BLACK HOLE (operator)',
    framework: 'virtuals',
    project: 'BLACK HOLE by Virtuals',
    source: 'Virtuals API #41450 (walletAddress, 5,292 holders)',
    virtualsId: 41450,
  },
  {
    address: '0x37ee197be18cA6ec44B72706034253Ec6Fd3aeBE',
    name: 'Verdant (operator)',
    framework: 'virtuals',
    project: 'Verdant by Virtuals',
    source: 'Virtuals API #23844 (walletAddress, 4,846 holders)',
    virtualsId: 23844,
  },
  {
    address: '0x06d2ab7E0041E0971751e25910f967aff3E71C91',
    name: 'Agent Base Ai',
    framework: 'virtuals',
    project: 'Agent Base Ai by Virtuals',
    source: 'Virtuals API #41825 (walletAddress, 4,602 holders)',
    virtualsId: 41825,
  },
  {
    address: '0xeaC5191e1CDE5fB2aEc5c477dbf33a23312C4044',
    name: 'MORSE (operator)',
    framework: 'virtuals',
    project: 'MORSE by Virtuals',
    source: 'Virtuals API #41850 (walletAddress, 4,320 holders)',
    virtualsId: 41850,
  },
  {
    address: '0x485f0088d779ec896E86e1CcbF6A34eea5e946E5',
    name: 'GM FM (operator)',
    framework: 'virtuals',
    project: 'GM FM by Virtuals',
    source: 'Virtuals API #36700 (walletAddress, 4,034 holders)',
    virtualsId: 36700,
  },
  {
    address: '0xcCf89D571E45b74d49eDd82DAFA63167BdB29233',
    name: 'LORA (operator)',
    framework: 'virtuals',
    project: 'LORA by Virtuals',
    source: 'Virtuals API #38075 (walletAddress, 3,184 holders)',
    virtualsId: 38075,
  },
  {
    address: '0x715e8802352a0cC384fedB633B538f0A83fC9935',
    name: 'Lily Turner — The First NSFW AI Agent (operator)',
    framework: 'virtuals',
    project: 'Lily Turner — The First NSFW AI Agent by Virtuals',
    source: 'Virtuals API #30550 (walletAddress, 3,044 holders)',
    virtualsId: 30550,
  },
  {
    address: '0x3317eB81979832A18D249B84385b0f70be927199',
    name: 'azaelite (operator)',
    framework: 'virtuals',
    project: 'azaelite by Virtuals',
    source: 'Virtuals API #19240 (walletAddress, 2,515 holders)',
    virtualsId: 19240,
  },
  {
    address: '0x4B709F32e5D907E651dbdb67995Af3CA56d6a98E',
    name: 'JARVIS AIGENT (operator)',
    framework: 'virtuals',
    project: 'JARVIS AIGENT by Virtuals',
    source: 'Virtuals API #28325 (walletAddress, 2,445 holders)',
    virtualsId: 28325,
  },
  {
    address: '0x22841abB2d07Bd5dd731837bea34559ba8DB349A',
    name: '10x (operator)',
    framework: 'virtuals',
    project: '10x by Virtuals',
    source: 'Virtuals API #43550 (walletAddress, 2,169 holders)',
    virtualsId: 43550,
  },
  {
    address: '0xfD728DDbD275Ed61181f7713d92D8C32c9B63797',
    name: 'Nemesis AI Trader (operator)',
    framework: 'virtuals',
    project: 'Nemesis AI Trader by Virtuals',
    source: 'Virtuals API #28600 (walletAddress, 2,147 holders)',
    virtualsId: 28600,
  },
  {
    address: '0x4e31D93bAa62a6087aF84c9cE00D816d19F765fA',
    name: 'senku ishigami',
    framework: 'virtuals',
    project: 'senku ishigami by Virtuals',
    source: 'Virtuals API #3098 (walletAddress, 2,104 holders)',
    virtualsId: 3098,
  },
  {
    address: '0xCD6E5Ca98b09707d7acc7Fd7844Ed488dc237dAE',
    name: 'Satoshi Signals',
    framework: 'virtuals',
    project: 'Satoshi Signals by Virtuals',
    source: 'Virtuals API #524 (walletAddress, 1,891 holders)',
    virtualsId: 524,
  },
  {
    address: '0x347CAe02e4E1F50142Acfbb0CE6F6F4F14D892d7',
    name: 'Fabric Protocol',
    framework: 'virtuals',
    project: 'Fabric Protocol by Virtuals',
    source: 'Virtuals API #45520 (walletAddress, 1,841 holders)',
    virtualsId: 45520,
  },
  {
    address: '0x630BBC18490AA97698C7854569889ADf68874d5C',
    name: 'Baron Von Whiskers',
    framework: 'virtuals',
    project: 'Baron Von Whiskers by Virtuals',
    source: 'Virtuals API #9965 (walletAddress, 1,545 holders)',
    virtualsId: 9965,
  },
  {
    address: '0x411acB846fec6dbb37b953b2Da39078dd374fFcB',
    name: 'MAFIA AI (operator)',
    framework: 'virtuals',
    project: 'MAFIA AI by Virtuals',
    source: 'Virtuals API #25080 (walletAddress, 1,544 holders)',
    virtualsId: 25080,
  },
  {
    address: '0x51cdb3fe30E7fbEd9Df51EE7E0BF636f69137299',
    name: 'Javlis',
    framework: 'virtuals',
    project: 'Javlis by Virtuals',
    source: 'Virtuals API #15050 (walletAddress, 1,423 holders)',
    virtualsId: 15050,
  },
  {
    address: '0x4A89331c0f479109a8c985DefC2BeFB676eabef4',
    name: 'moleRAT',
    framework: 'virtuals',
    project: 'moleRAT by Virtuals',
    source: 'Virtuals API #45200 (walletAddress, 1,322 holders)',
    virtualsId: 45200,
  },
  {
    address: '0x16f333146a08e877ba27455df5127614e5a4af0d',
    name: 'Canza (operator)',
    framework: 'virtuals',
    project: 'Canza by Virtuals',
    source: 'Virtuals API #35100 (walletAddress, 1,181 holders)',
    virtualsId: 35100,
  },
  {
    address: '0x089036a0835C6cF82e7fC42e9e95DfE05e110c81',
    name: 'THE KID',
    framework: 'virtuals',
    project: 'THE KID by Virtuals',
    source: 'Virtuals API #9905 (walletAddress, 1,167 holders)',
    virtualsId: 9905,
  },
  {
    address: '0xf11D57d94Bfe562F4137a040f92A411dc07A1019',
    name: 'The Pea Guy',
    framework: 'virtuals',
    project: 'The Pea Guy by Virtuals',
    source: 'Virtuals API #14759 (walletAddress, 1,078 holders)',
    virtualsId: 14759,
  },
  {
    address: '0x843819E77947e2Ca4F198dFa9c32cF49b598EF4B',
    name: 'P3P3_AG3NT',
    framework: 'virtuals',
    project: 'P3P3_AG3NT by Virtuals',
    source: 'Virtuals API #17560 (walletAddress, 824 holders)',
    virtualsId: 17560,
  },
  {
    address: '0xc049857402442e77CfC94dF2963F30668Bee7f92',
    name: 'Lyra (operator)',
    framework: 'virtuals',
    project: 'Lyra by Virtuals',
    source: 'Virtuals API #20075 (walletAddress, 807 holders)',
    virtualsId: 20075,
  },
  {
    address: '0x627A022f7Af48E71A5bf4F41CC42141363957527',
    name: 'Pro Agent (Old) (operator)',
    framework: 'virtuals',
    project: 'Pro Agent (Old) by Virtuals',
    source: 'Virtuals API #20375 (walletAddress, 755 holders)',
    virtualsId: 20375,
  },
  {
    address: '0x46210Bc40aC7858DAAD6301ca1221fe4d033eCd3',
    name: 'AI INU (operator)',
    framework: 'virtuals',
    project: 'AI INU by Virtuals',
    source: 'Virtuals API #35600 (walletAddress, 732 holders)',
    virtualsId: 35600,
  },
  {
    address: '0x2D3178af3Dfbb679716cc14E245Be0A9E5945500',
    name: 'Odin',
    framework: 'virtuals',
    project: 'Odin by Virtuals',
    source: 'Virtuals API #16400 (walletAddress, 592 holders)',
    virtualsId: 16400,
  },
  {
    address: '0xC5aa6692C6e051e8E01D21b99F3CF3DA8e9efD7E',
    name: 'MrWylde',
    framework: 'virtuals',
    project: 'MrWylde by Virtuals',
    source: 'Virtuals API #15750 (walletAddress, 451 holders)',
    virtualsId: 15750,
  },
  {
    address: '0x6A119c979658334C77C9826C6C03e2Dc39aF72D7',
    name: 'ROron',
    framework: 'virtuals',
    project: 'ROron by Virtuals',
    source: 'Virtuals API #3845 (walletAddress, 431 holders)',
    virtualsId: 3845,
  },
  {
    address: '0x83AB5C1a4f689cF95f4Cc44562887Aa3c6cCbC1e',
    name: 'Lorra (operator)',
    framework: 'virtuals',
    project: 'Lorra by Virtuals',
    source: 'Virtuals API #14400 (walletAddress, 423 holders)',
    virtualsId: 14400,
  },
  {
    address: '0x122EAeAa141840Ef576724cDF956483396A1E3b6',
    name: 'Eva',
    framework: 'virtuals',
    project: 'Eva by Virtuals',
    source: 'Virtuals API #15250 (walletAddress, 404 holders)',
    virtualsId: 15250,
  },
  {
    address: '0x2fd541dfa73EFD8f8F7f96CF9e61be464fbeD7c5',
    name: 'EtherMage',
    framework: 'virtuals',
    project: 'EtherMage by Virtuals',
    source: 'Virtuals API #556 (walletAddress, 388 holders)',
    virtualsId: 556,
  },
  {
    address: '0xC27428137b30673c6F791AA1fbeE4d8e827ae6E1',
    name: 'NexisAi',
    framework: 'virtuals',
    project: 'NexisAi by Virtuals',
    source: 'Virtuals API #11200 (walletAddress, 339 holders)',
    virtualsId: 11200,
  },
  {
    address: '0x3F59Fdb338FA0157e2328470A113eC8f38e13797',
    name: 'Kiwisabi',
    framework: 'virtuals',
    project: 'Kiwisabi by Virtuals',
    source: 'Virtuals API #11450 (walletAddress, 332 holders)',
    virtualsId: 11450,
  },
  {
    address: '0xcf6255dedd776403492e02f288d137c722835caa',
    name: '3D Printer Claw',
    framework: 'virtuals',
    project: '3D Printer Claw by Virtuals',
    source: 'Virtuals API #43925 (walletAddress, 332 holders)',
    virtualsId: 43925,
  },
  {
    address: '0x096B8eD3B2A13D12a7c4A8111AD40ABB5BeB6f26',
    name: 'Eutychía',
    framework: 'virtuals',
    project: 'Eutychía by Virtuals',
    source: 'Virtuals API #11800 (walletAddress, 322 holders)',
    virtualsId: 11800,
  },
  {
    address: '0x8E93e3b4d8919A532A1cB1bF2C3bB37Be55dd7b7',
    name: 'Javier Ramirez',
    framework: 'virtuals',
    project: 'Javier Ramirez by Virtuals',
    source: 'Virtuals API #350 (walletAddress, 313 holders)',
    virtualsId: 350,
  },
  {
    address: '0xd89815c28CD666d0727CCFFfb7310d996D7B1861',
    name: 'Money Helps',
    framework: 'virtuals',
    project: 'Money Helps by Virtuals',
    source: 'Virtuals API #13750 (walletAddress, 302 holders)',
    virtualsId: 13750,
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
