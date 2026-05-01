import { AssetToken } from '@virtuals-protocol/acp-node-v2';
import type { JobSession } from '@virtuals-protocol/acp-node-v2';
import type { JobRoomEntry } from '@virtuals-protocol/acp-node-v2';

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

const DECODE_WATCHDOG_MS = 5 * 60 * 1000; // 5 minutes — see spec error-handling matrix

function timeoutAfter<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(value), ms);
  });
}

export interface ValidateInput { wallet_address: string }
export type ValidateResult =
  | { ok: true; wallet_address: string }
  | { ok: false; reason: 'invalid_address' };

export function validateRequest(input: ValidateInput): ValidateResult {
  if (!ADDRESS_RE.test(input.wallet_address ?? '')) {
    return { ok: false, reason: 'invalid_address' };
  }
  return { ok: true, wallet_address: input.wallet_address };
}

export interface HandlerContext {
  rateLimiter: {
    tryAcquire(buyer: string): Promise<'ok' | 'rate_limited'>;
    release(buyer: string): Promise<void>;
  };
  persist: {
    persistAccepted(input: any): Promise<void>;
    persistDelivered(input: any): Promise<void>;
    persistRejected(input: any): Promise<void>;
  };
  decode: { quickDecode(input: any): Promise<any> };
  chainHistory: {
    checkHistory(walletAddress: string): Promise<{ transactions_count: number; token_transfers_count: number }>;
  };
  config: { feeUsdc: number; defaultChainId: number };
  // Helper to construct AssetToken for setBudget
  assetTokenForUsdc(amount: number, chainId: number): Promise<AssetToken>;
}

export async function handleEntry(
  ctx: HandlerContext,
  session: JobSession,
  entry: JobRoomEntry,
): Promise<void> {
  // Only act on system entries — message entries are chat noise we don't process
  if (entry.kind !== 'system') return;

  const job = session.job;
  if (!job) return;

  const eventType = entry.event.type;

  // job.created — incoming job from buyer
  if (eventType === 'job.created') {
    // Extract requirement from session entries (kind 'message', contentType 'requirement')
    const reqMsg = session.entries.find(
      (e) => e.kind === 'message' && e.contentType === 'requirement',
    );
    let requirement: any = {};
    if (reqMsg?.kind === 'message' && reqMsg.content) {
      try { requirement = JSON.parse(reqMsg.content); } catch { requirement = { wallet_address: reqMsg.content }; }
    }

    const v = validateRequest(requirement);
    if (!v.ok) {
      await session.reject(v.reason);
      await ctx.persist.persistRejected({
        jobId: job.id.toString(),
        buyerWallet: job.clientAddress,
        targetInput: requirement.wallet_address ?? '',
        targetWallet: requirement.wallet_address ?? '',
        rejectReason: v.reason,
      });
      return;
    }

    const limit = await ctx.rateLimiter.tryAcquire(job.clientAddress);
    if (limit === 'rate_limited') {
      await session.reject('rate_limited');
      await ctx.persist.persistRejected({
        jobId: job.id.toString(),
        buyerWallet: job.clientAddress,
        targetInput: requirement.wallet_address,
        targetWallet: requirement.wallet_address,
        rejectReason: 'rate_limited',
      });
      return;
    }

    const history = await ctx.chainHistory.checkHistory(v.wallet_address);
    if (history.transactions_count === 0 && history.token_transfers_count === 0) {
      await ctx.rateLimiter.release(job.clientAddress);
      await session.reject('no_history');
      await ctx.persist.persistRejected({
        jobId: job.id.toString(),
        buyerWallet: job.clientAddress,
        targetInput: requirement.wallet_address,
        targetWallet: v.wallet_address,
        rejectReason: 'no_history',
      });
      return;
    }

    // Accept: set budget = our offering price
    const budget = await ctx.assetTokenForUsdc(ctx.config.feeUsdc, ctx.config.defaultChainId);
    await session.setBudget(budget);
    await ctx.persist.persistAccepted({
      jobId: job.id.toString(),
      buyerWallet: job.clientAddress,
      targetInput: requirement.wallet_address,
      targetWallet: v.wallet_address,
      feeUsdc: ctx.config.feeUsdc,
    });
    return;
  }

  // job.funded — buyer has put USDC in escrow → run the work
  if (eventType === 'job.funded') {
    // Extract requirement again (defensive — entries may have grown)
    const reqMsg = session.entries.find(
      (e) => e.kind === 'message' && e.contentType === 'requirement',
    );
    let requirement: any = {};
    if (reqMsg?.kind === 'message' && reqMsg.content) {
      try { requirement = JSON.parse(reqMsg.content); } catch { requirement = { wallet_address: reqMsg.content }; }
    }

    try {
      const decodePromise = ctx.decode.quickDecode({
        input: requirement.wallet_address,
        wallet_address: requirement.wallet_address,
        job_id: job.id.toString(),
      });
      const partialResult = {
        status: 'partial' as const,
        error: 'timeout' as const,
        job_id: job.id.toString(),
        message: 'Decode pipeline exceeded 5-minute internal watchdog. Partial delivery to preserve ACP SLA.',
      };
      const result = await Promise.race([
        decodePromise,
        timeoutAfter(DECODE_WATCHDOG_MS, partialResult),
      ]);
      // SDK submit accepts a string; serialize the JSON envelope
      await session.submit(JSON.stringify(result));
      await ctx.persist.persistDelivered({ jobId: job.id.toString(), result });
    } finally {
      await ctx.rateLimiter.release(job.clientAddress);
    }
    return;
  }

  // job.completed — buyer accepted, escrow released to us
  if (eventType === 'job.completed') {
    await ctx.persist.persistDelivered({ jobId: job.id.toString(), result: { settled: true } });
    return;
  }

  // job.rejected — buyer rejected (we lose the fee)
  // job.expired  — SLA exceeded
  // For these: already persisted at delivery; log only
}
