'use client';

import type { ReactNode } from 'react';
import { useNodeProvenance, type NodeProvenanceStatus } from '@/lib/provenance';

/**
 * Inline provenance-gated wording. Renders `neutral` (true regardless of data
 * source) by default — including in the static/prerendered HTML — and upgrades
 * to `live` only once live telemetry confirms our node is online and at head.
 *
 *   <NodeClaim live="our own Base node" neutral="the chain" />
 */
export function NodeClaimText({
  status,
  live,
  neutral,
}: {
  status: NodeProvenanceStatus;
  live: ReactNode;
  neutral: ReactNode;
}) {
  return <>{status === 'live' ? live : neutral}</>;
}

export function NodeClaim({ live, neutral }: { live: ReactNode; neutral: ReactNode }) {
  const { status } = useNodeProvenance();
  return <NodeClaimText status={status} live={live} neutral={neutral} />;
}

/**
 * The honest clause for the footer: states the node's real condition and where
 * readings come from meanwhile. Renders nothing when live or unknown, so the
 * static HTML never carries a stale status.
 */
export function NodeSyncNoteText({
  status,
  lag,
}: {
  status: NodeProvenanceStatus;
  lag: number | null;
}) {
  if (status === 'syncing') {
    const behind = lag != null ? `, ${lag.toLocaleString()} blocks behind` : '';
    return (
      <>
        {' '}
        Our node is resyncing{behind}; readings come from a public Base RPC until it
        is back at head.
      </>
    );
  }
  if (status === 'offline') {
    return <> Our node is offline; readings come from a public Base RPC meanwhile.</>;
  }
  return null;
}

export function NodeSyncNote() {
  const { status, lag } = useNodeProvenance();
  return <NodeSyncNoteText status={status} lag={lag} />;
}
