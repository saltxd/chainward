process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgres://test:test@localhost:5432/test';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret-1234';
process.env.BASE_RPC_URL ??= 'https://mainnet.base.org';
process.env.ALCHEMY_WEBHOOK_SIGNING_KEY ??= 'test-signing-key';
