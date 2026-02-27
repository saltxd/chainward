import IORedis from 'ioredis';
import { getEnv } from '../config.js';

let _redis: IORedis | null = null;

export function getRedis(): IORedis {
  if (!_redis) {
    _redis = new IORedis(getEnv().REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }
  return _redis;
}
