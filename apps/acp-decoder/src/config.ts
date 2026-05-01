export interface Config {
  liteAgentApiKey: string;
  walletAddress: string;
  databaseUrl: string;
  redisUrl: string;
  claudeOauthToken: string;
  acpHost: string;
  clawApiHost: string;
  maxConcurrentDecodes: number;
  perBuyerInflightLimit: number;
  perBuyerSubmissionLimit60s: number;
}

const required = (env: Record<string, string | undefined>, name: string): string => {
  const v = env[name];
  if (!v) throw new Error(`missing env var: ${name}`);
  return v;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  return {
    liteAgentApiKey: required(env, 'LITE_AGENT_API_KEY'),
    walletAddress: required(env, 'WALLET_ADDRESS'),
    databaseUrl: required(env, 'DATABASE_URL'),
    redisUrl: required(env, 'REDIS_URL'),
    claudeOauthToken: required(env, 'CLAUDE_CODE_OAUTH_TOKEN'),
    acpHost: env.ACP_HOST ?? 'https://acpx.virtuals.io',
    clawApiHost: env.CLAW_API_HOST ?? 'https://claw-api.virtuals.io',
    maxConcurrentDecodes: parseInt(env.MAX_CONCURRENT_DECODES ?? '3', 10),
    perBuyerInflightLimit: parseInt(env.PER_BUYER_INFLIGHT_LIMIT ?? '3', 10),
    perBuyerSubmissionLimit60s: parseInt(env.PER_BUYER_SUBMISSION_LIMIT_60S ?? '5', 10),
  };
}
