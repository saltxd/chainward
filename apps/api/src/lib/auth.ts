import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getDb } from './db.js';
import { getEnv } from '../config.js';

let _auth: ReturnType<typeof betterAuth> | null = null;

export function getAuth() {
  if (!_auth) {
    const env = getEnv();
    const db = getDb();

    _auth = betterAuth({
      database: drizzleAdapter(db, { provider: 'pg' }),
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.BETTER_AUTH_URL,
      emailAndPassword: {
        enabled: true,
      },
      session: {
        cookieCache: {
          enabled: true,
          maxAge: 60 * 5, // 5 minutes
        },
      },
    });
  }
  return _auth;
}
