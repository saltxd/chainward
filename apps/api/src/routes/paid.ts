import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { and, eq, sql } from 'drizzle-orm';
import { SignJWT, jwtVerify } from 'jose';
import { paidFiles, paidFileClaims, datasetLookup } from '@chainward/db';
import { getDb } from '../lib/db.js';
import { getEnv } from '../config.js';
import { logger } from '../lib/logger.js';
import { verifyUsdcPayment } from '../lib/verifyUsdcPayment.js';
import { AppError } from '../middleware/errorHandler.js';
import { rateLimit } from '../middleware/rateLimit.js';

// ─── Paid files ───────────────────────────────────────────────────────────────
//
// One-off datasets sold for USDC on Base (e.g. the full wallet list behind a
// decode). Two ways in:
//   - x402 clients: GET /api/paid/:slug/file, paid per request (middleware in index.ts).
//   - people: send the price in USDC to the treasury from any wallet, then
//     POST /api/paid/:slug/claim { txHash } for a 24h download token.
// Content lives in the DB row (a few MB). Nothing here needs a login.

const paid = new Hono();

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,59}$/;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const TOKEN_TTL = '24h';

const META_COLUMNS = {
  slug: paidFiles.slug,
  title: paidFiles.title,
  description: paidFiles.description,
  filename: paidFiles.filename,
  contentType: paidFiles.contentType,
  priceUsdc: paidFiles.priceUsdc,
  sizeBytes: paidFiles.sizeBytes,
  createdAt: paidFiles.createdAt,
};

function parseSlug(raw: string | undefined): string {
  const slug = raw ?? '';
  if (!SLUG_RE.test(slug)) throw new AppError(400, 'INVALID_SLUG', 'Invalid file slug');
  return slug;
}

function slugParam(c: Context): string {
  return parseSlug(c.req.param('slug'));
}

function treasury(): string {
  const t = process.env.TREASURY_WALLET_ADDRESS?.toLowerCase();
  if (!t) throw new AppError(503, 'PAYMENTS_UNCONFIGURED', 'Payments are not configured yet');
  return t;
}

function tokenSecret(): Uint8Array {
  return new TextEncoder().encode(getEnv().JWT_SECRET);
}

async function fileMeta(slug: string) {
  const [row] = await getDb().select(META_COLUMNS).from(paidFiles).where(eq(paidFiles.slug, slug)).limit(1);
  if (!row) throw new AppError(404, 'NOT_FOUND', 'No such file');
  return row;
}

/**
 * A slug this route can serve: 400 if malformed, 404 if no such file. app.ts runs
 * it before the x402 middleware so nobody is asked to pay for a file that isn't there.
 */
export async function requireKnownSlug(raw: string | undefined): Promise<string> {
  const slug = parseSlug(raw);
  await fileMeta(slug);
  return slug;
}

function publicMeta(row: Awaited<ReturnType<typeof fileMeta>>) {
  return {
    slug: row.slug,
    title: row.title,
    description: row.description,
    filename: row.filename,
    contentType: row.contentType,
    priceUsdc: row.priceUsdc / 1e6,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt,
  };
}

async function sendFile(c: Context, slug: string) {
  const [row] = await getDb().select().from(paidFiles).where(eq(paidFiles.slug, slug)).limit(1);
  if (!row) throw new AppError(404, 'NOT_FOUND', 'No such file');
  const body = new Uint8Array(row.content);
  return c.body(body, 200, {
    'Content-Type': row.contentType,
    'Content-Disposition': `attachment; filename="${row.filename}"`,
    'Content-Length': String(body.byteLength),
    'Cache-Control': 'private, no-store',
  });
}

// What's for sale (no content).
paid.get('/', async (c) => {
  const rows = await getDb().select(META_COLUMNS).from(paidFiles).orderBy(sql`${paidFiles.createdAt} DESC`);
  return c.json({ success: true, data: rows.map(publicMeta), treasuryAddress: process.env.TREASURY_WALLET_ADDRESS ?? null });
});

paid.get('/:slug', async (c) => {
  const row = await fileMeta(slugParam(c));
  return c.json({ success: true, data: publicMeta(row), treasuryAddress: process.env.TREASURY_WALLET_ADDRESS ?? null });
});

// x402-paid download. index.ts puts the payment middleware in front of this
// path; settlement happens only after this handler succeeds, so a 404 never charges.
paid.get('/:slug/file', async (c) => sendFile(c, slugParam(c)));

// Free single-wallet check against the dataset: tier plus a few public fields.
// The full file is the paid product; this is the reason to come look.
paid.get('/:slug/lookup/:address', rateLimit({ max: 30, windowSec: 60, prefix: 'rl:paid-lookup' }), async (c) => {
  const slug = slugParam(c);
  const address = (c.req.param('address') ?? '').toLowerCase();
  if (!ADDRESS_RE.test(address)) throw new AppError(400, 'INVALID_ADDRESS', 'Invalid wallet address');
  await fileMeta(slug);
  const rows = await getDb()
    .select({ chain: datasetLookup.chain, tier: datasetLookup.tier, fields: datasetLookup.fields })
    .from(datasetLookup)
    .where(and(eq(datasetLookup.slug, slug), eq(datasetLookup.address, address)));
  return c.json({ success: true, data: { address, found: rows.length > 0, matches: rows } });
});

const claimSchema = z.object({ txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/) });

// A person paid the treasury directly: verify the transfer, record the claim,
// hand back a short-lived download token.
paid.post('/:slug/claim', rateLimit({ max: 10, windowSec: 60, prefix: 'rl:paid-claim' }), async (c) => {
  const slug = slugParam(c);
  const row = await fileMeta(slug);
  const body = await c.req.json().catch(() => ({}));
  const txHash = claimSchema.parse(body).txHash.toLowerCase();
  const db = getDb();

  const [dupe] = await db
    .select({ id: paidFileClaims.id })
    .from(paidFileClaims)
    .where(sql`lower(${paidFileClaims.txHash}) = ${txHash}`)
    .limit(1);
  if (dupe) throw new AppError(409, 'PAYMENT_ALREADY_USED', 'This transaction has already been used');

  const result = await verifyUsdcPayment({
    txHash,
    toTreasury: treasury(),
    minAmount: BigInt(row.priceUsdc),
    // The file existed before the payment; older transfers were for something else.
    notBefore: new Date(row.createdAt.getTime() - 60_000),
  });
  if (!result.ok) {
    const messages: Record<string, [string, string]> = {
      TX_NOT_FOUND: ['TX_NOT_FOUND', 'Transaction not found or not yet confirmed'],
      TX_FAILED: ['TX_FAILED', 'Transaction reverted on-chain'],
      TOO_OLD: ['PAYMENT_TOO_OLD', 'This transaction predates the file'],
      NO_MATCH: ['INVALID_PAYMENT', `No USDC transfer of at least ${row.priceUsdc / 1e6} USDC to the treasury found in this transaction`],
    };
    const [code, message] = messages[result.reason] ?? messages.NO_MATCH!;
    throw new AppError(400, code, message);
  }

  await db.insert(paidFileClaims).values({
    slug,
    txHash,
    payerWallet: result.from,
    amountUsdc: Number(result.value),
  });

  const token = await new SignJWT({ slug, tx: txHash })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_TTL)
    .sign(tokenSecret());

  logger.info({ slug, txHash, payer: result.from, usdc: Number(result.value) / 1e6 }, 'paid file claimed');
  return c.json({ success: true, data: { token, downloadUrl: `/api/paid/${slug}/download?token=${token}` } });
});

// Token download (from a claim). Separate path so the x402 middleware never sees it.
paid.get('/:slug/download', async (c) => {
  const slug = slugParam(c);
  const token = c.req.query('token') ?? '';
  let payload: { slug?: unknown };
  try {
    ({ payload } = await jwtVerify(token, tokenSecret(), { algorithms: ['HS256'] }));
  } catch {
    throw new AppError(401, 'INVALID_TOKEN', 'Download link is invalid or expired');
  }
  if (payload.slug !== slug) throw new AppError(401, 'INVALID_TOKEN', 'Download link is for a different file');
  return sendFile(c, slug);
});

export { paid };
