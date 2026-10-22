/**
 * The stock buyer, replayed offline: @x402/fetch 2.27.0's wrapFetchWithPayment over
 * @x402/evm 2.27.0's registerExactEvmScheme, signing with a throwaway key. Its fetch
 * is ours: the first call hands back the recorded 402, the paid retry is captured and
 * answered locally. Nothing is signed for or sent to any seller, and no RPC is used.
 * (The lint run's sim.mjs, through the same code path @x402/fetch takes.)
 */
import { wrapFetchWithPayment, x402Client } from '@x402/fetch';
import { registerExactEvmScheme } from '@x402/evm/exact/client';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { acceptsOf, parseChallenge, type Json } from './challenge.js';
import type { ProbeRecord } from './probe.js';

export interface SelectedOffer {
  scheme: Json | undefined;
  network: Json | undefined;
  asset: Json | undefined;
  amount: Json | undefined;
  payTo: Json | undefined;
  maxTimeoutSeconds: Json | undefined;
  extra: Json | undefined;
}

export interface Replay {
  ok: boolean;
  /** Where the stock client stopped: reading the 402, or building the payment. */
  stage?: 'parse' | 'payload' | 'other';
  /** The client's own message, without @x402/fetch's wrapper prefix (as sim.mjs saw it). */
  error?: string;
  selected?: SelectedOffer | null;
  /** The EIP-712 domain the buyer signed under. */
  domain?: Record<string, unknown>;
  primaryType?: string;
  validBefore?: string;
  validitySeconds?: number | null;
  /** The x402 version of the payment the buyer would have sent. */
  paidVersion?: number;
}

export type BuyerProfile =
  /** @x402/fetch defaults: default tokens only, $1 cap. */
  | 'standard'
  /** The same client after opting in to any token (allowedAssets: true); default tokens keep the $1 cap. */
  | 'any-token';

const PREFIXES: [RegExp, Replay['stage']][] = [
  [/^Failed to parse payment requirements: /, 'parse'],
  [/^Failed to create payment payload: /, 'payload'],
];

function recordedResponse(rec: ProbeRecord): Response {
  const headers = new Headers();
  for (const name of ['payment-required', 'content-type']) {
    const v = rec.headers?.[name];
    if (v !== undefined) {
      try {
        headers.set(name, v);
      } catch {
        // A header value fetch can't carry; the stock client wouldn't see it either.
      }
    }
  }
  return new Response(rec.bodyText ?? '', { status: rec.status ?? 402, headers });
}

/** Replay one recorded 402 through the stock client. Never throws. */
export async function replay(rec: ProbeRecord, profile: BuyerProfile = 'standard'): Promise<Replay> {
  const account = privateKeyToAccount(generatePrivateKey());
  const captured: { domain: Record<string, unknown>; primaryType: string }[] = [];
  const signer = {
    address: account.address,
    async signTypedData(args: Parameters<typeof account.signTypedData>[0]) {
      captured.push({ domain: { ...(args.domain as Record<string, unknown>) }, primaryType: String(args.primaryType) });
      return account.signTypedData(args);
    },
  };
  const client = new x402Client();
  registerExactEvmScheme(client, { signer });
  if (profile === 'any-token') client.setSpendControls({ allowedAssets: true });

  let paidRequest: Request | null = null;
  let calls = 0;
  // Our own fetch: never touches the network.
  const offline = async (input: RequestInfo | URL): Promise<Response> => {
    calls++;
    if (calls === 1) return recordedResponse(rec);
    paidRequest = input instanceof Request ? input : new Request(input);
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const pay = wrapFetchWithPayment(offline as typeof fetch, client);
  const init: RequestInit = { method: rec.method };
  if (rec.request.body !== undefined && rec.method !== 'GET' && rec.method !== 'HEAD') {
    init.body = rec.request.body;
    init.headers = { 'content-type': 'application/json' };
  }
  const started = Math.floor(Date.now() / 1000);
  try {
    await pay(rec.url, init);
  } catch (e) {
    let msg = String((e as Error)?.message ?? e);
    let stage: Replay['stage'] = 'other';
    for (const [re, s] of PREFIXES) {
      if (re.test(msg)) {
        msg = msg.replace(re, '');
        stage = s;
      }
    }
    return { ok: false, stage, error: msg.slice(0, 400) };
  }
  const header = (paidRequest as Request | null)?.headers.get('payment-signature') ?? (paidRequest as Request | null)?.headers.get('x-payment');
  if (!header) return { ok: false, stage: 'other', error: 'the client sent no payment' };
  const payload = JSON.parse(Buffer.from(header, 'base64').toString('utf8')) as {
    x402Version?: number;
    accepted?: Record<string, Json>;
    payload?: { authorization?: Record<string, unknown>; permit2Authorization?: Record<string, unknown> };
    scheme?: string;
    network?: string;
  };
  // A v1 payment names only its scheme and network; match it back to the offer (as sim.mjs did).
  const sel =
    payload.accepted ??
    acceptsOf(parseChallenge(rec).stock).find((o) => o.scheme === payload.scheme && o.network === payload.network);
  const inner = payload.payload ?? {};
  const auth = inner.authorization ?? inner.permit2Authorization ?? null;
  const out: Replay = {
    ok: true,
    paidVersion: payload.x402Version,
    selected: sel
      ? {
          scheme: sel.scheme,
          network: sel.network,
          asset: sel.asset,
          amount: sel.amount ?? sel.maxAmountRequired,
          payTo: sel.payTo,
          maxTimeoutSeconds: sel.maxTimeoutSeconds,
          extra: sel.extra,
        }
      : null,
  };
  const sig = captured[0];
  if (sig) {
    out.domain = { ...sig.domain, chainId: Number(sig.domain.chainId) };
    out.primaryType = sig.primaryType;
  }
  const vb = (auth?.validBefore ?? auth?.deadline) as string | number | bigint | undefined;
  if (vb !== undefined) {
    out.validBefore = String(vb);
    const secs = Number(vb);
    out.validitySeconds = Number.isFinite(secs) ? secs - started : null;
  }
  return out;
}
