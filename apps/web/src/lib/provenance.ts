import { useEffect, useState } from 'react';
import { fetchDedup } from './api-dedup';

/**
 * Node provenance — the single source of truth for whether the site may say
 * "our own Base node" right now.
 *
 * PROVENANCE RULE (brand-critical): the own-node claim is made ONLY when the
 * API's probe of our node succeeded, the node is online, and it reports a tip.
 * While it syncs, is degraded, or is down, every claim falls back to neutral
 * wording that is true regardless of source. Never fake it.
 */

export type SignalStatus = 'online' | 'syncing' | 'degraded' | 'offline';

/** Shape of GET /api/telemetry (data). Mirrors apps/api telemetry route. */
export interface Telemetry {
  /** Network head from public reference sources (mainnet.base.org / blockscout). */
  baseTip: number | null;
  indexerStatus: SignalStatus;
  indexerLastTxAt: string | null;
  /** Our actual Base node (cw-sentinel), probed directly by the API. */
  nodeConfigured?: boolean;
  nodeTip?: number | null;
  nodeLag?: number | null;
  nodeStatus?: SignalStatus;
}

export type NodeProvenanceStatus = 'unknown' | 'live' | 'syncing' | 'offline';

export interface NodeProvenance {
  status: NodeProvenanceStatus;
  /** Blocks behind the network head, when the node reports it. */
  lag: number | null;
}

const UNKNOWN: NodeProvenance = { status: 'unknown', lag: null };

export function deriveNodeProvenance(tel: Telemetry | null | undefined): NodeProvenance {
  if (!tel || !tel.nodeConfigured) return UNKNOWN;
  const lag = tel.nodeLag ?? null;
  if (tel.nodeStatus === 'online' && tel.nodeTip != null) return { status: 'live', lag };
  if (tel.nodeStatus === 'syncing' || tel.nodeStatus === 'degraded') {
    return { status: 'syncing', lag };
  }
  if (tel.nodeStatus === 'online') return { status: 'syncing', lag };
  return { status: 'offline', lag: null };
}

const REFRESH_MS = 15_000;

/**
 * Live telemetry, deduplicated across every component on the page and
 * refreshed every 15s. Starts as `null` so the first render (and any server
 * render) derives `unknown` → neutral wording.
 */
export function useTelemetry(): Telemetry | null {
  const [tel, setTel] = useState<Telemetry | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchDedup<Telemetry>('/api/telemetry')
        .then((t) => {
          if (!cancelled) setTel(t);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);
  return tel;
}

export function useNodeProvenance(): NodeProvenance {
  return deriveNodeProvenance(useTelemetry());
}
