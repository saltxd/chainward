import { AssetToken } from '@virtuals-protocol/acp-node-v2';
import type { JobSession } from '@virtuals-protocol/acp-node-v2';
import type { JobRoomEntry } from '@virtuals-protocol/acp-node-v2';

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const HANDLE_RE = /^@?[A-Za-z0-9_]{1,15}$/;

// On-chain JobStatus enum from baseAcpClient.js:
//   0 = OPEN, 1 = FUNDED, 2 = SUBMITTED, 3 = COMPLETED, 4 = REJECTED, 5 = EXPIRED
// Provider can only call setBudget when status == OPEN.
const STATUS_OPEN = 0;

// Centralised reject — logs the call site (callers pass a `where` tag) so we can see
// in production exactly which path triggered every reject. Includes a stack trace
// so we don't have to guess if something exotic invokes session.reject.
async function rejectAt(
  session: JobSession,
  jobId: string,
  reason: string,
  where: string,
  context: Record<string, unknown> = {},
): Promise<void> {
  // eslint-disable-next-line no-console
  console.error('[reject]', JSON.stringify({
    where,
    jobId,
    reason,
    sessionStatus: session.status,
    onchainStatus: (session.job as any)?.status,
    ...context,
    stack: new Error().stack?.split('\n').slice(1, 6).join(' | '),
  }));
  await session.reject(reason);
}

function timeoutAfter<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(value), ms);
  });
}

export interface ParsedTarget {
  raw: string;            // exactly what the buyer sent ("@axelrod" or "0x47...")
  kind: 'address' | 'handle';
  address?: string;       // resolved 0x... when kind === 'address' or after handle resolution
  handle?: string;        // bare handle without @ when kind === 'handle'
}

export interface ValidateResult {
  ok: boolean;
  target?: ParsedTarget;
  reason?: 'invalid_address' | 'invalid_handle' | 'missing_target';
}

// Parses the requirement payload to find the target. Accepts:
//   - Documented schema: {"target": "0x..."} or {"target": "@handle"}
//   - Legacy/raw forms: {"wallet_address": "0x..."} or bare string content
export function parseTarget(rawContent: string): ValidateResult {
  let body: any = {};
  try {
    body = JSON.parse(rawContent);
  } catch {
    body = { target: rawContent };
  }
  const target = body.target ?? body.wallet_address ?? '';
  if (typeof target !== 'string' || target.length === 0) {
    return { ok: false, reason: 'missing_target' };
  }
  // Handle form: must start with @ (explicit). We don't auto-promote bare strings
  // to handles — too easy to confuse a typo'd address ('0xabc') for a handle.
  if (target.startsWith('@')) {
    const handle = target.slice(1);
    if (!HANDLE_RE.test(handle)) return { ok: false, reason: 'invalid_handle' };
    return { ok: true, target: { raw: target, kind: 'handle', handle } };
  }
  if (!ADDRESS_RE.test(target)) {
    return { ok: false, reason: 'invalid_address' };
  }
  return { ok: true, target: { raw: target, kind: 'address', address: target } };
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
    persistSettled(jobId: string): Promise<void>;
  };
  decode: { quickDecode(input: any): Promise<any> };
  resolver: {
    // Resolves an @handle to a 0x... address using the ACP API. Returns null if not found.
    resolveHandle(handle: string): Promise<string | null>;
  };
  chainHistory: {
    checkHistory(walletAddress: string): Promise<{ transactions_count: number; token_transfers_count: number }>;
  };
  config: { feeUsdc: number; defaultChainId: number; decodeWatchdogMs: number };
  // Helper to construct AssetToken for setBudget
  assetTokenForUsdc(amount: number, chainId: number): Promise<AssetToken>;
  // Lifecycle hooks for the host process to track drain state
  onJobStart?(jobId: string): void;
  onJobEnd?(jobId: string): void;
}

export async function handleEntry(
  ctx: HandlerContext,
  session: JobSession,
  entry: JobRoomEntry,
): Promise<void> {
  const job = session.job;
  if (!job) return;
  const buyer = job.clientAddress;
  const jobId = job.id.toString();

  // requirement message — buyer describes the job; we validate and set budget or reject
  if (entry.kind === 'message' && entry.contentType === 'requirement' && session.status === 'open') {
    // Stale-job guard: if the on-chain job has already left OPEN (e.g., rejected on a
    // prior pod's run, then replayed to us via SDK hydration), don't try to act on it.
    // Otherwise setBudget would revert with WrongStatus and waste a userOp signature.
    const onChainStatus = (session.job as any)?.status;
    if (typeof onChainStatus === 'number' && onChainStatus !== STATUS_OPEN) {
      // eslint-disable-next-line no-console
      console.error('[handler-stale-job]', JSON.stringify({
        jobId, sessionStatus: session.status, onChainStatus,
      }));
      return;
    }

    const parsed = parseTarget(entry.content ?? '');
    // eslint-disable-next-line no-console
    console.error('[handler-requirement]', JSON.stringify({
      jobId,
      sessionStatus: session.status,
      onChainStatus,
      // Full content (no slice) — we need to see exactly what arrived to debug
      // any future reject-on-valid-input mystery.
      entryContent: entry.content,
      contentType: entry.contentType,
      entryFrom: (entry as any).from,
      parsedOk: parsed.ok,
      parsedReason: parsed.reason,
      parsedKind: parsed.target?.kind,
      parsedAddress: parsed.target?.address,
      parsedHandle: parsed.target?.handle,
    }));
    if (!parsed.ok || !parsed.target) {
      const reason = parsed.reason ?? 'invalid_address';
      await rejectAt(session, jobId, reason, 'parse_failed', {
        entryContent: entry.content,
        parsedOk: parsed.ok,
        parsedReason: parsed.reason,
      });
      await ctx.persist.persistRejected({
        jobId,
        buyerWallet: buyer,
        targetInput: entry.content ?? '',
        targetWallet: '',
        rejectReason: reason,
      });
      return;
    }

    // Resolve @handle → wallet address before validation. Fail-closed: if we can't
    // resolve the handle, reject the job rather than accepting and decoding nothing.
    let walletAddress: string | undefined = parsed.target.address;
    if (parsed.target.kind === 'handle' && parsed.target.handle) {
      const resolved = await ctx.resolver.resolveHandle(parsed.target.handle);
      if (!resolved) {
        await rejectAt(session, jobId, 'handle_not_found', 'handle_unresolved', {
          handle: parsed.target.handle,
        });
        await ctx.persist.persistRejected({
          jobId,
          buyerWallet: buyer,
          targetInput: parsed.target.raw,
          targetWallet: '',
          rejectReason: 'handle_not_found',
        });
        return;
      }
      walletAddress = resolved;
    }
    if (!walletAddress) {
      await rejectAt(session, jobId, 'invalid_address', 'no_wallet_after_resolve', {
        parsed,
      });
      await ctx.persist.persistRejected({
        jobId,
        buyerWallet: buyer,
        targetInput: parsed.target.raw,
        targetWallet: '',
        rejectReason: 'invalid_address',
      });
      return;
    }

    const limit = await ctx.rateLimiter.tryAcquire(buyer);
    if (limit === 'rate_limited') {
      await rejectAt(session, jobId, 'rate_limited', 'rate_limited');
      await ctx.persist.persistRejected({
        jobId,
        buyerWallet: buyer,
        targetInput: parsed.target.raw,
        targetWallet: walletAddress,
        rejectReason: 'rate_limited',
      });
      return;
    }

    let acquiredSlot = true;
    try {
      const history = await ctx.chainHistory.checkHistory(walletAddress);
      if (history.transactions_count === 0 && history.token_transfers_count === 0) {
        await rejectAt(session, jobId, 'no_history', 'no_history', { walletAddress });
        await ctx.persist.persistRejected({
          jobId,
          buyerWallet: buyer,
          targetInput: parsed.target.raw,
          targetWallet: walletAddress,
          rejectReason: 'no_history',
        });
        await ctx.rateLimiter.release(buyer);
        acquiredSlot = false;
        return;
      }

      // Accept: set budget = our offering price, using the chain the buyer chose
      const budget = await ctx.assetTokenForUsdc(ctx.config.feeUsdc, session.chainId);
      // eslint-disable-next-line no-console
      console.error('[before-setBudget]', JSON.stringify({
        jobId,
        feeUsdc: ctx.config.feeUsdc,
        chainId: session.chainId,
        budgetAddress: (budget as any)?.address,
        budgetRawAmount: (budget as any)?.rawAmount?.toString?.(),
      }));
      await session.setBudget(budget);
      // eslint-disable-next-line no-console
      console.error('[after-setBudget-success]', JSON.stringify({ jobId }));
      await ctx.persist.persistAccepted({
        jobId,
        buyerWallet: buyer,
        targetInput: parsed.target.raw,
        targetWallet: walletAddress,
        feeUsdc: ctx.config.feeUsdc,
      });
    } catch (err) {
      // Anything between acquire and accept failed; release the slot so we don't strand the buyer
      if (acquiredSlot) await ctx.rateLimiter.release(buyer);
      throw err;
    }
    return;
  }

  // Only act on system entries beyond this point
  if (entry.kind !== 'system') return;

  const eventType = entry.event.type;

  // job.created — log only; requirement arrives as a separate message entry
  if (eventType === 'job.created') {
    return;
  }

  // job.funded — buyer has put USDC in escrow → run the work
  if (eventType === 'job.funded') {
    const reqMsg = session.entries.find(
      (e) => e.kind === 'message' && e.contentType === 'requirement',
    );
    const parsed = parseTarget(
      reqMsg?.kind === 'message' ? (reqMsg.content ?? '') : '',
    );
    if (!parsed.ok || !parsed.target) {
      // Shouldn't happen — we only got here after accepting at requirement time.
      // Fail-closed: reject the job so the buyer is refunded.
      await rejectAt(session, jobId, 'decode_failed', 'funded_parse_failed', { parsed });
      await ctx.persist.persistRejected({
        jobId,
        buyerWallet: buyer,
        targetInput: '',
        targetWallet: '',
        rejectReason: 'decode_failed',
      });
      await ctx.rateLimiter.release(buyer);
      return;
    }

    // Resolve again from the requirement (handler runs may be re-entrant after restart)
    let walletAddress: string | undefined = parsed.target.address;
    if (parsed.target.kind === 'handle' && parsed.target.handle) {
      const resolved = await ctx.resolver.resolveHandle(parsed.target.handle);
      if (resolved) walletAddress = resolved;
    }
    if (!walletAddress) {
      await rejectAt(session, jobId, 'decode_failed', 'funded_no_wallet', { parsed });
      await ctx.persist.persistRejected({
        jobId,
        buyerWallet: buyer,
        targetInput: parsed.target.raw,
        targetWallet: '',
        rejectReason: 'decode_failed',
      });
      await ctx.rateLimiter.release(buyer);
      return;
    }

    ctx.onJobStart?.(jobId);
    try {
      const decodePromise = ctx.decode.quickDecode({
        input: parsed.target.raw,
        wallet_address: walletAddress,
        agent_handle: parsed.target.handle,
        job_id: jobId,
      });
      const watchdog = timeoutAfter(ctx.config.decodeWatchdogMs, '__watchdog__' as const);
      const result: any = await Promise.race([decodePromise, watchdog]);

      if (result === '__watchdog__') {
        // Decode is still running but exceeded SLA. Reject so the buyer is refunded
        // rather than shipping a stub envelope they paid for.
        await rejectAt(session, jobId, 'decode_failed', 'decode_timeout', { walletAddress });
        await ctx.persist.persistRejected({
          jobId,
          buyerWallet: buyer,
          targetInput: parsed.target.raw,
          targetWallet: walletAddress,
          rejectReason: 'decode_timeout',
        });
        return;
      }

      await session.submit(JSON.stringify(result));
      await ctx.persist.persistDelivered({ jobId, result });
    } catch (err: any) {
      // Decode threw (network failure cascade, classifier crash, etc.) → reject so
      // the buyer is refunded rather than charged for nothing.
      await rejectAt(session, jobId, 'decode_failed', 'decode_threw', {
        err: err?.message,
        walletAddress,
      });
      await ctx.persist.persistRejected({
        jobId,
        buyerWallet: buyer,
        targetInput: parsed.target.raw,
        targetWallet: walletAddress,
        rejectReason: 'decode_failed',
      });
      throw err;
    } finally {
      ctx.onJobEnd?.(jobId);
      await ctx.rateLimiter.release(buyer);
    }
    return;
  }

  // job.completed — buyer accepted, escrow released to us
  if (eventType === 'job.completed') {
    await ctx.persist.persistSettled(jobId);
    return;
  }

  // job.rejected / job.expired — release any held slot and persist the terminal status
  if (eventType === 'job.rejected' || eventType === 'job.expired') {
    await ctx.persist.persistRejected({
      jobId,
      buyerWallet: buyer,
      targetInput: '',
      targetWallet: '',
      rejectReason: eventType === 'job.rejected' ? 'buyer_rejected' : 'expired',
    });
    await ctx.rateLimiter.release(buyer);
    return;
  }
}
