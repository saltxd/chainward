import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // RPC - Base
  BASE_RPC_URL: z.string().url(),
  BASE_RPC_FALLBACK_URL: z.string().url().optional(),
  BASE_RPC_TERTIARY_URL: z.string().url().default('https://mainnet.base.org'),
  ALCHEMY_API_KEY: z.string().optional(),

  // External
  COINGECKO_API_KEY: z.string().optional(),
});

export type IndexerEnv = z.infer<typeof envSchema>;

let _env: IndexerEnv | null = null;

export function getEnv(): IndexerEnv {
  if (!_env) {
    const result = envSchema.safeParse(process.env);
    if (!result.success) {
      console.error('Invalid environment variables:', JSON.stringify(result.error.flatten().fieldErrors, null, 2));
      process.exit(1);
    }
    _env = result.data;
  }
  return _env;
}
