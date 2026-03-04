import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { SiweMessage } from 'siwe';
import { getDb } from '../lib/db.js';
import { getRedis } from '../lib/redis.js';
import { users } from '@chainward/db';
import { signJwt, verifyJwt, COOKIE_NAME } from '../lib/auth.js';
import { getEnv } from '../config.js';

const auth = new Hono();

// GET /api/auth/nonce
auth.get('/nonce', async (c) => {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const redis = getRedis();
  await redis.set(`siwe:nonce:${nonce}`, '1', 'EX', 300); // 5 min TTL
  return c.json({ nonce });
});

// POST /api/auth/verify
auth.post('/verify', async (c) => {
  const { message, signature } = await c.req.json<{ message: string; signature: string }>();

  let siweMessage: SiweMessage;
  try {
    siweMessage = new SiweMessage(message);
  } catch (e) {
    return c.json({ error: `Invalid SIWE message: ${e instanceof Error ? e.message : String(e)}` }, 400);
  }

  const result = await siweMessage.verify({ signature });

  if (!result.success) {
    return c.json({ error: 'Invalid signature' }, 401);
  }

  // Validate nonce (atomic delete)
  const redis = getRedis();
  const nonceKey = `siwe:nonce:${siweMessage.nonce}`;
  const nonceExists = await redis.del(nonceKey);
  if (!nonceExists) {
    return c.json({ error: 'Invalid or expired nonce' }, 401);
  }

  // Validate domain against allowed origins
  const env = getEnv();
  const allowedOrigins = env.CORS_ORIGINS.split(',').map((o) => {
    try { return new URL(o.trim()).host; } catch { return o.trim(); }
  });
  if (!allowedOrigins.includes(siweMessage.domain)) {
    return c.json({ error: 'Invalid domain' }, 401);
  }

  // Use the address from the verified SIWE message (already validated)
  const address = siweMessage.address;

  // Upsert user
  const db = getDb();
  let [user] = await db
    .select()
    .from(users)
    .where(eq(users.walletAddress, address))
    .limit(1);

  if (!user) {
    [user] = await db
      .insert(users)
      .values({ walletAddress: address })
      .returning();
  }

  if (!user) {
    return c.json({ error: 'Failed to create user' }, 500);
  }

  // Sign JWT
  const token = await signJwt(user.id, address);

  // Set cookie
  const isSecure = env.NODE_ENV === 'production';
  c.header(
    'Set-Cookie',
    `${COOKIE_NAME}=${token}; HttpOnly; ${isSecure ? 'Secure; ' : ''}SameSite=Lax; Path=/; Max-Age=${7 * 24 * 60 * 60}`,
  );

  return c.json({
    user: {
      id: user.id,
      walletAddress: user.walletAddress,
      displayName: user.displayName,
      tier: user.tier,
    },
  });
});

// GET /api/auth/session
auth.get('/session', async (c) => {
  const cookie = c.req.header('Cookie');
  const token = cookie
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE_NAME}=`))
    ?.split('=')
    .slice(1)
    .join('=');

  if (!token) {
    return c.json({ user: null });
  }

  const payload = await verifyJwt(token);
  if (!payload) {
    return c.json({ user: null });
  }

  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, payload.sub))
    .limit(1);

  if (!user) {
    return c.json({ user: null });
  }

  return c.json({
    user: {
      id: user.id,
      walletAddress: user.walletAddress,
      displayName: user.displayName,
      tier: user.tier,
    },
  });
});

// POST /api/auth/logout
auth.post('/logout', (c) => {
  const env = getEnv();
  const isSecure = env.NODE_ENV === 'production';
  c.header(
    'Set-Cookie',
    `${COOKIE_NAME}=; HttpOnly; ${isSecure ? 'Secure; ' : ''}SameSite=Lax; Path=/; Max-Age=0`,
  );
  return c.json({ success: true });
});

export { auth };
