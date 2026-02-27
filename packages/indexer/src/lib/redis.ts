import Redis from 'ioredis';
import { getEnv } from '../config.js';

let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (!_redis) {
    _redis = new Redis(getEnv().REDIS_URL, { maxRetriesPerRequest: null });
  }
  return _redis;
}
