import { Queue } from 'bullmq';
import { getRedis } from './redis.js';

interface AppQueues {
  baseTxProcess: Queue;
  balancePoll: Queue;
  alertEvaluate: Queue;
  alertDeliver: Queue;
}

let _queues: AppQueues | null = null;

export function getQueues(): AppQueues {
  if (!_queues) {
    const connection = getRedis();
    _queues = {
      baseTxProcess: new Queue('base-tx-process', { connection }),
      balancePoll: new Queue('balance-poll', { connection }),
      alertEvaluate: new Queue('alert-evaluate', { connection }),
      alertDeliver: new Queue('alert-deliver', { connection }),
    };
  }
  return _queues;
}
