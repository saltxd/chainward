'use client';

import { useEffect, useState } from 'react';
import { fetchDedup } from '@/lib/api-dedup';

type SignalStatus = 'online' | 'syncing' | 'degraded' | 'offline';

interface Telemetry {
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

/**
 * The dateline — an editorial "wire" strip that doubles as an honesty signal.
 * PROVENANCE RULE (brand-critical): the block number is labeled "Our node
 * reading" ONLY when it comes from our own Base node and that node is at head.
 * While the node is syncing or down, the strip says "Network reading" (the
 * public reference tip) and states the node's real condition. Never fake it.
 */
export function PressDateline() {
  const [tel, setTel] = useState<Telemetry | null>(null);
  // Computed client-side only — a locale/timezone date rendered during SSR would
  // mismatch on hydration (server UTC vs the visitor's local date).
  const [edition, setEdition] = useState('');

  useEffect(() => {
    setEdition(
      new Date()
        .toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
        .toUpperCase(),
    );
  }, []);

  useEffect(() => {
    const load = () =>
      fetchDedup<Telemetry>('/api/telemetry')
        .then((d) => d && setTel(d))
        .catch(() => {});
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);

  // Only claim "our node" when the probe of OUR node succeeded and it's at head.
  const nodeLive =
    !!tel?.nodeConfigured && tel.nodeStatus === 'online' && tel.nodeTip != null;
  const nodeSyncing =
    !!tel?.nodeConfigured &&
    (tel.nodeStatus === 'syncing' || tel.nodeStatus === 'degraded');

  const readingLabel = nodeLive ? 'Our node reading' : 'Network reading';
  const readingBlock = nodeLive
    ? `#${tel!.nodeTip!.toLocaleString()}`
    : tel?.baseTip
      ? `#${tel.baseTip.toLocaleString()}`
      : '—';

  // Node condition item — only rendered when a node is actually configured.
  const nodeItem = (() => {
    if (!tel || !tel.nodeConfigured) return null;
    if (nodeLive) {
      return { dot: 'ph-dateline-dot', text: 'Node live' };
    }
    if (nodeSyncing) {
      const behind =
        tel.nodeLag != null ? ` · ${tel.nodeLag.toLocaleString()} behind` : '';
      return {
        dot: 'ph-dateline-dot ph-dateline-dot--warn',
        text: `Node syncing${behind} · via fallback`,
      };
    }
    return { dot: 'ph-dateline-dot ph-dateline-dot--down', text: 'Node offline · via fallback' };
  })();

  const indexerUp = tel
    ? tel.indexerStatus !== 'offline' && tel.indexerStatus !== 'degraded'
    : true;

  return (
    <div className="ph-dateline">
      <div className="press-wrap">
        <div className="ph-dateline-row">
          <span className="ph-dateline-item">Base Mainnet</span>
          <span className="ph-dateline-sep" aria-hidden>
            ·
          </span>
          {edition && (
            <>
              <span className="ph-dateline-item">Edition {edition}</span>
              <span className="ph-dateline-sep" aria-hidden>
                ·
              </span>
            </>
          )}
          <span className="ph-dateline-item">
            {readingLabel}&nbsp;<b className="mono">{readingBlock}</b>
          </span>
          {nodeItem && (
            <>
              <span className="ph-dateline-sep" aria-hidden>
                ·
              </span>
              <span className="ph-dateline-item">
                <span className={nodeItem.dot} aria-hidden />
                {nodeItem.text}
              </span>
            </>
          )}
          <span className="ph-dateline-sep" aria-hidden>
            ·
          </span>
          <span className="ph-dateline-item">
            Indexer {indexerUp ? 'live' : 'stalled'}
          </span>
        </div>
      </div>
    </div>
  );
}
