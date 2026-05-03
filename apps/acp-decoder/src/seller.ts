import { PrivyAlchemyEvmProviderAdapter, AcpAgent } from '@virtuals-protocol/acp-node-v2';
import { generateAuthorizationSignature } from '@privy-io/node';
import { base } from 'viem/chains';
import { logger } from './logger.js';
import type { Config } from './config.js';
import type { HandlerContext } from './handler.js';
import { handleEntry } from './handler.js';

// Wraps our PKCS8 base64 private key in a signFn callback. This is the same
// signing algorithm the SDK uses internally for the `signerPrivateKey` option,
// but routes through the signFn code path instead — which is the path the
// official acp-cli uses (and which is empirically tested end-to-end).
//
// Background: SDK 0.0.6's `signerPrivateKey` provider path interacts badly
// with @alchemy/wallet-api-types@0.1.0-alpha.30's strict bigint encoder when
// the seller's smart wallet hasn't been deployed yet (first tx triggers
// EIP-7702 auth + userOp = count: 2 signed calls). signFn path bypasses
// that buggy plumbing.
function makeSignFn(authorizationPrivateKey: string): (payload: Uint8Array) => Promise<string> {
  return async (payload: Uint8Array): Promise<string> => {
    return generateAuthorizationSignature({ authorizationPrivateKey, input: payload });
  };
}

export async function startSeller(
  config: Config,
  handlerCtx: HandlerContext,
): Promise<AcpAgent> {
  const provider = await PrivyAlchemyEvmProviderAdapter.create({
    walletAddress: config.walletAddress as `0x${string}`,
    walletId: config.walletId,
    signFn: makeSignFn(config.signerPrivateKey),
    chains: [base],
  });

  const agent = await AcpAgent.create({ provider });

  agent.on('entry', async (session, entry) => {
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
