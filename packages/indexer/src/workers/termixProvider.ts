import { Queue, Worker } from 'bullmq';
import type Redis from 'ioredis';
import { createPublicClient, createWalletClient, http, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { bsc } from 'viem/chains';
import {
  CHAINWARD_TERMIX_AGENT_TOKEN_ID,
  TERMIX_API_BASE,
  TERMIX_MEASURED_GAS,
  TermixApiError,
  TermixClient,
  checkProviderIntent,
  riskChainRpcs,
  termixEscrows,
  termixItems,
  type CheckedIntent,
  type TermixOrder,
  type TermixProviderAction,
  type TermixTxIntent,
} from '@chainward/common';
import {
  HireCheckError,
  jsonRpcResult,
  runHireCheck,
  sellerDemandRpcUrl,
  type HireAgentInput,
  type HireReport,
} from '@chainward/decode';
import { getRedis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import { buildHireDeliverable, parseHireTarget } from '../lib/termixDeliverable.js';

// ─── TermiX provider: sell the hire check on BNB Chain's agent marketplace ────
//
// Every 2 minutes: list the orders addressed to ChainWard's agent (365669) on
// TermiX, and for each one that needs us, in this order of priority:
//   FUNDED / IN_PROGRESS  deliver (we accepted; the delivery clock is running)
//   PENDING_ACCEPT        read the buyer's note, run the hire check, and only if
//                         it ran, accept on-chain and deliver in the same pass
//   DELIVERED             claim the payout once the challenge window has passed
//                         (TermiX has no auto-settle; claimAfterTimeout is ours)
// Inputs it can't serve get a message and are never accepted, so the buyer's
// escrow is never stuck behind a job we can't do. Per-order state lives in
// Redis: a transaction hash is stored the moment it is sent, so a crash or a
// slow TermiX indexer never leads to a second accept, delivery or claim.
// Every intent is checked before signing (checkProviderIntent). Off unless
// TERMIX_PROVIDER_ENABLED=true and TERMIX_PROVIDER_PRIVATE_KEY is the owner
// key of the agent. Map of the whole lifecycle: docs/termix-provider.md.

const QUEUE = 'termix-provider';
const EVERY_MS = 120_000;
const LOCK_KEY = 'termix:provider:lock';
const LOCK_MS = 10 * 60_000;
const STATE_TTL_SEC = 60 * 86_400;
export const TERMIX_ORDER_KEY = (orderId: string) => `termix:provider:order:${orderId}`;
const REPORT_KEY = (orderId: string) => `termix:provider:report:${orderId}`;
/** The paid route's cache (apps/api/src/routes/risk.ts): a check sold an hour ago is reused, not re-run. */
const HIRES_CACHE_KEY = (t: HireAgentInput) => `hires:bsc:${t.kind === 'id' ? t.id : t.address}`;
const HIRES_CACHE_SEC = 3600;
const HIRES_BUDGET_MS = 50_000;
const LIST_PAGES = 3;
const PAGE_SIZE = 50;
const RECEIPT_POLLS = 12;
const INDEX_POLLS = 6;
const POLL_MS = 5_000;
/** Initial delivery plus the one redo TermiX allows. */
const MAX_SUBMITS = 2;
/** A call that reverts this many times on one order is left for a human (each revert costs gas). */
const MAX_REVERTS = 2;
/** Order detail reads per run, per job slot: waiting orders rotate through this, least recently read first. */
const READS_PER_JOB = 10;
/** After this many failed checks the buyer is told the sources are down (we keep retrying). */
const SOURCES_DOWN_AFTER = 3;
const CLAIM_MARGIN_MS = 60_000;
const BSC_CHAIN_ID = 56;
const GWEI = 1_000_000_000;

// ─── config ───────────────────────────────────────────────────────────────────

export interface TermixProviderConfig {
  privateKey: Hex;
  alchemyUrl: string;
  apiBase: string;
  agentTokenId: string;
  maxJobsPerRun: number;
  bscRpcUrl: string;
  maxGasPriceGwei: number;
}

export type TermixConfigResult = { enabled: true; config: TermixProviderConfig } | { enabled: false; reason: string };

function boundedInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const v = raw === undefined || raw.trim() === '' ? NaN : Math.floor(Number(raw));
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
}

export function termixProviderConfig(env: Record<string, string | undefined>): TermixConfigResult {
  if (env.TERMIX_PROVIDER_ENABLED !== 'true') return { enabled: false, reason: 'TERMIX_PROVIDER_ENABLED is not true' };
  const raw = (env.TERMIX_PROVIDER_PRIVATE_KEY ?? '').replace(/[\s'"]/g, '').replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) return { enabled: false, reason: 'TERMIX_PROVIDER_PRIVATE_KEY is missing or not 32 bytes of hex' };
  const alchemyUrl = sellerDemandRpcUrl('bsc', env);
  if (!alchemyUrl) return { enabled: false, reason: 'the hire check needs the Alchemy BNB RPC (SELLER_DEMAND_BSC_RPC_URL or SELLER_DEMAND_RPC_URL)' };
  const gwei = Number(env.TERMIX_MAX_GAS_GWEI);
  return {
    enabled: true,
    config: {
      privateKey: `0x${raw}`,
      alchemyUrl,
      apiBase: env.TERMIX_API_BASE || TERMIX_API_BASE.bsc,
      agentTokenId: env.TERMIX_AGENT_TOKEN_ID || CHAINWARD_TERMIX_AGENT_TOKEN_ID,
      maxJobsPerRun: boundedInt(env.TERMIX_MAX_JOBS_PER_RUN, 3, 1, 10),
      bscRpcUrl: env.TERMIX_BSC_RPC_URL || env.BSC_RPC_URL || riskChainRpcs('bsc')[0]!.url,
      maxGasPriceGwei: Number.isFinite(gwei) && gwei > 0 ? gwei : 0.1,
    },
  };
}

// ─── dependencies (injected; production wiring at the bottom) ─────────────────

export type TermixProviderApi = Pick<
  TermixClient,
  | 'contractsConfig'
  | 'agentByHandle'
  | 'providerOrders'
  | 'order'
  | 'conversationMessages'
  | 'sendMessage'
  | 'prepareProviderAccept'
  | 'deliveryUploadUrl'
  | 'putUpload'
  | 'deliveryArtifacts'
  | 'registerArtifact'
  | 'prepareSubmitDelivery'
  | 'prepareClaimAfterTimeout'
>;

export type ReceiptStatus = 'success' | 'reverted' | 'pending';

export interface TermixChainSender {
  /** The provider key's address; must own the agent. */
  address: string;
  balanceWei(): Promise<bigint>;
  /** The price this sender pays, already clamped. */
  gasPriceWei(): Promise<bigint>;
  send(tx: CheckedIntent): Promise<Hex>;
  receipt(hash: string): Promise<ReceiptStatus>;
}

export interface TermixStore {
  get(key: string): Promise<string | null>;
  setEx(key: string, value: string, ttlSec: number): Promise<unknown>;
  /** SET NX PX; true when acquired. */
  setNxPx(key: string, value: string, ttlMs: number): Promise<boolean>;
  del(key: string): Promise<unknown>;
}

interface Log {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

export interface TermixProviderDeps {
  api: TermixProviderApi;
  chain: TermixChainSender;
  runHireCheck(target: HireAgentInput): Promise<HireReport>;
  store: TermixStore;
  log: Log;
  now(): Date;
  sleep(ms: number): Promise<void>;
  agentTokenId: string;
  maxJobsPerRun: number;
}

export function redisStore(redis: Pick<Redis, 'get' | 'set' | 'del'>): TermixStore {
  return {
    get: (k) => redis.get(k),
    setEx: (k, v, ttl) => redis.set(k, v, 'EX', ttl),
    setNxPx: async (k, v, ms) => (await redis.set(k, v, 'PX', ms, 'NX')) === 'OK',
    del: (k) => redis.del(k),
  };
}

// ─── per-order state ──────────────────────────────────────────────────────────

interface OrderState {
  attempts: number;
  lastError?: string;
  /** Message kinds already sent to the buyer (ask, ambiguous, refused:<target>, sources, delivered:<round>). */
  messaged: string[];
  refusedTarget?: string;
  acceptTx?: string;
  submitTx?: string;
  submitRound?: number;
  submits: number;
  claimTx?: string;
  /** Reverted accept / submit / claim transactions on this order. */
  reverts: number;
  lastReadAt?: string;
  updatedAt?: string;
}

interface StoredReport {
  targetKey: string;
  target: HireAgentInput;
  round: number;
  report: HireReport;
}

export interface TermixRunSummary {
  skipped?: 'locked';
  orders: number;
  worked: number;
  accepted: number;
  delivered: number;
  claimed: number;
  waiting_input: number;
  refused: number;
  disputes: number;
  errors: number;
}

const targetKey = (t: HireAgentInput) => (t.kind === 'id' ? `id:${t.id}` : `owner:${t.address}`);
const redact = (s: string) => s.replace(/https?:\/\/\S+/g, '<url>').slice(0, 300);
const errText = (err: unknown) => redact(err instanceof Error ? err.message : String(err));

const SOURCES_DOWN_MESSAGE =
  'The on-chain sources the hire check reads are not answering right now. I keep retrying and accept the order only once the check runs.';

class Run {
  readonly summary: TermixRunSummary = {
    orders: 0,
    worked: 0,
    accepted: 0,
    delivered: 0,
    claimed: 0,
    waiting_input: 0,
    refused: 0,
    disputes: 0,
    errors: 0,
  };
  private chainId = BSC_CHAIN_ID;
  private escrows: string[] = [];
  private agentId = '';

  constructor(private readonly d: TermixProviderDeps) {}

  async execute(): Promise<TermixRunSummary> {
    const config = await this.d.api.contractsConfig();
    if (config.chainId !== BSC_CHAIN_ID) throw new Error(`TermiX backend is chain ${config.chainId}, not BNB Chain`);
    this.chainId = config.chainId;
    this.escrows = termixEscrows(config);

    const agent = (await this.d.api.agentByHandle(this.d.agentTokenId)).seller;
    if (!agent?.id) throw new Error(`TermiX does not list agent ${this.d.agentTokenId}`);
    if (agent.ownerAddress?.toLowerCase() !== this.d.chain.address.toLowerCase()) {
      throw new Error(`the provider key ${this.d.chain.address} does not own agent ${this.d.agentTokenId} on TermiX`);
    }
    this.agentId = agent.id;

    const orders = await this.listOrders();
    this.summary.orders = orders.length;
    let budget = this.d.maxJobsPerRun;
    let reads = this.d.maxJobsPerRun * READS_PER_JOB;
    for (const o of orders) {
      if (budget <= 0 || reads <= 0) break;
      if (o.status === 'DELIVERED' && !this.claimable(o, true)) continue;
      reads--;
      try {
        if (await this.process(o.id)) {
          budget--;
          this.summary.worked++;
        }
      } catch (err) {
        this.summary.errors++;
        this.d.log.error({ orderId: o.id, status: o.status, err: errText(err) }, 'TermiX order step failed');
        await this.patch(o.id, { lastError: errText(err) }).catch(() => undefined);
      }
    }
    return this.summary;
  }

  /** Orders that may need us, most committed first: in progress, then pending, then claimable; oldest first within each. */
  private async listOrders(): Promise<TermixOrder[]> {
    const all: TermixOrder[] = [];
    for (let page = 1; page <= LIST_PAGES; page++) {
      const res = await this.d.api.providerOrders({ providerAgentId: this.agentId, page, pageSize: PAGE_SIZE });
      const items = termixItems<TermixOrder>(res);
      all.push(...items);
      if (items.length < PAGE_SIZE || (res.totalPages !== undefined && page >= res.totalPages)) break;
    }
    const rank: Record<string, number> = { FUNDED: 0, IN_PROGRESS: 0, PENDING_ACCEPT: 1, DELIVERED: 2, IN_DISPUTE: 3 };
    const open = all.filter((o) => rank[o.status] !== undefined);
    // Never-read orders first, then the least recently read, so a pile of orders
    // waiting on buyers can't starve a new one out of the per-run read bound.
    const lastRead = new Map<string, string>();
    for (const o of open) lastRead.set(o.id, (await this.load(o.id)).lastReadAt ?? '');
    const created = (o: TermixOrder) => String(o.createdAt ?? '');
    return open.sort(
      (a, b) =>
        rank[a.status]! - rank[b.status]! ||
        lastRead.get(a.id)!.localeCompare(lastRead.get(b.id)!) ||
        created(a).localeCompare(created(b)),
    );
  }

  /** Past the challenge window (with a margin). For a list row without the window, `unknownIs` decides. */
  private claimable(order: TermixOrder, unknownIs = false): boolean {
    const ends = order.challengeWindowEndsAt ?? order.deadlines?.challengeWindowEndsAt;
    if (!ends) return unknownIs;
    return this.d.now().getTime() >= Date.parse(ends) + CLAIM_MARGIN_MS;
  }

  /** The delivery deadline has passed: TermiX lets anyone cancel the order and refund the buyer. */
  private pastDue(order: TermixOrder): boolean {
    const due = order.deliveryDueAt ?? order.deadlines?.deliveryDueAt;
    return Boolean(due) && this.d.now().getTime() > Date.parse(due!);
  }

  /** One order; true when it did work that counts against the per-run bound. */
  private async process(orderId: string): Promise<boolean> {
    const order = await this.d.api.order(orderId);
    if (order.seller?.id && order.seller.id !== this.agentId) return false;
    const state = await this.save(orderId, { ...(await this.load(orderId)), lastReadAt: this.d.now().toISOString() });
    switch (order.status) {
      case 'PENDING_ACCEPT':
        return this.pending(order, state);
      case 'FUNDED':
      case 'IN_PROGRESS':
        return this.deliver(order, state);
      case 'DELIVERED':
        return this.claim(order, state);
      case 'IN_DISPUTE':
        this.summary.disputes++;
        if (!state.messaged.includes('dispute-logged')) {
          this.d.log.warn({ orderId }, 'TermiX order is in dispute: post evidence by hand (docs/termix-provider.md)');
          await this.save(orderId, { ...state, messaged: [...state.messaged, 'dispute-logged'] });
        }
        return false;
      default:
        return false;
    }
  }

  // ── PENDING_ACCEPT ──────────────────────────────────────────────────────────

  private async pending(order: TermixOrder, state: OrderState): Promise<boolean> {
    if (state.acceptTx) {
      const r = await this.d.chain.receipt(state.acceptTx);
      if (r === 'success') {
        // Landed since the list was read: deliver now if TermiX has indexed it.
        const fresh = await this.d.api.order(order.id);
        if (fresh.status === 'FUNDED' || fresh.status === 'IN_PROGRESS') return this.deliver(fresh, state);
      }
      if (r === 'pending' || r === 'success') {
        this.d.log.info({ orderId: order.id, tx: state.acceptTx, receipt: r }, 'TermiX accept sent; waiting for it to land and be indexed');
        return false;
      }
      this.d.log.warn({ orderId: order.id, tx: state.acceptTx }, 'TermiX acceptOrder reverted');
      state = await this.save(order.id, { ...state, acceptTx: undefined, reverts: state.reverts + 1, lastError: 'acceptOrder reverted' });
    }
    if (this.stuck(order, state)) return false;
    if (this.pastDue(order)) {
      this.d.log.warn({ orderId: order.id }, 'TermiX order is past its delivery deadline; not accepting it');
      return false;
    }

    const parsed = parseHireTarget(await this.buyerTexts(order));
    if (!parsed.ok) {
      this.summary.waiting_input++;
      await this.messageOnce(order, state, parsed.reason, parsed.message);
      return false;
    }
    const key = targetKey(parsed.target);
    if (state.refusedTarget === key) {
      this.summary.refused++;
      return false;
    }

    const stored = await this.report(order, state, parsed.target, 0);
    if (!stored) return true;
    state = await this.load(order.id);

    const gasPrice = await this.d.chain.gasPriceWei();
    const need = ((TERMIX_MEASURED_GAS.acceptOrder + TERMIX_MEASURED_GAS.submitDelivery + TERMIX_MEASURED_GAS.claimAfterTimeout) * gasPrice * 12n) / 10n;
    const balance = await this.d.chain.balanceWei();
    if (balance < need) {
      this.d.log.error(
        { orderId: order.id, balanceWei: balance.toString(), needWei: need.toString(), wallet: this.d.chain.address },
        'TermiX provider wallet cannot pay the gas to accept, deliver and claim; leaving the order unaccepted',
      );
      return false;
    }

    const hash = await this.sendIntent(order, 'acceptOrder', await this.d.api.prepareProviderAccept(order.id));
    state = await this.save(order.id, { ...state, acceptTx: hash });
    this.d.log.info({ orderId: order.id, tx: hash, target: key }, 'TermiX acceptOrder sent');
    const receipt = await this.waitReceipt(hash);
    if (receipt === 'reverted') {
      await this.save(order.id, { ...state, acceptTx: undefined, reverts: state.reverts + 1, lastError: 'acceptOrder reverted' });
      throw new Error(`acceptOrder ${hash} reverted`);
    }
    if (receipt === 'pending') return true;
    this.summary.accepted++;

    for (let i = 0; i < INDEX_POLLS; i++) {
      const fresh = await this.d.api.order(order.id);
      if (fresh.status === 'FUNDED' || fresh.status === 'IN_PROGRESS') {
        await this.deliver(fresh, state);
        return true;
      }
      await this.d.sleep(POLL_MS);
    }
    this.d.log.info({ orderId: order.id }, 'TermiX has not indexed the accept yet; delivering next run');
    return true;
  }

  // ── FUNDED / IN_PROGRESS ────────────────────────────────────────────────────

  private async deliver(order: TermixOrder, state: OrderState): Promise<boolean> {
    const round = order.redoUsed ? 1 : 0;
    if (state.submitTx && state.submitRound === round) {
      const r = await this.d.chain.receipt(state.submitTx);
      if (r === 'success') await this.deliveredMessage(order, state, round);
      if (r === 'pending' || r === 'success') {
        this.d.log.info({ orderId: order.id, tx: state.submitTx, receipt: r }, 'TermiX delivery sent; waiting for it to land and be indexed');
        return false;
      }
      this.d.log.warn({ orderId: order.id, tx: state.submitTx }, 'TermiX submitDelivery reverted');
      state = await this.save(order.id, { ...state, submitTx: undefined, submits: Math.max(0, state.submits - 1), reverts: state.reverts + 1 });
    }
    if (this.stuck(order, state)) return false;
    if (this.pastDue(order)) {
      this.d.log.error({ orderId: order.id }, 'TermiX order is past its delivery deadline undelivered; not submitting (anyone can now cancel it)');
      return false;
    }
    if (state.submits >= MAX_SUBMITS) {
      this.d.log.warn({ orderId: order.id, submits: state.submits }, 'TermiX order wants another delivery after the redo; not sending a third');
      return false;
    }

    let target: HireAgentInput;
    const prior = await this.loadReport(order.id);
    if (prior) {
      target = prior.target;
    } else {
      // Accepted outside this worker (e.g. by hand on the website): read the note now.
      const parsed = parseHireTarget(await this.buyerTexts(order));
      if (!parsed.ok) {
        this.summary.waiting_input++;
        await this.messageOnce(order, state, parsed.reason, parsed.message);
        return false;
      }
      target = parsed.target;
    }
    const stored = await this.report(order, state, target, round);
    if (!stored) return true;
    state = await this.load(order.id);

    const deliverable = buildHireDeliverable({ orderId: order.id, target, report: stored.report });
    const registered = new Map<string, string>();
    for (const a of termixItems<{ id?: string; sha256?: string }>(await this.d.api.deliveryArtifacts(order.id))) {
      if (a.id && a.sha256) registered.set(a.sha256.toLowerCase(), a.id);
    }
    const artifactIds: string[] = [];
    for (const f of deliverable.files) {
      const existing = registered.get(f.sha256);
      if (existing) {
        artifactIds.push(existing);
        continue;
      }
      const upload = await this.d.api.deliveryUploadUrl(order.id, { fileName: f.fileName, contentType: f.contentType, sizeBytes: f.sizeBytes });
      await this.d.api.putUpload(upload, f.bytes, f.contentType);
      const art = await this.d.api.registerArtifact(order.id, {
        s3Key: upload.s3Key,
        url: upload.publicUrl,
        sha256: f.sha256,
        contentType: f.contentType,
        sizeBytes: f.sizeBytes,
      });
      artifactIds.push(art.id);
    }

    const intent = await this.d.api.prepareSubmitDelivery(order.id, { artifactIds, note: deliverable.note });
    const hash = await this.sendIntent(order, 'submitDelivery', intent);
    state = await this.save(order.id, { ...state, submitTx: hash, submitRound: round, submits: state.submits + 1 });
    this.d.log.info({ orderId: order.id, tx: hash, round, artifacts: artifactIds.length }, 'TermiX submitDelivery sent');
    const receipt = await this.waitReceipt(hash);
    if (receipt === 'reverted') {
      await this.save(order.id, { ...state, submitTx: undefined, submits: state.submits - 1, reverts: state.reverts + 1, lastError: 'submitDelivery reverted' });
      throw new Error(`submitDelivery ${hash} reverted`);
    }
    if (receipt === 'success') {
      this.summary.delivered++;
      await this.messageOnce(order, state, `delivered:${round}`, deliverable.message);
    }
    return true;
  }

  // ── DELIVERED ───────────────────────────────────────────────────────────────

  private async claim(order: TermixOrder, state: OrderState): Promise<boolean> {
    if (!this.claimable(order)) return false;
    if (state.claimTx) {
      const r = await this.d.chain.receipt(state.claimTx);
      if (r === 'pending' || r === 'success') return false;
      state = await this.save(order.id, { ...state, claimTx: undefined, reverts: state.reverts + 1, lastError: 'claimAfterTimeout reverted' });
    }
    if (this.stuck(order, state)) return false;
    let intent: TermixTxIntent;
    try {
      intent = await this.d.api.prepareClaimAfterTimeout(order.id);
    } catch (err) {
      // 400 = the window has not elapsed on TermiX's clock yet; try next run.
      if (err instanceof TermixApiError && err.status === 400) return false;
      throw err;
    }
    const hash = await this.sendIntent(order, 'claimAfterTimeout', intent);
    state = await this.save(order.id, { ...state, claimTx: hash });
    this.d.log.info({ orderId: order.id, tx: hash }, 'TermiX claimAfterTimeout sent');
    const receipt = await this.waitReceipt(hash);
    if (receipt === 'reverted') {
      await this.save(order.id, { ...state, claimTx: undefined, reverts: state.reverts + 1, lastError: 'claimAfterTimeout reverted' });
      throw new Error(`claimAfterTimeout ${hash} reverted`);
    }
    if (receipt === 'success') this.summary.claimed++;
    return true;
  }

  // ── helpers ─────────────────────────────────────────────────────────────────

  private stuck(order: TermixOrder, state: OrderState): boolean {
    if (state.reverts < MAX_REVERTS) return false;
    this.summary.errors++;
    this.d.log.error(
      { orderId: order.id, status: order.status, reverts: state.reverts, lastError: state.lastError },
      'TermiX order: transactions keep reverting; left for a human',
    );
    return true;
  }

  /** The summary message for a delivery that landed after the run that sent it. */
  private async deliveredMessage(order: TermixOrder, state: OrderState, round: number): Promise<void> {
    if (state.messaged.includes(`delivered:${round}`)) return;
    const stored = await this.loadReport(order.id);
    if (!stored) return;
    const { message } = buildHireDeliverable({ orderId: order.id, target: stored.target, report: stored.report });
    await this.messageOnce(order, state, `delivered:${round}`, message);
  }

  /** The frozen report for this order and round, running the check if needed; null when it could not run. */
  private async report(order: TermixOrder, state: OrderState, target: HireAgentInput, round: number): Promise<StoredReport | null> {
    const key = targetKey(target);
    const prior = await this.loadReport(order.id);
    if (prior && prior.targetKey === key && prior.round === round) return prior;
    try {
      const report = await this.d.runHireCheck(target);
      const stored: StoredReport = { targetKey: key, target, round, report };
      await this.d.store.setEx(REPORT_KEY(order.id), JSON.stringify(stored), STATE_TTL_SEC);
      await this.save(order.id, { ...state, attempts: 0, lastError: undefined });
      this.d.log.info({ orderId: order.id, target: key, round, passes: report.summary.passes_three_independent }, 'TermiX hire check ran');
      return stored;
    } catch (err) {
      if (err instanceof HireCheckError) {
        this.summary.refused++;
        const next = await this.save(order.id, { ...state, refusedTarget: key, lastError: err.message });
        await this.messageOnce(
          order,
          next,
          `refused:${key}`,
          `${err.message}. Reply with another ERC-8004 agent id on BNB Chain or owner address, or cancel the order: it was not accepted, so your escrow comes back in full.`,
        );
        this.d.log.info({ orderId: order.id, target: key, code: err.code }, 'TermiX order refused: the check cannot serve this input');
        return null;
      }
      this.summary.errors++;
      const attempts = state.attempts + 1;
      const next = await this.save(order.id, { ...state, attempts, lastError: errText(err) });
      this.d.log.warn({ orderId: order.id, target: key, attempts, err: errText(err) }, 'TermiX hire check failed; order left unaccepted, retrying next run');
      if (attempts >= SOURCES_DOWN_AFTER && round === 0) await this.messageOnce(order, next, 'sources', SOURCES_DOWN_MESSAGE);
      return null;
    }
  }

  private async sendIntent(order: TermixOrder, action: TermixProviderAction, intent: TermixTxIntent): Promise<Hex> {
    if (!order.chainOrderId) throw new Error('order has no chainOrderId yet');
    const checked = checkProviderIntent(intent, { action, chainId: this.chainId, escrows: this.escrows, chainOrderId: order.chainOrderId });
    return this.d.chain.send(checked);
  }

  private async waitReceipt(hash: string): Promise<ReceiptStatus> {
    for (let i = 0; i < RECEIPT_POLLS; i++) {
      const r = await this.d.chain.receipt(hash);
      if (r !== 'pending') return r;
      await this.d.sleep(POLL_MS);
    }
    return 'pending';
  }

  /** Text the buyer wrote: note-like fields on the order and their own messages in its thread. Never the listing copy. */
  private async buyerTexts(order: TermixOrder): Promise<string[]> {
    const texts: string[] = [];
    for (const k of ['note', 'buyerNote', 'requirements', 'instructions']) {
      const v = order[k];
      if (typeof v === 'string' && v.trim()) texts.push(v);
    }
    const convId = conversationId(order);
    if (!convId) {
      this.d.log.warn({ orderId: order.id }, 'TermiX order has no conversation id; cannot read the buyer note');
      return texts;
    }
    const buyer = new Set([order.buyer?.id, order.buyer?.walletAddress].filter((v): v is string => Boolean(v)).map((v) => v.toLowerCase()));
    for (const m of termixItems<Record<string, unknown>>(await this.d.api.conversationMessages(convId))) {
      if (typeof m.text !== 'string' || !isFromBuyer(m, buyer)) continue;
      texts.push(m.text);
    }
    return texts;
  }

  private async messageOnce(order: TermixOrder, state: OrderState, kind: string, text: string): Promise<void> {
    if (state.messaged.includes(kind)) return;
    const convId = conversationId(order);
    if (!convId) return;
    try {
      await this.d.api.sendMessage(convId, text, this.agentId);
      await this.save(order.id, { ...state, messaged: [...state.messaged, kind] });
    } catch (err) {
      this.d.log.warn({ orderId: order.id, kind, err: errText(err) }, 'TermiX message to buyer failed');
    }
  }

  private async load(orderId: string): Promise<OrderState> {
    const raw = await this.d.store.get(TERMIX_ORDER_KEY(orderId));
    const parsed = raw ? (JSON.parse(raw) as Partial<OrderState>) : {};
    return { attempts: 0, submits: 0, reverts: 0, messaged: [], ...parsed };
  }

  private async loadReport(orderId: string): Promise<StoredReport | null> {
    const raw = await this.d.store.get(REPORT_KEY(orderId));
    return raw ? (JSON.parse(raw) as StoredReport) : null;
  }

  private async save(orderId: string, state: OrderState): Promise<OrderState> {
    const next = { ...state, updatedAt: this.d.now().toISOString() };
    await this.d.store.setEx(TERMIX_ORDER_KEY(orderId), JSON.stringify(next), STATE_TTL_SEC);
    return next;
  }

  private async patch(orderId: string, patch: Partial<OrderState>): Promise<void> {
    await this.save(orderId, { ...(await this.load(orderId)), ...patch });
  }
}

const SYSTEM_KINDS = new Set(['SYSTEM', 'ORDER_EVENT', 'OFFER_EVENT']);

function isFromBuyer(m: Record<string, unknown>, buyer: Set<string>): boolean {
  if (typeof m.kind === 'string' && SYSTEM_KINDS.has(m.kind)) return false;
  const from = (m.from ?? m.sender ?? m.author) as Record<string, unknown> | undefined;
  const ids = [from?.accountId, from?.id, from?.walletAddress, m.senderAccountId, m.authorAccountId, m.accountId];
  return ids.some((v) => typeof v === 'string' && buyer.has(v.toLowerCase()));
}

function conversationId(order: TermixOrder): string | null {
  return order.conversationId ?? order.conversation?.id ?? null;
}

/** One pass over the agent's orders. Holds a Redis lock so two indexers never work the same order. */
export async function runTermixProvider(deps: TermixProviderDeps): Promise<TermixRunSummary> {
  const token = `${process.pid}:${deps.now().getTime()}`;
  if (!(await deps.store.setNxPx(LOCK_KEY, token, LOCK_MS))) {
    return { skipped: 'locked', orders: 0, worked: 0, accepted: 0, delivered: 0, claimed: 0, waiting_input: 0, refused: 0, disputes: 0, errors: 0 };
  }
  try {
    const summary = await new Run(deps).execute();
    deps.log.info({ ...summary }, 'TermiX provider run');
    return summary;
  } finally {
    if ((await deps.store.get(LOCK_KEY)) === token) await deps.store.del(LOCK_KEY);
  }
}

// ─── production wiring ────────────────────────────────────────────────────────

function viemSender(config: TermixProviderConfig): TermixChainSender {
  const account = privateKeyToAccount(config.privateKey);
  const transport = http(config.bscRpcUrl, { timeout: 20_000, retryCount: 2 });
  const pub = createPublicClient({ chain: bsc, transport });
  const wallet = createWalletClient({ account, chain: bsc, transport });
  const floor = BigInt(Math.round(0.05 * GWEI));
  const cap = BigInt(Math.round(config.maxGasPriceGwei * GWEI));
  const gasPriceWei = async () => {
    const quoted = await pub.getGasPrice();
    return quoted < floor ? floor : quoted > cap ? cap : quoted;
  };
  return {
    address: account.address,
    balanceWei: () => pub.getBalance({ address: account.address }),
    gasPriceWei,
    async send(tx) {
      if ((await pub.getChainId()) !== BSC_CHAIN_ID) throw new Error('provider RPC is not BNB Chain');
      const gas = ((await pub.estimateGas({ account, to: tx.to, data: tx.data, value: 0n })) * 12n) / 10n;
      return wallet.sendTransaction({ to: tx.to, data: tx.data, value: 0n, gas, gasPrice: await gasPriceWei() });
    },
    async receipt(hash) {
      try {
        const r = await pub.getTransactionReceipt({ hash: hash as Hex });
        return r.status === 'success' ? 'success' : 'reverted';
      } catch {
        return 'pending';
      }
    },
  };
}

function hireCheckRunner(config: TermixProviderConfig, redis: Redis) {
  return async (target: HireAgentInput): Promise<HireReport> => {
    const cached = await redis.get(HIRES_CACHE_KEY(target));
    if (cached) return JSON.parse(cached) as HireReport;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('hire check did not finish in time')), HIRES_BUDGET_MS);
    });
    try {
      const head = Number(BigInt(await jsonRpcResult<string>(config.alchemyUrl, 'eth_blockNumber', [], 10_000)));
      const report = await Promise.race([
        runHireCheck({ agent: target, head, alchemyUrl: config.alchemyUrl, log: { warn: (msg) => logger.warn({ msg: redact(msg) }, 'hire check') } }),
        timeout,
      ]);
      await redis.set(HIRES_CACHE_KEY(target), JSON.stringify(report), 'EX', HIRES_CACHE_SEC);
      return report;
    } finally {
      clearTimeout(timer);
    }
  };
}

export function productionDeps(config: TermixProviderConfig, redis: Redis): TermixProviderDeps {
  const account = privateKeyToAccount(config.privateKey);
  const api = new TermixClient({
    baseUrl: config.apiBase,
    signer: { address: account.address, signMessage: (message) => account.signMessage({ message }) },
  });
  return {
    api,
    chain: viemSender(config),
    runHireCheck: hireCheckRunner(config, redis),
    store: redisStore(redis),
    log: logger,
    now: () => new Date(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    agentTokenId: config.agentTokenId,
    maxJobsPerRun: config.maxJobsPerRun,
  };
}

/** The worker, or null when the provider is off (no flag, no key, or no RPC). */
export function createTermixProviderWorker(env: Record<string, string | undefined> = process.env): Worker | null {
  const cfg = termixProviderConfig(env);
  if (!cfg.enabled) return null;
  const redis = getRedis();
  // One client for the process: the TermiX session is kept between runs.
  const deps = productionDeps(cfg.config, redis);
  return new Worker(QUEUE, async () => runTermixProvider(deps), { connection: redis, concurrency: 1 });
}

export async function setupTermixProviderSchedule(redis: Redis, env: Record<string, string | undefined> = process.env) {
  const queue = new Queue(QUEUE, { connection: redis });
  for (const job of await queue.getRepeatableJobs()) await queue.removeRepeatableByKey(job.key);
  const cfg = termixProviderConfig(env);
  if (cfg.enabled) {
    await queue.add(QUEUE, {}, { repeat: { every: EVERY_MS }, jobId: QUEUE, removeOnComplete: 100, removeOnFail: 100 });
    logger.info({ agent: cfg.config.agentTokenId, maxJobsPerRun: cfg.config.maxJobsPerRun }, 'TermiX provider scheduled (every 2 minutes)');
  } else {
    logger.info({ reason: cfg.reason }, 'TermiX provider off');
  }
  await queue.close();
}
