import { Queue, type QueueOptions } from 'bullmq';
import type Redis from 'ioredis';

/**
 * Every indexer queue keeps at most this many finished jobs. Redis runs with a
 * 200 MB cap and noeviction, so a queue that keeps every completed job (the
 * BullMQ default) eventually fills it, and then every queue write fails:
 * indexing and alerts stop for all customers. Same caps as the API's queues
 * (apps/api/src/lib/queue.ts). A job that sets its own removeOnComplete or
 * removeOnFail keeps its own value.
 */
export const QUEUE_DEFAULT_JOB_OPTIONS = {
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 50 },
} as const;

export function queueOptions(connection: Redis): QueueOptions {
  return { connection, defaultJobOptions: QUEUE_DEFAULT_JOB_OPTIONS };
}

/** The only way indexer code should make a BullMQ queue (a test enforces it). */
export function createQueue(name: string, connection: Redis): Queue {
  return new Queue(name, queueOptions(connection));
}
