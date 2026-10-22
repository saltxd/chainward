import type { MiddlewareHandler } from 'hono';
import { paymentMiddleware, x402ResourceServer } from '@x402/hono';
import { ExactEvmScheme } from '@x402/evm/exact/server';
import {
  HTTPFacilitatorClient,
  type FacilitatorConfig,
  type HTTPTransportContext,
  type RouteConfig,
  type SettleResultContext,
} from '@x402/core/server';
import { createFacilitatorConfig } from '@coinbase/x402';
import { bazaarResourceServerExtension, declareDiscoveryExtension } from '@x402/extensions/bazaar';
import { x402Settlements } from '@chainward/db';
import { HIRE_LIMITS, HIRE_MAX_HOPS, HIRE_METHOD, HIRE_WINDOW_DAYS } from '@chainward/decode';
import { getDb } from './db.js';
import { logger } from './logger.js';

// ─── Pay-per-check over x402 ──────────────────────────────────────────────────
//
// GET /api/risk/x402/:address answers with a fresh (< 24h) risk report for any
// Base address, paid per request in USDC on Base. No account, no API key: the
// client retries with an x402 payment header. Settlement happens only after the
// handler succeeds, so a failed or timed-out check is never charged.

// Same check, two shapes: ?address= for generic x402 clients, /:address for REST callers.
export const X402_CHECK_ROUTES = ['GET /api/risk/x402', 'GET /api/risk/x402/:address'] as const;
// Seller demand: where a seller's buyers get their USDC (services/sellerDemandService.ts).
export const SELLER_DEMAND_ROUTE = 'GET /api/risk/seller-demand' as const;
// Set and Earn hire check: who hired an ERC-8004 agent on BNB Chain, and how each hirer links to its owner.
export const HIRES_ROUTE = 'GET /api/risk/hires' as const;
// OFAC sanctions screen (lib/sanctionsCheck.ts): the cheapest call, made before every payment.
export const SANCTIONS_ROUTE = 'GET /api/risk/sanctions' as const;
// Plainly named aliases of the counterparty check and the sanctions screen. Catalog
// search (x402scan's, which agents and reviewers use to find new endpoints) matches
// the resource URL, not the description, so /api/risk/x402 never came up for
// "counterparty" and /api/risk/sanctions never for "ofac". Same handler, same price.
export const COUNTERPARTY_ALIAS_ROUTE = 'GET /api/risk/counterparty' as const;
export const OFAC_ALIAS_ROUTE = 'GET /api/risk/ofac' as const;
// Fast wallet lookup (routes/walletLookup.ts): sanctions, age, activity and first funder
// with a hold / review / no_flags verdict. Same lookup as GET /v1/wallet/:address with a key.
export const WALLET_ROUTE = 'GET /api/risk/wallet' as const;
// Token check (routes/tokenCheck.ts): who launched a Base token, how, and what the launch
// wallet and the supply did afterwards. /api/risk/token is its plain name for catalog search.
export const RUGCHECK_ROUTE = 'GET /api/risk/rugcheck' as const;
export const TOKEN_ALIAS_ROUTE = 'GET /api/risk/token' as const;
const BASE_MAINNET = 'eip155:8453';
// PayAI settles Base-mainnet `exact` payments without an API key (free tier).
const DEFAULT_FACILITATOR = 'https://facilitator.payai.network';

// Trimmed from a real response, for discovery catalogs.
const OUTPUT_EXAMPLE = {
  success: true,
  data: {
    status: 'ready',
    report: {
      address: '0x4baadba26c3c0bdef9e8faf173925d463aa53bb2',
      chain: 'base',
      verdict: {
        label: 'hold',
        text: 'Hold',
        reason: 'USDC balance held in a dormant wallet: Holds 5451.386272 USDC while classified dormant.',
        limits: 'On-chain behavior only. Absence of flags is not a clearance of the counterparty.',
      },
      band: 'high-signal',
      flags: [
        {
          id: 'stranded_value',
          severity: 'high',
          title: 'USDC balance held in a dormant wallet',
          evidence: 'Holds 5451.386272 USDC while classified dormant',
          source: 'https://base.blockscout.com/address/0x4baadba26c3c0bdef9e8faf173925d463aa53bb2',
        },
      ],
      not_assessed: ['Contract bytecode or source auditing', 'Social-engineering or off-chain reputation'],
      freshness: { as_of_block: 51846337, generated_at: '2026-09-27T04:07:05.375Z', ttl_state: 'fresh' },
      attestation: {
        uid: '0xda5dc4ca34777d908c3f16fc9eb10a75325d2c83683adb7539c8bc4ade6f6560',
        explorer_url:
          'https://base.easscan.org/attestation/view/0xda5dc4ca34777d908c3f16fc9eb10a75325d2c83683adb7539c8bc4ade6f6560',
      },
      disclaimer:
        'Risk flags from on-chain behavior only. ChainWard cannot see social engineering, off-chain agreements, or intent. Absence of flags is not a guarantee of safety.',
    },
  },
};

export function x402CheckPrice(): string {
  return process.env.X402_CHECK_PRICE ?? '$0.05';
}

export function x402SellerPrice(): string {
  return process.env.X402_SELLER_PRICE ?? '$0.10';
}

export function x402HiresPrice(): string {
  return process.env.X402_HIRES_PRICE ?? '$0.10';
}

// Paid datasets (routes/paid.ts). One price for every file; must match paid_files.price_usdc.
export const PAID_FILE_ROUTE = 'GET /api/paid/:slug/file' as const;
export function x402FilePrice(): string {
  return process.env.X402_FILE_PRICE ?? '$10';
}

// Paid single-wallet check against a dataset (GET /api/paid/<slug>/check?address=).
// Per-call routes stay at or under $0.10: the catalog sweep bot that paid 929
// sellers on 2026-10-08 never paid more than that for one call, and stock x402
// clients refuse anything over $1 unless configured. The $10 files are the exception.
export function x402LookupPrice(): string {
  return process.env.X402_LOOKUP_PRICE ?? '$0.05';
}

// OFAC sanctions screen (GET /api/risk/sanctions?address=). A lookup in a bundled
// list, so a cent covers it with room to spare.
export function x402SanctionsPrice(): string {
  return process.env.X402_SANCTIONS_PRICE ?? '$0.01';
}

// Fast wallet lookup (GET /api/risk/wallet?address=): a handful of RPC reads, cached an hour.
export function x402WalletPrice(): string {
  return process.env.X402_WALLET_PRICE ?? '$0.01';
}

/** The rug check's 503 and 504 say when to ask again. */
const RETRY_AFTER_HEADER = { 'Retry-After': { description: 'Seconds to wait before asking again', schema: { type: 'integer' } } };

// Token check (GET /api/risk/rugcheck?token=): a few dozen RPC reads, cached ten minutes.
export function x402TokenCheckPrice(): string {
  return process.env.X402_TOKEN_CHECK_PRICE ?? '$0.02';
}

// The counterparty example address, as the lookup reported it on 2026-10-13.
const WALLET_OUTPUT_EXAMPLE = {
  success: true,
  data: {
    address: '0x4baadba26c3c0bdef9e8faf173925d463aa53bb2',
    chain: 'base',
    verdict: { label: 'no_flags', reason: 'None of the checks matched: sanctions, age, history and first funder.' },
    sanctioned: false,
    type: 'wallet',
    first_seen: '2025-02-04T12:26:09.000Z',
    age_days: 616,
    last_active: '2026-01-30T15:58:27.000Z',
    sent_txs: 87,
    balances: { native: 0.01916580034492214, usdc: 5451.386272 },
    first_funder: {
      address: '0x0dff09a6733a12366236e62111a4ce93c475db78',
      tx: '0xaf801c6252bb681fc6654b763a1d530cc3828c918dd34774e64a8a33d53e20f3',
      sanctioned: false,
      exchange_or_hub: true,
      funded_wallets: null,
    },
    labels: [],
    flags: [],
    as_of_block: 52553137,
    limits:
      'On-chain facts only. A shared funder is not proof of one owner, and exchanges and other hubs hide who funded a wallet. no_flags means none of these checks matched; it is not a clearance.',
  },
};

// HOOK, a Clanker launch from chainward.ai/decodes, as the check reported it on 2026-10-20.
const TOKEN_CHECK_OUTPUT_EXAMPLE = {
  success: true,
  data: {
    token: '0x5f13d8f3bd2a9bd439d6ec9734ac1b4fb32b3b07',
    chain: 'base',
    verdict: {
      label: 'review',
      reason: 'The wallet that launched it received 6,416,006,425.89 tokens in the launch transaction and had sent out 100% of them 26 seconds later.',
    },
    token_info: {
      name: 'Clanker hook',
      symbol: 'HOOK',
      decimals: 18,
      total_supply: 100000000000,
    },
    launch: {
      block: 41628163,
      time: '2026-02-02T15:21:13.000Z',
      tx: '0x2f7eae9f2bba106190fa1c3ff6e6726ad8f49281eb967e12f180c76529dc5a03',
      creator: '0xdbd1c0e6c6252492bd5b99da162558de7f08d68b',
      via: '0xe85a59c628f7d27878aceb4bf3b35733630083a9',
      launcher: 'clanker',
      launcher_note: "Launched through Clanker's current factory, which deploys every token from one verified template with no owner mint, pause, blacklist or transfer tax.",
      token_admin: '0xdbd1c0e6c6252492bd5b99da162558de7f08d68b',
      made_for: null,
    },
    creator: {
      address: '0xdbd1c0e6c6252492bd5b99da162558de7f08d68b',
      role: 'launch_wallet',
      type: 'wallet',
      sanctioned: false,
      first_seen: '2026-02-02T14:39:03.000Z',
      age_days_at_launch: 0,
      sent_txs: 8,
      week_before_launch: { block: 52538275, sent_txs: 0, has_code: false },
      first_funder: {
        address: '0xb0818aebe3afd4fbc5dccde0b5a370140b1380a7',
        tx: '0x2353f506566e79dc6dd4c35fbebe065373d78c7a5010f48f5dcd76d6e2a476dd',
        sanctioned: false,
        exchange_or_hub: true,
        busy: true,
        funded_wallets: null,
        recent_recipients: null,
      },
      holds_pct: 0,
      vesting: null,
      holds_with_vesting_pct: 0,
      extensions_pct: 0,
      launch_tokens: {
        received: 6416006425.8854265,
        sent_pct: 100,
        first_send_after_sec: 26,
        sent_90pct_after_sec: 26,
        held_at_launch: 6416006425.8854265,
        held_1h: 0,
        held_1h_after_sec: 3600,
        sent_1h_pct: 100,
        held_now: 0,
        held_now_after_sec: 86400,
        sent_now_pct: 100,
      },
      clanker_launches_24h: 1,
      launches_24h: { total: 1, by_launchpad: { clanker: 1, doppler: 0, zora: 0, virtuals: 0, other: 0 }, span_sec: 0, read_to: '2026-10-20T16:42:07.000Z', capped: false },
    },
    supply: {
      mints_after_launch: 0,
      minted_after_launch: null,
      to_creator: 0,
      minted_to_creator: null,
      capped: false,
      extensions: [],
    },
    liquidity: { locked_by: 'clanker', pools: null, capped: false },
    flags: ['creator_sent_launch_tokens', 'new_creator'],
    as_of_block: 52840675,
    limits: "On-chain facts about the launch, the supply and the wallet that sent the launch transaction, which can be a bot, relayer or smart wallet acting for someone else; in a bundle of several smart wallets' operations, it is the one whose operation the token's first log came in. Tokens the launch wallet received at launch and sent out are not traced further: they may have been sold, moved or locked. What it sent out is read from its balance at the end of the launch block and about an hour later, and from its first 100 transfers. Its age is its own activity, its transactions and code a week before the launch, where that was read, and otherwise its first transfer in; its first funder is the first wallet that sent it ETH or a listed token above a dust floor, not an airdrop of another token. Its share of the supply is its balance plus, for a Doppler launch, the tokens still vesting to it (Doppler's vesting data for it, from up to 3 schedules); for a Clanker launch, the supply in Clanker's vault and airdrop contracts is reported apart and not counted in it. Liquidity: Clanker, Zora, Doppler and Virtuals hold the liquidity of their launches, so those pools are not read. For any other token, the check reads the Uniswap v2 and Aerodrome basic pools created since the launch (the first 10) and what the launch wallet put in and took out of each, through LP tokens minted to it and LP tokens it sent back to the pool; LP tokens it passed to another wallet or a locker are not followed, and Uniswap v3 and v4 pools, Aerodrome concentrated pools and other exchanges are not read. It does not check whether liquidity is locked or how much a pool holds today, does not simulate a sale (a honeypot check), and does not measure holder concentration. Mints are read from their first 100 records. For a Clanker launch, the launches of the launch wallet are the transactions it sent straight to the Clanker factory in the 24 hours up to and including this one (the newest 1,000); launches through another contract, and launches made for another admin, are not counted. no_flags means none of these checks matched; it is not a clearance.",
    checked_at: '2026-10-20T16:42:07.000Z',
    cached: false,
    age_seconds: 0,
  },
};

// The #2 seller from chainward.ai/decodes/x402-on-base, as the check reported it.
const SELLER_OUTPUT_EXAMPLE = {
  success: true,
  data: {
    address: '0x68396bd35874695ad86cd29410bd80a550991a2b',
    window_days: 30,
    sample: { inflow_transfers: 1000, buyers: 500, capped: true },
    via_intermediary_share: 0,
    top_buyer_share: 0.037,
    buyers_checked: 30,
    seller_funded: { buyers: 30, volume_share: 1, hops: { '3': 30 } },
    paid_back_share: 0,
    common_first_funder: { address: '0x82b551e820efc3503a3a27fc450e07e328daf91c', buyer_share: 0.5 },
    walk_stops: {},
    proxied_payers: [],
    signals: [
      {
        id: 'buyers_funded_by_seller',
        title: "Most checked buyers' USDC traces back to this address",
        evidence: '30 of 30 top buyers reach this address within 3 hops of their largest funders (100% of their volume).',
      },
      {
        id: 'common_funder',
        title: 'One wallet funds most checked buyers',
        evidence: '0x82b551e820efc3503a3a27fc450e07e328daf91c is the largest funder of 50% of the top buyers checked.',
      },
    ],
    disclaimer:
      'Describes where stablecoins moved on this chain, not why. A common funder can be a legitimate faucet, exchange or custodian. Not a safety verdict.',
  },
};

// A ring agent from chainward.ai/decodes/set-and-earn-week-one, as the check reported it on 2026-10-06.
const HIRES_OUTPUT_EXAMPLE = {
  success: true,
  data: {
    chain: 'bsc',
    agent_id: 332962,
    agent_ids: [332962],
    owner: '0x15d08640aeefbdce11930d9c9a30884011f654f6',
    agent_wallet: '0x15d08640aeefbdce11930d9c9a30884011f654f6',
    window_days: HIRE_WINDOW_DAYS,
    hires: { total: 3, distinct_hirers: 2, by_source: { termix_escrow: 3, erc8183_shared: 0 } },
    hirers: [
      {
        address: '0x4e276b4db12447254134b45e5add170993df5ad2',
        hires: 1,
        first_hire_at: '2026-10-01T07:42:05.000Z',
        verdict: 'inconclusive',
        evidence:
          "The hirer's first-incoming-BNB trail stops at 0x8894e0a0c962cb723c1976a4421c95949be2d4e3, a hub (exchange-style wallet, router or custodian), after 2 hops; funding behind it is not visible.",
        path: [
          '0x4e276b4db12447254134b45e5add170993df5ad2',
          '0x1d21aa41a77737e593b8ca92d6bf6437fa81697f',
          '0x8894e0a0c962cb723c1976a4421c95949be2d4e3',
        ],
      },
      {
        address: '0x99f88c4cae19f858052236f808b75967eece5bd0',
        hires: 2,
        first_hire_at: '2026-10-03T07:19:06.000Z',
        verdict: 'shared_funder',
        evidence:
          "The hirer's and the owner wallet's funding trails meet at 0x0fe05614b2d344fb0ef9797431890d4c13c0f0f1, which is not a hub or a contract (hirer: 1 hop up its first-incoming-stablecoin trail; owner wallet: 1 hop up its first-incoming-stablecoin trail).",
        path: [
          '0x99f88c4cae19f858052236f808b75967eece5bd0',
          '0x0fe05614b2d344fb0ef9797431890d4c13c0f0f1',
          '0x15d08640aeefbdce11930d9c9a30884011f654f6',
        ],
      },
    ],
    summary: { owner_linked: 1, inconclusive: 1, independent_within_limits: 0, passes_three_independent: false },
    method: HIRE_METHOD,
    limits: HIRE_LIMITS,
    as_of: { block: 125969567, time: '2026-10-06T01:09:22.000Z' },
  },
};

/**
 * /.well-known/x402 discovery document. `version` is what indexers such as
 * x402scan read today; `x402Version` is the draft discovery spec's field. Each
 * resource's 402 challenge stays authoritative for price and payTo.
 */
export function x402DiscoveryDocument() {
  return {
    version: 1,
    x402Version: 2,
    name: 'ChainWard',
    description:
      "Check a Base or BNB Chain address before you pay it: a verdict label pay / hold / unknown with a human text (Pay, Hold, Inactive, No track record, Couldn't check or Payer hidden), the reason, and the evidence. Also sells the datasets behind published decodes. On-chain behavior only.",
    contact: 'https://chainward.ai',
    contactEmail: 'hello@chainward.ai',
    resources: [
      'https://api.chainward.ai/api/risk/x402',
      'https://api.chainward.ai/api/risk/seller-demand',
      'https://api.chainward.ai/api/risk/hires',
      'https://api.chainward.ai/api/risk/sanctions',
      'https://api.chainward.ai/api/risk/counterparty',
      'https://api.chainward.ai/api/risk/ofac',
      'https://api.chainward.ai/api/risk/wallet',
      'https://api.chainward.ai/api/risk/rugcheck',
      'https://api.chainward.ai/api/risk/token',
      // Concrete dataset URLs so crawlers can probe each route; GET /api/paid lists them all.
      ...PUBLISHED_DATASETS.flatMap((d) => [
        `https://api.chainward.ai/api/paid/${d.slug}/file`,
        `https://api.chainward.ai/api/paid/${d.slug}/check`,
      ]),
    ],
    docs: 'https://chainward.ai/docs',
  };
}

/**
 * api.chainward.ai/ — x402scan scrapes an origin's homepage for its title and
 * description, and without one it fell back to chainward.ai's, which describes the
 * free web check. Static apart from the prices; no request data is rendered.
 */
export function apiHomePage(): string {
  const title = 'ChainWard API: check an address before you pay it, per call';
  const description =
    `Before your agent pays a Base or BNB Chain address: a verdict (pay / hold / unknown, shown as Pay, Hold, Inactive, No track record, Couldn't check or Payer hidden) with the one reason (${x402CheckPrice()}). ` +
    `For a seller: real or self-funded demand (${x402SellerPrice()}). For a BNB Chain agent: hired by others or by its own circle (${x402HiresPrice()}). ` +
    `Before every payment: an OFAC sanctions screen (${x402SanctionsPrice()}). Before buying a Base token: a rug check on its launch (${x402TokenCheckPrice()}). Evidence and limits under every verdict. Paid in USDC on Base over x402; a check that fails is never charged.`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:url" content="https://api.chainward.ai/">
<meta property="og:image" content="https://chainward.ai/chainward-og-press.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="https://chainward.ai/favicon.ico">
<style>body{font:16px/1.55 system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 20px;color:#1a1a1a}code{font-size:14px}</style>
</head>
<body>
<h1>ChainWard API</h1>
<p>${description}</p>
<ul>
<li><code>GET /api/risk/x402?address=0x…</code> (add <code>&amp;chain=bsc</code> for BNB Chain): a risk report no older than 24h, every flag tied to its transactions.</li>
<li><code>GET /api/risk/seller-demand?address=0x…</code> (add <code>&amp;chain=bsc</code>): how much of a seller's revenue traces back to the seller itself.</li>
<li><code>GET /api/risk/hires?agent=&lt;ERC-8004 id or owner 0x…&gt;&amp;chain=bsc</code> (${x402HiresPrice()}): who hired a BNB Chain agent in the last ${HIRE_WINDOW_DAYS} days, and whether each hirer is the owner, funded by it, or shares a funder with it (Set and Earn).</li>
<li><code>GET /api/risk/sanctions?address=0x…</code> (${x402SanctionsPrice()}): is the address on the US Treasury OFAC SDN list. Hold if it is; Not listed otherwise. Call it before every payment.</li>
<li><code>GET /api/risk/wallet?address=0x…</code> (add <code>&amp;chain=bsc</code>) (${x402WalletPrice()}): a fast wallet lookup: sanctions, age, last activity, balances and who first funded it, with a hold / review / no_flags verdict. Free with an API key at <code>GET /v1/wallet/0x…</code>, 1,000 lookups a month.</li>
<li><code>GET /api/risk/rugcheck?token=0x…</code> (${x402TokenCheckPrice()}): a rug check on a Base token's launch: who launched it and how (Clanker and Virtuals launches named), mints after the first issuance, whether the launch wallet sent out most of the tokens it got at launch within the hour, and whether it is a serial launcher (5 or more Clanker tokens in a day), with a hold / review / no_flags verdict. An address that is not a token is refused before payment. It also reads whether the launch wallet pulled the liquidity it added to the token's pool (hold) and supply still vesting to it. Not a honeypot or sell simulation.</li>
<li><code>GET /api/paid/{slug}/check?address=</code>: is one wallet in a dataset, and at what tier (${x402LookupPrice()}).</li>
<li><code>GET /api/paid/{slug}/file</code>: the CSV behind a decode; <code>GET /api/paid</code> lists them.</li>
</ul>
<p>Every verdict reads on-chain behavior only: Pay means nothing was found against paying, not a guarantee. Discovery: <a href="/.well-known/x402">/.well-known/x402</a> and <a href="/openapi.json">/openapi.json</a>. Docs: <a href="https://chainward.ai/docs">chainward.ai/docs</a>. Free reports: <a href="https://chainward.ai">chainward.ai</a>.</p>
</body>
</html>
`;
}

/**
 * /openapi.json — what x402 indexers (x402scan via @agentcash/discovery) read
 * first. Lists only the paid operation; its 402 challenge stays authoritative.
 */
/** Published datasets, each also listed under its own concrete path (catalogs can't probe {slug}). */
export const PUBLISHED_DATASETS: ReadonlyArray<{ slug: string; title: string; example: string }> = [
  // `example` is a wallet that is in the list, for the catalog's input example.
  {
    slug: 'termix-wallets',
    title: 'TermiX escrow: every wallet that settled a job through Sep 29, tiered',
    example: '0x00048bfe5972a462c5ca6adc2e373f2b49c4874d',
  },
  {
    slug: 'set-and-earn-week-one',
    title: "Set and Earn week one: every wallet that hired an agent, Oct 1 to 8, with tier and groups",
    example: '0x03a92db75947be1653c069d252f3d36a990bb61c',
  },
  // x402-sellers-base is off sale (lib/withdrawnDatasets.ts): built from x402scan's internal API.
];

// What the paid dataset check answers, as the TermiX example wallet reads today.
const SANCTIONS_OUTPUT_EXAMPLE = {
  success: true,
  data: {
    address: '0x4baadba26c3c0bdef9e8faf173925d463aa53bb2',
    sanctioned: false,
    verdict: {
      label: 'not_listed',
      text: 'Not listed',
      reason: 'This exact address is not among the 124 EVM addresses OFAC has published.',
    },
    list: {
      name: 'US Treasury OFAC SDN list, digital currency addresses (EVM)',
      source: 'https://github.com/0xB10C/ofac-sanctioned-digital-currency-addresses',
      fetched_at: '2026-10-11',
      addresses: 124,
    },
    limit:
      'Not listed is not a clearance: wallets that belong to or deal with a listed party, and addresses added after the snapshot date, are not covered. For behavior (activity, counterparties, flags) use the counterparty check.',
    full_check: 'https://api.chainward.ai/api/risk/x402?address=0x4baadba26c3c0bdef9e8faf173925d463aa53bb2',
  },
};

const DATASET_CHECK_OUTPUT_EXAMPLE = {
  success: true,
  data: {
    verdict: 'listed',
    reason: 'A1 (base) in TermiX escrow: every wallet that settled a job through Sep 29, tiered',
    limit:
      'TermiX escrow: every wallet that settled a job through Sep 29, tiered covers only its own window (built 2026-10-03); not listed means not seen there, nothing more.',
    slug: 'termix-wallets',
    address: '0x00048bfe5972a462c5ca6adc2e373f2b49c4874d',
    dataset: 'TermiX escrow: every wallet that settled a job through Sep 29, tiered',
    as_of: '2026-10-03',
    matches: [
      {
        chain: 'base',
        tier: 'A1',
        fields: { cluster: 'B0004', first_seen: '2026-08-10', fees_paid_usd: 93.0, jobs_as_buyer: 103, jobs_as_seller: 104, exchange_withdrawal_burst: null },
      },
    ],
    full_dataset: 'https://api.chainward.ai/api/paid/termix-wallets/file',
  },
};

export function x402OpenApiDocument() {
  const doc = x402OpenApiBase();
  const template = doc.paths['/api/paid/{slug}/file'].get;
  const checkTemplate = doc.paths['/api/paid/{slug}/check'].get;
  for (const d of PUBLISHED_DATASETS) {
    const paths = doc.paths as Record<string, unknown>;
    paths[`/api/paid/${d.slug}/file`] = {
      get: {
        ...template,
        operationId: `datasetFile_${d.slug.replace(/-/g, '_')}`,
        summary: `${d.title}, as CSV, paid over x402`,
        parameters: [],
      },
    };
    paths[`/api/paid/${d.slug}/check`] = {
      get: {
        ...checkTemplate,
        operationId: `datasetCheck_${d.slug.replace(/-/g, '_')}`,
        summary: `Is one wallet in "${d.title}", and at what tier, paid per call over x402`,
        // A wallet that is in this dataset, so the example call answers listed.
        parameters: checkTemplate.parameters
          .filter((q) => q.name === 'address')
          .map((q) => ({ ...q, schema: { ...q.schema, example: d.example } })),
      },
    };
  }
  // The {slug} templates only seed the concrete paths above: agents call listed paths literally,
  // and a literal {slug} answers 400. GET /api/paid lists the datasets.
  delete (doc.paths as Record<string, unknown>)['/api/paid/{slug}/file'];
  delete (doc.paths as Record<string, unknown>)['/api/paid/{slug}/check'];
  // The aliases carry the originals' parameters, price and responses; only the name and a note differ.
  const paths = doc.paths as Record<string, unknown>;
  const counterpartyOp = doc.paths['/api/risk/x402'].get;
  paths['/api/risk/counterparty'] = {
    get: { ...counterpartyOp, operationId: 'counterpartyCheckByName', description: `The same check as GET /api/risk/x402, under its plain name. ${counterpartyOp.description}` },
  };
  const sanctionsOp = doc.paths['/api/risk/sanctions'].get;
  paths['/api/risk/ofac'] = {
    get: { ...sanctionsOp, operationId: 'ofacScreen', description: `The same screen as GET /api/risk/sanctions, under its plain name. ${sanctionsOp.description}` },
  };
  // The token alias documents ?address=, the name generic clients send; both routes take either.
  const rugCheckOp = doc.paths['/api/risk/rugcheck'].get;
  paths['/api/risk/token'] = {
    get: {
      ...rugCheckOp,
      operationId: 'tokenCheckByName',
      description: `The same check as GET /api/risk/rugcheck, under its plain name. ${rugCheckOp.description}`,
      parameters: rugCheckOp.parameters.map((q) => (q.name === 'token' ? { ...q, name: 'address', description: 'Token contract on Base (?token= works too)' } : q)),
    },
  };
  return doc;
}

function x402OpenApiBase() {
  const usd = (x402CheckPrice().match(/[\d.]+/) ?? ['0.05'])[0];
  const sellerUsd = (x402SellerPrice().match(/[\d.]+/) ?? ['0.10'])[0];
  const hiresUsd = (x402HiresPrice().match(/[\d.]+/) ?? ['0.10'])[0];
  const fileUsd = (x402FilePrice().match(/[\d.]+/) ?? ['10'])[0];
  const lookupUsd = (x402LookupPrice().match(/[\d.]+/) ?? ['0.05'])[0];
  const sanctionsUsd = (x402SanctionsPrice().match(/[\d.]+/) ?? ['0.01'])[0];
  const walletUsd = (x402WalletPrice().match(/[\d.]+/) ?? ['0.01'])[0];
  const tokenUsd = (x402TokenCheckPrice().match(/[\d.]+/) ?? ['0.02'])[0];
  return {
    openapi: '3.1.0',
    info: {
      title: 'ChainWard',
      version: '1.0.0',
      description:
        "Check a Base or BNB Chain address before you pay it: a verdict label pay / hold / unknown with a human text (Pay, Hold, Inactive, No track record, Couldn't check or Payer hidden), the reason, and the evidence. Also sells the datasets behind published decodes. On-chain behavior only.",
      contact: { url: 'https://chainward.ai', email: 'hello@chainward.ai' },
      'x-guidance':
        `Start with GET /api/risk/wallet?address=0x... ($${walletUsd}): sanctions, wallet age, activity and first funder, with a hold / review / no_flags verdict. Before paying an address: GET /api/risk/x402?address=0x... ($${usd}). Before every payment: GET /api/risk/sanctions?address=0x... ($${sanctionsUsd}). Add &chain=bsc to the first two for BNB Chain. Before buying a Base token: GET /api/risk/rugcheck?token=0x... ($${tokenUsd}). Pay with any x402 client in USDC on Base; a call that fails is not charged.`,
    },
    servers: [{ url: 'https://api.chainward.ai' }],
    paths: {
      '/api/risk/x402': {
        get: {
          operationId: 'counterpartyCheck',
          summary: 'Verdict label pay / hold / unknown for a Base or BNB Chain address, with a human text, the reason and the full report, paid per call over x402',
          description:
            "Returns a verdict label pay / hold / unknown with a human text (Pay, Hold, Inactive, No track record, Couldn't check or Payer hidden), the reason, and the evidence: a report no older than 24h (a fresh check runs when needed) with every flag, its evidence and source, what was not assessed, and the EAS attestation if one exists. Screens the US Treasury OFAC sanctions list; a listed address always answers Hold. A known reserve or relayer of the px402 privacy pool answers Payer hidden: the real payer can't be screened. A strong label from ChainWard's published investigations or detectors (for example, one of a group of wallets that appear to be run together) answers Hold with the label as the reason (flag known_label); no label is not a clearance. Not charged if the check fails.",
          parameters: [
            {
              name: 'address',
              in: 'query',
              required: true,
              schema: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$', example: '0x4baadba26c3c0bdef9e8faf173925d463aa53bb2' },
              description: 'Address to check',
            },
            {
              name: 'chain',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: ['base', 'bsc'], default: 'base' },
              description: 'Chain the address is on. Payment is USDC on Base either way.',
            },
          ],
          'x-payment-info': {
            price: { mode: 'fixed', currency: 'USD', amount: usd },
            protocols: [{ x402: {} }],
          },
          responses: {
            '200': {
              description: 'Report (status "ready") or status "no_history"',
              content: { 'application/json': { example: OUTPUT_EXAMPLE } },
            },
            '402': { description: 'Payment required: x402 v2 challenge in the PAYMENT-REQUIRED header' },
            '503': { description: 'SOURCES_UNAVAILABLE: the on-chain sources the check reads were down, so no report was built; not charged' },
            '504': { description: 'Check did not finish in time; not charged' },
          },
        },
      },
      '/api/risk/seller-demand': {
        get: {
          operationId: 'sellerDemandCheck',
          summary: "Real or self-funded demand for an x402 or agent-marketplace seller, with the money trail behind it, paid per call over x402",
          description:
            "For any Base or BNB Chain address that receives payments: samples its recent stablecoin inflows (USDC on Base; USDT and USDC on BNB Chain), walks each top buyer's funding back up to 4 hops, and reports how much traces to the seller itself, how much it pays back, and whether one wallet funds most buyers. On Base, payments a facilitator proxy delivered (Meridian, Fluxa) are traced to their real payer: x402scan's record, confirmed on receipts (proxied_payers). Payers behind exchanges stay opaque. Not charged if the check fails.",
          parameters: [
            {
              name: 'address',
              in: 'query',
              required: true,
              schema: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$', example: '0x68396bd35874695ad86cd29410bd80a550991a2b' },
              description: 'Address that receives payments (an x402 payTo or a marketplace escrow/agent wallet)',
            },
            {
              name: 'chain',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: ['base', 'bsc'], default: 'base' },
              description: 'Chain the seller is on. Payment is USDC on Base either way.',
            },
          ],
          'x-payment-info': {
            price: { mode: 'fixed', currency: 'USD', amount: sellerUsd },
            protocols: [{ x402: {} }],
          },
          responses: {
            '200': { description: 'Seller demand report', content: { 'application/json': { example: SELLER_OUTPUT_EXAMPLE } } },
            '402': { description: 'Payment required: x402 v2 challenge in the PAYMENT-REQUIRED header' },
            '504': { description: 'Check did not finish in time; not charged' },
          },
        },
      },
      '/api/risk/hires': {
        get: {
          operationId: 'hireCheck',
          summary: "Hired by others or by its own circle: an ERC-8004 agent's hirers under Set and Earn's rule, BNB Chain, paid per call over x402",
          description:
            `For an ERC-8004 agent on BNB Chain (an agent id, or an owner address for all its agents): every wallet that hired it in the last ${HIRE_WINDOW_DAYS} days through the TermiX escrow or the shared ERC-8183 contract, each with a verdict (owner, owner_funded, shared_funder, inconclusive, independent_within_limits), the evidence and the funding path. Follows each wallet's first incoming BNB and first incoming stablecoin up to ${HIRE_MAX_HOPS} hops. independent_within_limits means no link found within those limits, not proven independence. Not charged if the check fails.`,
          parameters: [
            {
              name: 'agent',
              in: 'query',
              required: true,
              schema: { type: 'string', pattern: '^(\\d{1,12}|0x[a-fA-F0-9]{40})$', example: '332962' },
              description: 'ERC-8004 agent id on BNB Chain, or the 0x address that owns the agent(s)',
            },
            {
              name: 'chain',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: ['bsc'], default: 'bsc' },
              description: 'BNB Chain only for now. Payment is USDC on Base.',
            },
          ],
          'x-payment-info': {
            price: { mode: 'fixed', currency: 'USD', amount: hiresUsd },
            protocols: [{ x402: {} }],
          },
          responses: {
            '200': { description: 'Hire check report', content: { 'application/json': { example: HIRES_OUTPUT_EXAMPLE } } },
            '400': { description: 'Bad agent or chain (chain=base is not supported yet); not charged' },
            '402': { description: 'Payment required: x402 v2 challenge in the PAYMENT-REQUIRED header' },
            '404': { description: 'No ERC-8004 agent with that id on BNB Chain; not charged' },
            '504': { description: 'Check did not finish in time; not charged' },
          },
        },
      },
      '/api/risk/sanctions': {
        get: {
          operationId: 'sanctionsScreen',
          summary: 'Is this address on the OFAC SDN list? One cent, before every payment',
          description:
            'Screens one address against the US Treasury OFAC SDN list of digital currency addresses (EVM, the same on every chain). sanctioned answers Hold; anything else answers Not listed, which is not a clearance: wallets linked to a listed party and addresses added after the snapshot date are not covered. Answers at once from a bundled list; the snapshot date is in the response.',
          parameters: [
            {
              name: 'address',
              in: 'query',
              required: true,
              schema: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$', example: '0x4baadba26c3c0bdef9e8faf173925d463aa53bb2' },
              description: 'EVM address to screen',
            },
          ],
          'x-payment-info': {
            price: { mode: 'fixed', currency: 'USD', amount: sanctionsUsd },
            protocols: [{ x402: {} }],
          },
          responses: {
            '200': { description: 'Sanctions screen', content: { 'application/json': { example: SANCTIONS_OUTPUT_EXAMPLE } } },
            '400': { description: 'Malformed address; not charged' },
            '402': { description: 'Payment required: x402 v2 challenge in the PAYMENT-REQUIRED header' },
          },
        },
      },
      '/api/risk/wallet': {
        get: {
          operationId: 'walletLookup',
          summary: 'Fast wallet lookup: sanctions, age, activity and first funder, with a hold / review / no_flags verdict',
          description:
            'One address on Base or BNB Chain: is it on the OFAC SDN list, when it was first seen, when it last sent, its native and USDC balances, and the wallet that first funded it (sanctioned, an exchange or hub, or a funder of many wallets). hold if it or its first funder is sanctioned, or if on Base it looks like an address-poisoning decoy (never used, every recent token transfer a fake, its first and last characters matching an address a wallet in those fakes really paid); review if it is new, has no history, shares a funder with many wallets, pays through the px402 privacy pool (flag privacy_relay: the real payer is hidden), or carries a strong label from published ChainWard investigations or detectors (flag labeled; every public label is listed in labels); no_flags otherwise, which is not a clearance. Also free with an API key at GET /v1/wallet/{address}.',
          parameters: [
            {
              name: 'address',
              in: 'query',
              required: true,
              schema: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$', example: '0x4baadba26c3c0bdef9e8faf173925d463aa53bb2' },
              description: 'Address to look up',
            },
            {
              name: 'chain',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: ['base', 'bsc'], default: 'base' },
              description: 'Chain the address is on. Payment is USDC on Base either way.',
            },
          ],
          'x-payment-info': {
            price: { mode: 'fixed', currency: 'USD', amount: walletUsd },
            protocols: [{ x402: {} }],
          },
          responses: {
            '200': { description: 'Wallet lookup', content: { 'application/json': { example: WALLET_OUTPUT_EXAMPLE } } },
            '400': { description: 'Malformed address or unsupported chain; not charged' },
            '402': { description: 'Payment required: x402 v2 challenge in the PAYMENT-REQUIRED header' },
          },
        },
      },
      '/api/risk/rugcheck': {
        get: {
          operationId: 'tokenRugCheck',
          summary: 'Rug check for a Base token: who launched it and what the launch wallet and the supply did after, with a hold / review / no_flags verdict',
          description:
            "For an ERC-20 token on Base: the launch block and transaction and the wallet that launched it: the sender, the smart wallet behind an ERC-4337 bundle, or for a Virtuals agent token the prototype's creator (a buyer's purchase graduates it). Clanker's factory and Virtuals' bonding curve are named when their contracts confirm the token. Then the launch wallet: OFAC sanctions, its age at launch, its first funder, the share of supply it holds, whether it had sent out 90% or more of the tokens it received at launch (within the hour, or later, read from its balance now), and how many tokens it launched through Clanker, Doppler and Zora in the busiest 24 hours that include this launch, read through to the time of the check (creator.launches_24h). When the launch receipt names one other wallet the launch was made for (Clanker's token_admin, Zora's payout recipient, or the one wallet a Doppler token vests to), the wallet checks run on that wallet: launch.made_for names it and creator.role says which wallet the facts describe. And the supply: mints after the first issuance, and how many went to the launch wallet. hold if the launch wallet or its first funder is sanctioned, mints after launch gave it 1% or more of today's supply, or it took back most of the liquidity it added (creator_removed_liquidity); review for other mints after launch, a fast send-out, a large holding, a serial launcher (5 or more launches through Clanker, Doppler or Zora in 24 hours), a launch wallet with a strong label from ChainWard's published investigations or detectors (creator_labeled; its labels are listed in creator.labels), a new launch wallet, a shared funder (a first funder whose recent recipients were mostly brand-new wallets) or a launch it could not trace; no_flags otherwise, which is not a clearance. An address that is not a token answers 400 NOT_A_TOKEN and is never charged: an empty address, or a contract without totalSupply(), is refused before the 402, and an NFT collection once the check has read it. A token whose name or symbol passes for USDC, USDT or another well-known token through look-alike or hidden characters answers hold (imitates_known_token), even when it is not a full ERC-20. Every answer carries checked_at, cached and age_seconds: when it was read, whether it came from the cache, and its age in seconds. It also reads whether the launch wallet removed the liquidity it added to the token's Uniswap v2 or Aerodrome pool, and supply still vesting to it from a Doppler launch, which counts in its share. Not a honeypot or sell simulation, and not a holder-concentration check. The launch wallet can be a bot or launch service acting for someone else. Not charged if the check fails.",
          parameters: [
            {
              name: 'token',
              in: 'query',
              required: true,
              schema: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$', example: '0x5f13d8f3bd2a9bd439d6ec9734ac1b4fb32b3b07' },
              description: 'Token contract on Base (?address= works too)',
            },
            {
              name: 'chain',
              in: 'query',
              required: false,
              schema: { type: 'string', enum: ['base'], default: 'base' },
              description: 'Base only for now. Payment is USDC on Base.',
            },
          ],
          'x-payment-info': {
            price: { mode: 'fixed', currency: 'USD', amount: tokenUsd },
            protocols: [{ x402: {} }],
          },
          responses: {
            '200': { description: 'Token check', content: { 'application/json': { example: TOKEN_CHECK_OUTPUT_EXAMPLE } } },
            '400': {
              description:
                'Malformed address, a chain other than Base, or NOT_A_TOKEN: the address is not a token (error.details.flag is not_a_contract or not_a_token); not charged',
            },
            '402': { description: 'Payment required: x402 v2 challenge in the PAYMENT-REQUIRED header' },
            '503': {
              description: 'SOURCES_UNAVAILABLE: the chain data source did not answer; not charged. Retry-After says when to ask again',
              headers: RETRY_AFTER_HEADER,
            },
            '504': {
              description: 'CHECK_TIMEOUT: the check did not finish in time; not charged. It keeps running and caches its answer; Retry-After says when to ask again',
              headers: RETRY_AFTER_HEADER,
            },
          },
        },
      },
      '/api/paid/{slug}/check': {
        get: {
          operationId: 'datasetCheck',
          summary: 'Is one wallet in a published dataset, and at what tier, paid per call over x402',
          description:
            "Listed or Not listed for one address against the dataset named by the slug, with the tier and the row's own fields as the reason and the dataset's window as the limit. The free web lookup only says listed and tier; this returns the row's own fields. Not charged if the address is malformed or the dataset does not exist.",
          parameters: [
            {
              name: 'slug',
              in: 'path',
              required: true,
              schema: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,59}$', example: 'termix-wallets' },
              description: 'Dataset slug from GET /api/paid',
            },
            {
              name: 'address',
              in: 'query',
              required: true,
              schema: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$', example: '0x4baadba26c3c0bdef9e8faf173925d463aa53bb2' },
              description: 'Wallet to look up',
            },
          ],
          'x-payment-info': {
            price: { mode: 'fixed', currency: 'USD', amount: lookupUsd },
            protocols: [{ x402: {} }],
          },
          responses: {
            '200': {
              description: 'listed or not_listed, with the reason, the limit and every matching row',
              content: { 'application/json': { example: DATASET_CHECK_OUTPUT_EXAMPLE } },
            },
            '400': { description: 'Malformed address; not charged' },
            '402': { description: 'Payment required: x402 v2 challenge in the PAYMENT-REQUIRED header' },
            '404': { description: 'No dataset with that slug; not charged' },
          },
        },
      },
      '/api/paid/{slug}/file': {
        get: {
          operationId: 'datasetFile',
          summary: 'The full dataset behind a published decode, as CSV, paid over x402',
          description:
            'Every wallet in a published ChainWard audit, tiered, with the transactions behind each one. GET /api/paid lists what is available; GET /api/paid/{slug}/lookup/{address} says for free whether one wallet is listed and in which tier. Not charged if the file does not exist.',
          parameters: [
            {
              name: 'slug',
              in: 'path',
              required: true,
              schema: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,59}$', example: 'termix-wallets' },
              description: 'Dataset slug from GET /api/paid',
            },
          ],
          'x-payment-info': {
            price: { mode: 'fixed', currency: 'USD', amount: fileUsd },
            protocols: [{ x402: {} }],
          },
          responses: {
            '200': { description: 'The dataset', content: { 'text/csv': {} } },
            '402': { description: 'Payment required: x402 v2 challenge in the PAYMENT-REQUIRED header' },
            '404': { description: 'No dataset with that slug; not charged' },
          },
        },
      },
    },
  };
}

/**
 * TLS ends at the proxy, so paid requests arrive as http:// (or on the in-cluster
 * host, via the web proxy). The 402 challenge takes its resource URL from the
 * request and catalogs key on it, so the payment middleware sees the public URL.
 */
export const x402PublicUrl: MiddlewareHandler = async (c, next) => {
  const { pathname, search } = new URL(c.req.url);
  const publicUrl = `https://api.chainward.ai${pathname}${search}`;
  if (c.req.url !== publicUrl) c.req.raw = new Request(publicUrl, c.req.raw);
  await next();
};

/**
 * Keeps one row per settled payment: what was bought, by whom, in which transaction.
 * Pod logs don't survive a deploy. Never fails the paid response.
 */
async function recordSettlement(ctx: SettleResultContext): Promise<void> {
  if (!ctx.result.success) return;
  const request = (ctx.transportContext as HTTPTransportContext | undefined)?.request;
  let path = request?.path;
  try {
    if (request) {
      const url = new URL(request.adapter.getUrl());
      path = `${url.pathname}${url.search}`;
    }
  } catch {
    // keep the bare path
  }
  try {
    await getDb()
      .insert(x402Settlements)
      .values({
        txHash: ctx.result.transaction,
        network: ctx.result.network,
        payer: ctx.result.payer ?? null,
        payTo: ctx.requirements.payTo,
        asset: ctx.requirements.asset,
        amount: Number(ctx.result.amount ?? ctx.requirements.amount),
        route: request?.routePattern ?? null,
        path: path ?? null,
      })
      .onConflictDoNothing();
    logger.info({ tx: ctx.result.transaction, payer: ctx.result.payer, path }, 'x402 settlement recorded');
  } catch (err) {
    logger.warn({ err, tx: ctx.result.transaction }, 'x402: could not record settlement');
  }
  // Not awaited: the buyer has already been charged, and a slow webhook must not delay the report.
  void notifySale(ctx, path);
}

/** The Discord line for one settled payment. Pure so it can be tested. */
export function saleMessage(ctx: SettleResultContext, path: string | undefined): string {
  const atomic = Number(ctx.result.amount ?? ctx.requirements.amount);
  const usdc = (atomic / 1e6).toFixed(2);
  // The path carries the buyer's query string: keep it inside one code span and short.
  const bought = (path ?? ctx.paymentPayload.resource?.url ?? 'unknown').replace(/[`\r\n]/g, '').slice(0, 300);
  return [
    `💸 **x402 sale — ${usdc} USDC**`,
    `**Bought:** \`${bought}\``,
    ctx.result.payer ? `**Buyer:** \`${ctx.result.payer}\`` : null,
    `**Tx:** https://basescan.org/tx/${ctx.result.transaction}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/** Discord webhook body: mentions off, so nothing in a buyer's query can ping the channel. */
export function salePayload(ctx: SettleResultContext, path: string | undefined): { content: string; allowed_mentions: { parse: never[] } } {
  return { content: saleMessage(ctx, path), allowed_mentions: { parse: [] } };
}

/** Same Discord webhook the brief orders use; a sale is rare enough to be worth a ping. */
async function notifySale(ctx: SettleResultContext, path: string | undefined): Promise<void> {
  const webhookUrl = process.env.DIGEST_DISCORD_WEBHOOK;
  if (!webhookUrl) return;
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(salePayload(ctx, path)),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) logger.warn({ status: res.status }, 'x402: Discord sale notify non-OK');
  } catch (err) {
    logger.warn({ err }, 'x402: Discord sale notify failed');
  }
}

/**
 * Facilitators in priority order. The first one whose /supported lists a kind
 * handles it; a facilitator whose /supported fails at startup is skipped, so
 * PayAI stays the fallback. CDP first because Coinbase's x402 Bazaar only
 * catalogs resources settled through the CDP facilitator.
 *
 * Startup-time fallback only; a CDP outage after startup needs a pod restart.
 * initialize() binds each payment kind to one facilitator and verify/settle
 * never try the next. No runtime retry through the onVerifyFailure /
 * onSettleFailure hooks: a recovered settle skips the afterSettle hooks
 * (recordSettlement), and a settle that timed out may already be on-chain.
 */
export function facilitatorConfigs(env: NodeJS.ProcessEnv): Array<{ name: 'cdp' | 'payai'; config: FacilitatorConfig }> {
  const list: Array<{ name: 'cdp' | 'payai'; config: FacilitatorConfig }> = [];
  // 30 s per facilitator request: initialize() asks each in turn, and a hanging one must not stall startup for 90 s.
  const timeoutMs = 30_000;
  if (env.CDP_API_KEY_ID && env.CDP_API_KEY_SECRET) {
    list.push({ name: 'cdp', config: { ...createFacilitatorConfig(env.CDP_API_KEY_ID, env.CDP_API_KEY_SECRET), timeoutMs } });
  }
  list.push({ name: 'payai', config: { url: env.X402_FACILITATOR_URL ?? DEFAULT_FACILITATOR, timeoutMs } });
  return list;
}

/**
 * The library only console.warns, without a name, when a facilitator's /supported
 * fails at startup, so a wrong CDP key would look identical to a working one.
 * Log the outcome per facilitator; the failure is rethrown so the server still skips it.
 */
export function withStartupLog(name: string, client: HTTPFacilitatorClient): HTTPFacilitatorClient {
  const inner = client.getSupported.bind(client);
  client.getSupported = async () => {
    try {
      const supported = await inner();
      logger.info({ facilitator: name }, 'x402: facilitator ready');
      return supported;
    } catch (err) {
      logger.warn({ err, facilitator: name }, 'x402: facilitator skipped at startup');
      throw err;
    }
  };
  return client;
}

/** Payment middleware for the paid check, or null when no receiving address is configured. */
export function x402CheckMiddleware(): MiddlewareHandler | null {
  const payTo = process.env.X402_PAY_TO ?? process.env.TREASURY_WALLET_ADDRESS;
  if (!payTo) {
    logger.warn('x402: no X402_PAY_TO / TREASURY_WALLET_ADDRESS; paid check disabled');
    return null;
  }
  const facilitators = facilitatorConfigs(process.env);
  logger.info({ facilitators: facilitators.map((f) => f.name) }, 'x402: facilitators in priority order');
  const server = new x402ResourceServer(facilitators.map((f) => withStartupLog(f.name, new HTTPFacilitatorClient(f.config))))
    .register(BASE_MAINNET, new ExactEvmScheme())
    .registerExtension(bazaarResourceServerExtension)
    .onAfterSettle(recordSettlement);

  return paymentMiddleware(x402PaidRoutes(payTo), server);
}

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

interface PaywallExtras {
  /** What one payment buys: "per call" unless the route sells a file. */
  unit?: string;
  /** Free or in-browser ways to get the same thing, listed first. */
  links?: Array<{ label: string; href: string }>;
  /** True when the page itself sells this in the browser, so it never says a browser can't pay. */
  buyInBrowser?: boolean;
  /** True when the wallet tools in DEFAULT_FREE_LINKS are no way to the same answer. */
  onlyLinks?: boolean;
}

const DEFAULT_FREE_LINKS = [
  { label: 'Wallet screening API with a free key, 1,000 lookups a month', href: 'https://chainward.ai/wallet-api' },
  { label: 'Check any address on the web, free', href: 'https://chainward.ai' },
  { label: 'Screening a payout or airdrop list (the first 500 wallets of your first list are free)', href: 'https://chainward.ai/screen' },
];

/**
 * What a person who opens a paid link in a browser sees (status 402, with the
 * PAYMENT-REQUIRED header unchanged for x402 clients): the call, its price, how
 * to pay, and the free options. Static per route; no request data is rendered.
 */
function browserPaywallHtml(config: RouteConfig, extras: PaywallExtras = {}): string {
  const accepts = Array.isArray(config.accepts) ? config.accepts[0] : config.accepts;
  const name = escapeHtml(config.serviceName ?? 'ChainWard paid check');
  const price = escapeHtml(String(accepts?.price ?? ''));
  const unit = escapeHtml(extras.unit ?? 'per call');
  const description = escapeHtml(config.description ?? '');
  const links = [...(extras.links ?? []), ...(extras.onlyLinks ? [] : DEFAULT_FREE_LINKS)]
    .map((l) => `<li>${escapeHtml(l.label)}: <a href="${escapeHtml(l.href)}">${escapeHtml(l.href)}</a></li>`)
    .join('\n');
  const browserLine = extras.buyInBrowser
    ? 'This link is the API route, for agents and scripts. To buy from a browser, use the first link below.'
    : "This link is an API call, so a browser can't pay it.";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name}: ${price} ${unit}</title>
<meta name="robots" content="noindex">
<style>body{font:17px/1.6 Georgia,serif;max-width:640px;margin:56px auto;padding:0 20px;color:#1a1a1a;background:#faf8f3}code{font:14px ui-monospace,monospace;background:#efece4;padding:1px 4px}a{color:#1a1a1a}h1{font-size:30px;line-height:1.2}</style>
</head>
<body>
<h1>${name}</h1>
<p><strong>${price} ${unit}</strong>, paid in USDC on Base over x402. ${browserLine}</p>
<p>${description}</p>
<h2>Pay from code</h2>
<p>Send the same request from an x402 client: the API answers 402 with the price, and the client pays and sends the request again. A call that fails is never charged. How it works: <a href="https://chainward.ai/docs">chainward.ai/docs</a>.</p>
<h2>Other ways in</h2>
<ul>
${links}
</ul>
<p>Questions: hello@chainward.ai</p>
</body>
</html>`;
}

/** Route-specific extras for the browser page: in-browser purchase pages and free equivalents. */
function paywallExtras(routeKey: string): PaywallExtras {
  const dataset = routeKey.match(/^GET \/api\/paid\/([^/]+)\/(file|check)$/);
  if (dataset) {
    const [, slug, kind] = dataset;
    if (slug === ':slug') {
      return { links: [{ label: 'Every dataset for sale, with its own page', href: 'https://api.chainward.ai/api/paid' }] };
    }
    const page = `https://chainward.ai/paid/${slug}`;
    return kind === 'file'
      ? { unit: 'for one download', buyInBrowser: true, links: [{ label: 'Buy this dataset in your browser from any wallet (one download)', href: page }] }
      : { links: [{ label: 'Check one wallet against this list, free (tier only)', href: page }] };
  }
  if (routeKey === HIRES_ROUTE) {
    return { links: [{ label: 'Free daily hire results for every agent hired since Oct 1', href: 'https://chainward.ai/set-and-earn' }] };
  }
  if (routeKey === SELLER_DEMAND_ROUTE) {
    return { links: [{ label: 'Free weekly board of the top x402 sellers on Base', href: 'https://chainward.ai/x402' }] };
  }
  if (routeKey === RUGCHECK_ROUTE || routeKey === TOKEN_ALIAS_ROUTE) {
    return { links: [{ label: 'What the rug check reads, and what it does not', href: 'https://chainward.ai/docs' }], onlyLinks: true };
  }
  return {};
}

/** Every paid route's x402 config (price, description, Bazaar discovery), paying out to `payTo`. */
export function x402PaidRoutes(payTo: string): Record<string, RouteConfig> {
  const example = '0x4baadba26c3c0bdef9e8faf173925d463aa53bb2';
  const addressSchema = {
    type: 'object',
    properties: {
      address: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$', description: 'Base address to check' },
    },
    required: ['address'],
  };
  const checkSchema = {
    type: 'object',
    properties: {
      address: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$', description: 'Address to check' },
      chain: {
        type: 'string',
        enum: ['base', 'bsc'],
        default: 'base',
        description: 'Chain the address is on. Payment is USDC on Base either way.',
      },
    },
    required: ['address'],
  };
  interface Product {
    price: string;
    serviceName: string;
    description: string;
    tags: string[];
    whatYouGet: string;
    /** Free ways to the same answer for the 402 body; null when there are none. Default: the attestation and the web check. */
    freeAlternatives?: Record<string, string> | null;
    /** Where the 402 body sends readers. Default: the attestation docs. */
    docs?: string;
  }
  const counterparty: Product = {
    price: x402CheckPrice(),
    serviceName: 'ChainWard counterparty check',
    description:
      "Check a Base or BNB Chain (?chain=bsc) address before you pay it: a verdict label pay / hold / unknown with a human text (Pay, Hold, Inactive, No track record, Couldn't check or Payer hidden) and the one reason, such as active with real counterparties or a high-severity flag named. Under it, the evidence: every flag with its source, what was not assessed, and the EAS attestation if one exists. On-chain behavior only.",
    tags: ['base', 'bsc', 'bnb', 'risk', 'counterparty', 'wallet', 'address', 'reputation', 'trust', 'due-diligence', 'agents', 'eas', 'attestation'],
    whatYouGet:
      'A verdict (pay / hold / unknown) with its reason, then the full risk report no older than 24h (a fresh check runs if needed), JSON. Base by default; add ?chain=bsc for a BNB Chain address. Not charged if the check fails.',
  };
  const sanctionsScreen: Product = {
    price: x402SanctionsPrice(),
    serviceName: 'ChainWard sanctions screen',
    description:
      'Is this address on the US Treasury OFAC SDN list? Hold if it is, Not listed otherwise, with the snapshot date. EVM addresses, any chain. One cent, meant to run before every payment an agent makes. Not listed is not a clearance.',
    tags: ['ofac', 'sanctions', 'compliance', 'screening', 'address', 'wallet', 'counterparty', 'base', 'bsc', 'ethereum', 'agents', 'kyt'],
    whatYouGet:
      'sanctioned true/false, a verdict (sanctioned shown as Hold, or not_listed) with its reason, the list and its snapshot date, and the limit. Not charged if the address is malformed.',
  };
  const walletLookup: Product = {
    price: x402WalletPrice(),
    serviceName: 'ChainWard wallet lookup',
    description:
      'Fast wallet lookup on Base or BNB Chain (?chain=bsc): OFAC sanctions, first seen, last active, sent transactions, native and USDC balances, and the first funder (sanctioned, exchange or hub, or funder of many wallets). Verdict hold / review / no_flags with one reason; a never-used Base address planted as an address-poisoning decoy gets hold; a payer that is a px402 privacy pool relayer gets review, since the real payer is hidden. Built for screening payout lists, signups and counterparties.',
    tags: ['wallet', 'address', 'lookup', 'screening', 'sanctions', 'ofac', 'sybil', 'funder', 'age', 'base', 'bsc', 'agents', 'kyt'],
    whatYouGet:
      'A verdict (hold / review / no_flags) with its reason, the flags behind it, age, activity, balances and first funder, JSON. Cached for an hour. Not charged if the address is malformed.',
  };
  const tokenRugCheck: Product = {
    price: x402TokenCheckPrice(),
    serviceName: 'ChainWard rug check',
    description:
      "Rug check for a Base token before you buy it: who launched it and how (Clanker's factory and Virtuals' bonding curve named when their contracts confirm it), mints after the first issuance and how many went to the launch wallet, and what the launch wallet did: OFAC sanctions, its age at launch, its first funder, the share of supply it holds, whether it sent out 90% or more of the tokens it received at launch (within the hour or later), and how many tokens it launched through Clanker, Doppler and Zora in the busiest 24 hours around this one; for a launch made for another wallet, the wallet checks run on that wallet. Verdict hold / review / no_flags with one reason. It reads liquidity the launch wallet pulled from its pool (hold when it took back most of it); not a honeypot or holder check.",
    tags: ['base', 'token', 'erc20', 'rugcheck', 'rug', 'launch', 'creator', 'deployer', 'mint', 'clanker', 'memecoin', 'due-diligence', 'agents', 'trading'],
    whatYouGet:
      'A verdict (hold / review / no_flags) with its reason, then the launch (block, transaction, launch wallet, launcher), the launch wallet facts and the supply after launch, JSON. Cached for ten minutes (one minute for a token under two hours old); checked_at, cached and age_seconds say how fresh it is. An address that is not a token is refused with 400 NOT_A_TOKEN before payment. Not charged if the check fails.',
    freeAlternatives: null,
    docs: 'https://chainward.ai/docs',
  };
  const tokenSchema = (name: 'token' | 'address') => ({
    type: 'object',
    properties: {
      [name]: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$', description: 'Token contract on Base' },
      chain: { type: 'string', enum: ['base'], default: 'base', description: 'Base only for now. Payment is USDC on Base.' },
    },
    required: [name],
  });
  const tokenExample = TOKEN_CHECK_OUTPUT_EXAMPLE.data.token;
  const sanctionsDiscovery = () =>
    declareDiscoveryExtension({
      input: { address: example },
      inputSchema: addressSchema,
      output: { example: SANCTIONS_OUTPUT_EXAMPLE },
    });
  const sellerDemand: Product = {
    price: x402SellerPrice(),
    serviceName: 'ChainWard x402 seller check',
    description:
      "Real demand, self-funded demand, mixed or not enough data for an x402 or marketplace seller on Base or BNB Chain (?chain=bsc), with the one number behind it: how much of its top buyers' money traces back to the seller, how much it pays back, whether one wallet funds most buyers. Payers behind facilitator proxies (Meridian, Fluxa) are named on Base. Describes money flows, never intent.",
    tags: ['base', 'bsc', 'x402', 'seller', 'demand', 'wash', 'funding', 'wallet', 'counterparty', 'agents'],
    whatYouGet:
      "A verdict (real_demand / self_funded_demand / mixed / not_enough_data) with its reason, then the seller demand report for the last 30 days (top 30 buyers' funding walked back up to 4 hops), JSON. Not charged if the check fails.",
  };
  const paidFile: Product = {
    price: x402FilePrice(),
    serviceName: 'ChainWard dataset',
    description:
      'The full dataset behind a published ChainWard decode (e.g. every wallet in an incentive-farming audit, tiered, with the transactions behind each one). CSV.',
    tags: ['base', 'dataset', 'sybil', 'airdrop', 'points', 'agents'],
    whatYouGet: 'The CSV named by the slug (see GET /api/paid for what is available). Not charged if the file does not exist.',
  };
  const hireCheck: Product = {
    price: x402HiresPrice(),
    serviceName: 'ChainWard hire check',
    description:
      `Hired by others, hired by its own circle, or not enough data, for an ERC-8004 agent on BNB Chain under Set and Earn's rule of 3 hires from wallets you neither own nor fund: every wallet that hired it in the last ${HIRE_WINDOW_DAYS} days (TermiX escrow and the shared ERC-8183 contract), and whether each is the owner, funded by it, or shares a funder with it. Describes money flows, never intent.`,
    tags: ['bsc', 'bnb', 'erc8004', 'erc8183', 'agents', 'hires', 'sybil', 'funding', 'wallet', 'set-and-earn'],
    whatYouGet:
      `A verdict (hired_by_others / hired_by_own_circle / not_enough_data) with its reason, then every hirer of the agent in the last ${HIRE_WINDOW_DAYS} days with its own verdict, the evidence and the funding path (first incoming BNB and stablecoin, up to ${HIRE_MAX_HOPS} hops), JSON. Not charged if the check fails.`,
  };
  const hireSchema = {
    type: 'object',
    properties: {
      agent: {
        type: 'string',
        pattern: '^(\\d{1,12}|0x[a-fA-F0-9]{40})$',
        description: 'ERC-8004 agent id on BNB Chain, or the 0x address that owns the agent(s)',
      },
      chain: { type: 'string', enum: ['bsc'], default: 'bsc', description: 'BNB Chain only for now. Payment is USDC on Base.' },
    },
    required: ['agent'],
  };
  const route =(product: Product, discovery: ReturnType<typeof declareDiscoveryExtension>): RouteConfig => ({
    accepts: {
      scheme: 'exact',
      price: product.price,
      network: BASE_MAINNET,
      payTo,
      maxTimeoutSeconds: 120,
    },
    serviceName: product.serviceName,
    description: product.description,
    mimeType: 'application/json',
    tags: product.tags,
    // Bazaar discovery: facilitators catalog the endpoint from this after a settled payment.
    extensions: discovery,
    unpaidResponseBody: () => ({
      contentType: 'application/json',
      body: {
        error: 'payment_required',
        price: product.price,
        network: 'base',
        asset: 'USDC',
        what_you_get: product.whatYouGet,
        ...(product.freeAlternatives === null
          ? {}
          : {
              free_alternatives: product.freeAlternatives ?? {
                latest_attestation: 'GET https://api.chainward.ai/api/risk/attestation/<address>',
                web_check: 'https://chainward.ai',
              },
            }),
        docs: product.docs ?? 'https://github.com/saltxd/chainward/blob/main/docs/ATTEST.md',
      },
    }),
  });

  const routes: Record<string, RouteConfig> = {
    [X402_CHECK_ROUTES[0]]: {
      ...route(
        counterparty,
        declareDiscoveryExtension({
          input: { address: example },
          inputSchema: checkSchema,
          output: { example: OUTPUT_EXAMPLE },
        }),
      ),
      // TLS ends at the proxy, so the request URL reads http://; catalogs key on this.
      resource: 'https://api.chainward.ai/api/risk/x402',
    },
    [X402_CHECK_ROUTES[1]]: route(
      counterparty,
      declareDiscoveryExtension({
        pathParams: { address: example },
        pathParamsSchema: addressSchema,
        output: { example: OUTPUT_EXAMPLE },
      }),
    ),
    // The sub-dollar single-wallet check on each dataset, one concrete catalog row each.
    ...Object.fromEntries(
      PUBLISHED_DATASETS.map((d) => [
        `GET /api/paid/${d.slug}/check`,
        {
          ...route(
            {
              price: x402LookupPrice(),
              serviceName: 'ChainWard dataset check',
              description: `Listed or Not listed: is one wallet in "${d.title}", with the tier and the row's own fields as the reason and the dataset's window as the limit. JSON.`,
              tags: ['base', 'bsc', 'dataset', 'wallet', 'address', 'sybil', 'airdrop', 'points', 'agents'],
              whatYouGet:
                'listed / not_listed for one address, the tier and fields behind it, and the limit of what the dataset covers. Not charged if the address is malformed.',
            },
            declareDiscoveryExtension({
              input: { address: d.example },
              inputSchema: {
                type: 'object',
                properties: { address: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$', description: 'Wallet to look up' } },
                required: ['address'],
              },
              output: { example: DATASET_CHECK_OUTPUT_EXAMPLE },
            }),
          ),
          resource: `https://api.chainward.ai/api/paid/${d.slug}/check`,
        },
      ]),
    ),
    // One route per published dataset, before the :slug pattern (the server takes the
    // first match). PayAI folds any route with pathParams into a single templated
    // catalog row (".../:slug/file"), which no buyer can pay; these rows are concrete.
    ...Object.fromEntries(
      PUBLISHED_DATASETS.map((d) => [
        `GET /api/paid/${d.slug}/file`,
        {
          ...route(
            { ...paidFile, description: `${d.title}. CSV, one row per wallet.` },
            declareDiscoveryExtension({ output: { example: { contentType: 'text/csv' } } }),
          ),
          resource: `https://api.chainward.ai/api/paid/${d.slug}/file`,
        },
      ]),
    ),
    [PAID_FILE_ROUTE]: route(
      paidFile,
      declareDiscoveryExtension({
        pathParams: { slug: 'termix-wallets' },
        pathParamsSchema: {
          type: 'object',
          properties: { slug: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]{0,59}$', description: 'File slug from GET /api/paid' } },
          required: ['slug'],
        },
        output: { example: { contentType: 'text/csv' } },
      }),
    ),
    // Any other dataset on file: without this, its check matched no route and was served free.
    'GET /api/paid/:slug/check': route(
      {
        price: x402LookupPrice(),
        serviceName: 'ChainWard dataset check',
        description: 'Listed or Not listed: is one wallet in a ChainWard dataset (slug from GET /api/paid), with the tier as the reason. JSON.',
        tags: ['base', 'dataset', 'wallet', 'address'],
        whatYouGet: 'listed / not_listed for one address, the tier and fields behind it, and the limit of what the dataset covers.',
      },
      declareDiscoveryExtension({
        input: { address: example },
        inputSchema: addressSchema,
        output: { example: DATASET_CHECK_OUTPUT_EXAMPLE },
      }),
    ),
    [SELLER_DEMAND_ROUTE]: {
      ...route(
        sellerDemand,
        declareDiscoveryExtension({
          input: { address: '0x68396bd35874695ad86cd29410bd80a550991a2b' },
          inputSchema: checkSchema,
          output: { example: SELLER_OUTPUT_EXAMPLE },
        }),
      ),
      resource: 'https://api.chainward.ai/api/risk/seller-demand',
    },
    [HIRES_ROUTE]: {
      ...route(
        hireCheck,
        declareDiscoveryExtension({
          input: { agent: '332962', chain: 'bsc' },
          inputSchema: hireSchema,
          output: { example: HIRES_OUTPUT_EXAMPLE },
        }),
      ),
      resource: 'https://api.chainward.ai/api/risk/hires',
    },
    [SANCTIONS_ROUTE]: {
      ...route(sanctionsScreen, sanctionsDiscovery()),
      resource: 'https://api.chainward.ai/api/risk/sanctions',
    },
    [COUNTERPARTY_ALIAS_ROUTE]: {
      ...route(
        counterparty,
        declareDiscoveryExtension({
          input: { address: example },
          inputSchema: checkSchema,
          output: { example: OUTPUT_EXAMPLE },
        }),
      ),
      resource: 'https://api.chainward.ai/api/risk/counterparty',
    },
    [OFAC_ALIAS_ROUTE]: {
      ...route(sanctionsScreen, sanctionsDiscovery()),
      resource: 'https://api.chainward.ai/api/risk/ofac',
    },
    [WALLET_ROUTE]: {
      ...route(
        walletLookup,
        declareDiscoveryExtension({
          input: { address: example },
          inputSchema: checkSchema,
          output: { example: WALLET_OUTPUT_EXAMPLE },
        }),
      ),
      resource: 'https://api.chainward.ai/api/risk/wallet',
    },
    [RUGCHECK_ROUTE]: {
      ...route(
        tokenRugCheck,
        declareDiscoveryExtension({
          input: { token: tokenExample },
          inputSchema: tokenSchema('token'),
          output: { example: TOKEN_CHECK_OUTPUT_EXAMPLE },
        }),
      ),
      resource: 'https://api.chainward.ai/api/risk/rugcheck',
    },
    [TOKEN_ALIAS_ROUTE]: {
      ...route(
        tokenRugCheck,
        declareDiscoveryExtension({
          input: { address: tokenExample },
          inputSchema: tokenSchema('address'),
          output: { example: TOKEN_CHECK_OUTPUT_EXAMPLE },
        }),
      ),
      resource: 'https://api.chainward.ai/api/risk/token',
    },
  };
  // Browsers get a page that says what the call is and how to pay, not the library's developer note.
  for (const [key, config] of Object.entries(routes)) {
    config.customPaywallHtml ??= browserPaywallHtml(config, paywallExtras(key));
  }
  return routes;
}
