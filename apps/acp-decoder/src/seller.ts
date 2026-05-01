import { io, type Socket } from 'socket.io-client';
import { logger } from './logger.js';
import type { Config } from './config.js';
import type { HandlerContext } from './handler.js';
import { handleNewTask } from './handler.js';

export function startSeller(config: Config, handlerCtx: HandlerContext): Socket {
  const socket = io(config.acpHost, {
    auth: { walletAddress: config.walletAddress, apiKey: config.liteAgentApiKey },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
  });

  socket.on('connect', () => logger.info({ id: socket.id }, 'acp socket connected'));
  socket.on('disconnect', (reason) => logger.warn({ reason }, 'acp socket disconnected'));
  socket.on('connect_error', (err) => logger.error({ err: err.message }, 'acp socket error'));

  socket.on('onNewTask', async (job: any) => {
    logger.info({ jobId: job.id, phase: job.phase }, 'acp onNewTask');
    try {
      await handleNewTask(handlerCtx, job);
    } catch (err: any) {
      logger.error({ err: err.message, jobId: job.id }, 'handler failed');
    }
  });

  return socket;
}
