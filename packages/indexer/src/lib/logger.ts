import pino from 'pino';
import { getEnv } from '../config.js';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport:
    getEnv().NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  base: { service: 'chainward-indexer' },
});
