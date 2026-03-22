import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(8000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  BASE_RPC_URL: z.string().url(),
  BASE_RPC_FALLBACK_URL: z.string().url().optional(),
  ALCHEMY_API_KEY: z.string().optional(),
  // Webhook signing key still required — webhooks stay on Alchemy regardless of CHAIN_PROVIDER
  ALCHEMY_WEBHOOK_SIGNING_KEY: z.string().min(1),
  ALCHEMY_AUTH_TOKEN: z.string().optional(),
  ALCHEMY_WEBHOOK_ID: z.string().optional(),
  CHAIN_PROVIDER: z.enum(['alchemy', 'standard']).default('alchemy'),
  SOLANA_RPC_URL: z.string().url().optional(),
  HELIUS_API_KEY: z.string().optional(),
  COINGECKO_API_KEY: z.string().optional(),
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
