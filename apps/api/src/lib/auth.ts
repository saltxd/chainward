import { SignJWT, jwtVerify } from 'jose';
import type { Context } from 'hono';
import { getEnv } from '../config.js';

export const COOKIE_NAME = 'chainward-session';

/** Extract session token from Cookie header */
export function extractSessionToken(c: Context): string | undefined {
  const cookie = c.req.header('Cookie');
  return cookie
    ?.split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${COOKIE_NAME}=`))
    ?.split('=')
    .slice(1)
    .join('=');
}

function getSecret() {
  return new TextEncoder().encode(getEnv().JWT_SECRET);
}

export async function signJwt(userId: string, address: string): Promise<string> {
  return new SignJWT({ address })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(getSecret());
}

export async function verifyJwt(token: string): Promise<{ sub: string; address: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.sub || !payload.address) return null;
    return { sub: payload.sub, address: payload.address as string };
  } catch {
    return null;
  }
}
