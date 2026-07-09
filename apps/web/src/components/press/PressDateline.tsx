'use client';

import { useEffect, useState } from 'react';
import { fetchDedup } from '@/lib/api-dedup';

type SignalStatus = 'online' | 'syncing' | 'degraded' | 'offline';

interface Telemetry {
  baseTip: number | null;
  sentinelStatus: SignalStatus;
  indexerStatus: SignalStatus;
  indexerLastTxAt: string | null;
}

/**
 * The dateline — an editorial "wire" strip that doubles as an honesty signal:
 * this publication reads Base from its own node, and here is the block it is
 * reading right now. Same telemetry the dark dashboard ticker uses, restyled
 * as ledger furniture. Non-critical: renders placeholders until data lands.
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

  const nodeUp = tel ? tel.sentinelStatus === 'online' : true;
  const indexerUp = tel ? tel.indexerStatus !== 'offline' && tel.indexerStatus !== 'degraded' : true;
  const nodeDotClass = !tel
    ? 'ph-dateline-dot'
    : nodeUp
      ? 'ph-dateline-dot'
      : tel.sentinelStatus === 'offline'
        ? 'ph-dateline-dot ph-dateline-dot--down'
        : 'ph-dateline-dot ph-dateline-dot--warn';

  const block = tel?.baseTip ? `#${tel.baseTip.toLocaleString()}` : '—';

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
            Our node reading&nbsp;<b className="mono">{block}</b>
          </span>
          <span className="ph-dateline-sep" aria-hidden>
            ·
          </span>
          <span className="ph-dateline-item">
            <span className={nodeDotClass} aria-hidden />
            Node {nodeUp ? 'live' : 'lagging'}
          </span>
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
