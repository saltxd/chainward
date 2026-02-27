import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Database
  DATABASE_URL: z.string().url(),

  // Redis
  REDIS_URL: z.string().url(),

  // RPC - Base
  BASE_RPC_URL: z.string().url(),
  ALCHEMY_API_KEY: z.string(),

  // External
  COINGECKO_API_KEY: z.string().optional(),
});

export type IndexerEnv = z.infer<typeof envSchema>;

let _env: IndexerEnv | null = null;

export function getEnv(): IndexerEnv {
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
