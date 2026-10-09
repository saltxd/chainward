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
      'On-chain risk reports for Base and BNB Chain addresses: check a counterparty before you pay it. Also sells the datasets behind published decodes. Never a safety verdict.',
    contact: 'https://chainward.ai',
    contactEmail: 'hello@chainward.ai',
    resources: [
      'https://api.chainward.ai/api/risk/x402',
      'https://api.chainward.ai/api/risk/seller-demand',
      'https://api.chainward.ai/api/risk/hires',
      // One concrete dataset URL so crawlers can probe the route; GET /api/paid lists them all.
      'https://api.chainward.ai/api/paid/termix-wallets/file',
      'https://api.chainward.ai/api/paid/set-and-earn-week-one/file',
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
  const title = 'ChainWard API: pay, hold or unknown for any address, per call';
  const description =
    `Before your agent pays a Base or BNB Chain address: Pay, Hold or Unknown with the one reason (${x402CheckPrice()}). ` +
    `For a seller: real or self-funded demand (${x402SellerPrice()}). For a BNB Chain agent: hired by others or by its own circle (${x402HiresPrice()}). ` +
    `Evidence and limits under every verdict. Paid in USDC on Base over x402; a check that fails is never charged.`;
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
<li><code>GET /api/paid/{slug}/file</code>: the CSV behind a decode; <code>GET /api/paid</code> lists them.</li>
</ul>
<p>A report is a list of flags, never a safety verdict. Discovery: <a href="/.well-known/x402">/.well-known/x402</a> and <a href="/openapi.json">/openapi.json</a>. Docs: <a href="https://chainward.ai/docs">chainward.ai/docs</a>. Free reports: <a href="https://chainward.ai">chainward.ai</a>.</p>
</body>
</html>
`;
}

/**
 * /openapi.json — what x402 indexers (x402scan via @agentcash/discovery) read
 * first. Lists only the paid operation; its 402 challenge stays authoritative.
 */
/** Published datasets, each also listed under its own concrete path (catalogs can't probe {slug}). */
export const PUBLISHED_DATASETS: ReadonlyArray<{ slug: string; title: string }> = [
  { slug: 'termix-wallets', title: 'TermiX escrow: every wallet that settled a job through Sep 29, tiered' },
  { slug: 'set-and-earn-week-one', title: "Set and Earn week one: every wallet that hired an agent, Oct 1 to 8, with tier and groups" },
];

export function x402OpenApiDocument() {
  const doc = x402OpenApiBase();
  const template = doc.paths['/api/paid/{slug}/file'].get;
  for (const d of PUBLISHED_DATASETS) {
    (doc.paths as Record<string, unknown>)[`/api/paid/${d.slug}/file`] = {
      get: {
        ...template,
        operationId: `datasetFile_${d.slug.replace(/-/g, '_')}`,
        summary: `${d.title}, as CSV, paid over x402`,
        parameters: [],
      },
    };
  }
  return doc;
}

function x402OpenApiBase() {
  const usd = (x402CheckPrice().match(/[\d.]+/) ?? ['0.05'])[0];
  const sellerUsd = (x402SellerPrice().match(/[\d.]+/) ?? ['0.10'])[0];
  const hiresUsd = (x402HiresPrice().match(/[\d.]+/) ?? ['0.10'])[0];
  const fileUsd = (x402FilePrice().match(/[\d.]+/) ?? ['10'])[0];
  return {
    openapi: '3.1.0',
    info: {
      title: 'ChainWard',
      version: '1.0.0',
      description:
        'On-chain risk reports for Base and BNB Chain addresses: check a counterparty before you pay it. Also sells the datasets behind published decodes. Never a safety verdict.',
      contact: { url: 'https://chainward.ai' },
    },
    servers: [{ url: 'https://api.chainward.ai' }],
    paths: {
      '/api/risk/x402': {
        get: {
          operationId: 'counterpartyCheck',
          summary: 'Pay, Hold or Unknown for a Base or BNB Chain address, with the reason and the full report, paid per call over x402',
          description:
            'Returns a report no older than 24h, running a fresh check when needed: neutral signal band, every flag with its evidence and source, what was not assessed, and the EAS attestation if one exists. Not charged if the check fails.',
          parameters: [
            {
              name: 'address',
              in: 'query',
              required: true,
              schema: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
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
              schema: { type: 'string', pattern: '^0x[a-fA-F0-9]{40}$' },
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
      '/api/paid/{slug}/file': {
        get: {
          operationId: 'datasetFile',
          summary: 'The full dataset behind a published decode, as CSV, paid over x402',
          description:
            'Every wallet in a published ChainWard audit, tiered, with the transactions behind each one. GET /api/paid lists what is available; GET /api/paid/{slug}/lookup/{address} checks one wallet for free. Not charged if the file does not exist.',
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
  }
  const counterparty: Product = {
    price: x402CheckPrice(),
    serviceName: 'ChainWard counterparty check',
    description:
      'Pay, Hold or Unknown for a Base or BNB Chain (?chain=bsc) address before you pay it, with the one reason: active with real counterparties, or a high-severity flag named. Under it, every flag with its evidence and source, what was not assessed, and the EAS attestation if one exists. On-chain behavior only.',
    tags: ['base', 'bsc', 'bnb', 'risk', 'counterparty', 'wallet', 'address', 'reputation', 'trust', 'due-diligence', 'agents', 'eas', 'attestation'],
    whatYouGet:
      'A verdict (pay / hold / unknown) with its reason, then the full risk report no older than 24h (a fresh check runs if needed), JSON. Base by default; add ?chain=bsc for a BNB Chain address. Not charged if the check fails.',
  };
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
        free_alternatives: {
          latest_attestation: 'GET https://api.chainward.ai/api/risk/attestation/<address>',
          web_check: 'https://chainward.ai',
        },
        docs: 'https://github.com/saltxd/chainward/blob/main/docs/ATTEST.md',
      },
    }),
  });

  return {
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
  };
}
