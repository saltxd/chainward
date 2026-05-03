import { PrivyAlchemyEvmProviderAdapter, AcpAgent, SocketTransport } from '@virtuals-protocol/acp-node-v2';
import { base } from 'viem/chains';
import { logger } from './logger.js';
import type { Config } from './config.js';
import type { HandlerContext } from './handler.js';
import { handleEntry } from './handler.js';

export async function startSeller(
  config: Config,
  handlerCtx: HandlerContext,
): Promise<AcpAgent> {
  const provider = await PrivyAlchemyEvmProviderAdapter.create({
    walletAddress: config.walletAddress as `0x${string}`,
    walletId: config.walletId,
    signerPrivateKey: config.signerPrivateKey,
    chains: [base],
  });

  // Use SocketTransport (websocket) instead of the default SseTransport. Socket
  // emits a heartbeat every 30s which keeps the agent's `lastActiveAt` fresh on
  // Virtuals' backend. SSE has no heartbeat — without one, the backend appears
  // to treat the seller as offline and auto-rejects every incoming job with
  // reason="invalid_address" (observed pattern across 5378/5383/5386/5387/5391).
  const agent = await AcpAgent.create({ provider, transport: new SocketTransport() });

  agent.on('entry', async (session, entry) => {
    // Wide-net dispatch logging — captures every entry the SDK delivers, so we can
    // reconstruct the exact sequence that triggered any reject. Truncate content at
    // 1000 chars (well above any real requirement payload).
    logger.info(
      {
        jobId: session.job?.id?.toString(),
        sessionStatus: session.status,
        roles: session.roles,
        entryKind: entry.kind,
        entryFrom: (entry as any).from,
        entryContentType: (entry as any).contentType,
        entryEventType: (entry as any).event?.type,
        entryContent:
          (entry as any).content !== undefined
            ? String((entry as any).content).slice(0, 1000)
            : undefined,
        entryTimestamp: (entry as any).timestamp,
      },
      'dispatch:entry',
    );
    try {
      await handleEntry(handlerCtx, session, entry);
    } catch (err: any) {
      logger.error(
        {
          err: err.message,
          stack: err.stack,
          cause: err.cause?.message,
          jobId: session.job?.id?.toString(),
          entryKind: entry.kind,
          entryContentType: (entry as any).contentType,
          entryEventType: (entry as any).event?.type,
        },
        'handler failed',
      );
    }
  });

  await agent.start(() => logger.info({ address: config.walletAddress }, 'acp v2 connected'));

  return agent;
}
