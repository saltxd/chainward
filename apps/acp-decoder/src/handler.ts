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
  if (!ADDRESS_RE.test(input.wallet_address)) {
    return { ok: false, reason: 'invalid_address' };
  }
  return { ok: true, wallet_address: input.wallet_address };
}

export interface HandlerContext {
  api: {
    accept(jobId: string): Promise<void>;
    reject(jobId: string, opts: { reason: string }): Promise<void>;
    requirement(jobId: string, opts: any): Promise<void>;
    deliver(jobId: string, payload: any): Promise<void>;
  };
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
  config: { feeUsdc: number };
}

export async function handleNewTask(ctx: HandlerContext, job: any): Promise<void> {
  if (job.phase === 'REQUEST') {
    const v = validateRequest(job.requirement);
    if (!v.ok) {
      await ctx.api.reject(job.id, { reason: v.reason });
      await ctx.persist.persistRejected({
        jobId: job.id,
        buyerWallet: job.buyerWallet,
        targetInput: job.requirement.wallet_address,
        targetWallet: job.requirement.wallet_address,
        rejectReason: v.reason,
      });
      return;
    }
    const limit = await ctx.rateLimiter.tryAcquire(job.buyerWallet);
    if (limit === 'rate_limited') {
      await ctx.api.reject(job.id, { reason: 'rate_limited' });
      await ctx.persist.persistRejected({
        jobId: job.id,
        buyerWallet: job.buyerWallet,
        targetInput: job.requirement.wallet_address,
        targetWallet: job.requirement.wallet_address,
        rejectReason: 'rate_limited',
      });
      return;
    }
    const history = await ctx.chainHistory.checkHistory(v.wallet_address);
    if (history.transactions_count === 0 && history.token_transfers_count === 0) {
      await ctx.rateLimiter.release(job.buyerWallet); // give back the slot
      await ctx.api.reject(job.id, { reason: 'no_history' });
      await ctx.persist.persistRejected({
        jobId: job.id,
        buyerWallet: job.buyerWallet,
        targetInput: job.requirement.wallet_address,
        targetWallet: v.wallet_address,
        rejectReason: 'no_history',
      });
      return;
    }
    await ctx.api.accept(job.id);
    await ctx.persist.persistAccepted({
      jobId: job.id,
      buyerWallet: job.buyerWallet,
      targetInput: job.requirement.wallet_address,
      targetWallet: v.wallet_address,
      feeUsdc: ctx.config.feeUsdc,
    });
    await ctx.api.requirement(job.id, {});
    return;
  }

  if (job.phase === 'TRANSACTION') {
    try {
      const decodePromise = ctx.decode.quickDecode({
        input: job.requirement.wallet_address,
        wallet_address: job.requirement.wallet_address,
        job_id: job.id,
      });
      const partialResult = {
        status: 'partial' as const,
        error: 'timeout' as const,
        job_id: job.id,
        message: 'Decode pipeline exceeded 5-minute internal watchdog. Partial delivery to preserve ACP SLA.',
      };
      const result = await Promise.race([
        decodePromise,
        timeoutAfter(DECODE_WATCHDOG_MS, partialResult),
      ]);
      await ctx.api.deliver(job.id, { type: 'json', value: result });
      await ctx.persist.persistDelivered({ jobId: job.id, result });
    } finally {
      await ctx.rateLimiter.release(job.buyerWallet);
    }
    return;
  }

  // EVALUATION, COMPLETED — log only
}
