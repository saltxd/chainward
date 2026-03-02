import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(8000),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // Auth
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),

  // RPC - Base
  BASE_RPC_URL: z.string().url(),
  ALCHEMY_API_KEY: z.string(),
  ALCHEMY_WEBHOOK_SIGNING_KEY: z.string().optional(),
  ALCHEMY_AUTH_TOKEN: z.string().optional(),
  ALCHEMY_WEBHOOK_ID: z.string().optional(),

  // RPC - Solana (Phase 2)
  SOLANA_RPC_URL: z.string().url().optional(),
  HELIUS_API_KEY: z.string().optional(),

  // External
  COINGECKO_API_KEY: z.string().optional(),

  // CORS
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (!_env) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      console.error('Invalid environment variables:');
      console.error(result.error.flatten().fieldErrors);
      process.exit(1);
    }
    _env = result.data;
  }
  return _env;
}
