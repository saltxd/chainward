import { PrivyAlchemyEvmProviderAdapter, AcpAgent } from '@virtuals-protocol/acp-node-v2';
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

  const agent = await AcpAgent.create({ provider });

  agent.on('entry', async (session, entry) => {
    try {
      await handleEntry(handlerCtx, session, entry);
    } catch (err: any) {
      logger.error({ err: err.message, jobId: session.job?.id?.toString() }, 'handler failed');
    }
  });

  await agent.start(() => logger.info({ address: config.walletAddress }, 'acp v2 connected'));

  return agent;
}
