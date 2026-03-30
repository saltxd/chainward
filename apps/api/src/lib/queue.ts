import { Queue } from 'bullmq';
import { getRedis } from './redis.js';

interface AppQueues {
  baseTxProcess: Queue;
  balancePoll: Queue;
  alertEvaluate: Queue;
  alertDeliver: Queue;
}

let _queues: AppQueues | null = null;

const defaultJobOptions = {
  removeOnComplete: { count: 100 },
  removeOnFail: { count: 50 },
};

export function getQueues(): AppQueues {
  if (!_queues) {
    const connection = getRedis();
    _queues = {
      baseTxProcess: new Queue('base-tx-process', { connection, defaultJobOptions }),
      balancePoll: new Queue('balance-poll', { connection, defaultJobOptions }),
      alertEvaluate: new Queue('alert-evaluate', { connection, defaultJobOptions }),
      alertDeliver: new Queue('alert-deliver', { connection, defaultJobOptions }),
    };
  }
  return _queues;
}
