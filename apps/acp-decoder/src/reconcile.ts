import { logger } from './logger.js';
import type { Config } from './config.js';
import type { HandlerContext } from './handler.js';
import { handleNewTask } from './handler.js';

// On startup, attempt to query in-flight jobs and re-process any we missed.
// If the endpoint is not present (empirically discovered), log and skip.
export async function reconcile(config: Config, handlerCtx: HandlerContext): Promise<void> {
  const url = `${config.clawApiHost}/acp/providers/jobs?phase=REQUEST,NEGOTIATION,TRANSACTION`;
  try {
    const resp = await fetch(url, { headers: { 'x-api-key': config.liteAgentApiKey } });
    if (!resp.ok) {
      logger.warn({ status: resp.status }, 'reconcile: jobs endpoint not OK; skipping');
      return;
    }
    const body: any = await resp.json();
    const jobs = body?.data ?? [];
    logger.info({ count: jobs.length }, 'reconcile: replaying in-flight jobs');
    for (const job of jobs) {
      try {
        await handleNewTask(handlerCtx, job);
      } catch (err: any) {
        logger.error({ err: err.message, jobId: job.id }, 'reconcile: handler failed');
      }
    }
  } catch (err: any) {
    logger.warn({ err: err.message }, 'reconcile: skipped (endpoint unreachable)');
  }
}
