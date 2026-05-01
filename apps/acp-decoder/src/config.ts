export interface Config {
  walletAddress: string;
  walletId: string;
  signerPrivateKey: string;
  databaseUrl: string;
  redisUrl: string;
  claudeOauthToken: string;
  defaultChainId: number;
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
    walletAddress: required(env, 'WALLET_ADDRESS'),
    walletId: required(env, 'WALLET_ID'),
    signerPrivateKey: required(env, 'WALLET_SIGNER_PRIVATE_KEY'),
    databaseUrl: required(env, 'DATABASE_URL'),
    redisUrl: required(env, 'REDIS_URL'),
    claudeOauthToken: required(env, 'CLAUDE_CODE_OAUTH_TOKEN'),
    defaultChainId: parseInt(env.DEFAULT_CHAIN_ID ?? '8453', 10),
    maxConcurrentDecodes: parseInt(env.MAX_CONCURRENT_DECODES ?? '3', 10),
    perBuyerInflightLimit: parseInt(env.PER_BUYER_INFLIGHT_LIMIT ?? '3', 10),
    perBuyerSubmissionLimit60s: parseInt(env.PER_BUYER_SUBMISSION_LIMIT_60S ?? '5', 10),
  };
}
