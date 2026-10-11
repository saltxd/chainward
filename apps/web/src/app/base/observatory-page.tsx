'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { usePressPalette, type PressPalette } from '@/lib/pressPalette';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { PressShell, Masthead, PressDateline, Colophon, BriefOffer } from '@/components/press';
import { fetchDedup } from '@/lib/api-dedup';
import type { ObservatoryFeedItem, ObservatoryInitial, TrendPoint } from '@/lib/observatory';
import { ObservatoryHero, TopAgentsPanel, WirePanel } from './observatory-sections';

function formatChartDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

async function fetchFeed(): Promise<ObservatoryFeedItem[] | null> {
  try {
    return await fetchDedup<ObservatoryFeedItem[]>('/api/observatory/feed');
  } catch {
    return null;
  }
}

// Chart furniture comes from usePressPalette() (light or night paper).
function chartTooltip(palette: PressPalette) {
  return {
    backgroundColor: palette.paper2,
    border: `1px solid ${palette.ruleStrong}`,
    borderRadius: 0,
    fontSize: 11,
    fontFamily: 'var(--font-mono), ui-monospace, monospace',
  };
}

function TrendChart({
  title,
  note,
  points,
  name,
  palette,
}: {
  title: string;
  note: string;
  points: TrendPoint[];
  name: string;
  palette: PressPalette;
}) {
  const data = points.map((d) => ({ date: formatChartDate(d.date), count: d.count ?? 0 }));
  return (
    <div className="obs-panel">
      <h2 className="obs-h2 press-display">{title}</h2>
      <div className="obs-chart-note press-label">{note}</div>
      <div className="obs-chart">
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="date"
              stroke={palette.inkFaint}
              fontSize={10}
              tickLine={false}
              axisLine={false}
              minTickGap={32}
            />
            <YAxis stroke={palette.inkFaint} fontSize={10} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip
              contentStyle={chartTooltip(palette)}
              labelStyle={{ color: palette.inkSoft }}
              itemStyle={{ color: palette.ink }}
              cursor={{ stroke: palette.ruleStrong }}
            />
            <Area
              type="monotone"
              dataKey="count"
              stroke={palette.ink}
              fill={palette.ink}
              fillOpacity={0.07}
              strokeWidth={1.25}
              name={name}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/**
 * /base. The server reads the summary, lists, trends and the x402 board and
 * hands them in as `initial`, so the HTML carries the numbers. In the browser
 * only the wire refreshes, once a minute.
 */
export function ObservatoryPage({ initial, children }: { initial: ObservatoryInitial; children?: ReactNode }) {
  const palette = usePressPalette();
  const [feed, setFeed] = useState<ObservatoryFeedItem[] | null>(initial.feed);

  useEffect(() => {
    const refresh = async () => {
      const f = await fetchFeed();
      if (f) setFeed(f);
    };
    // The server read can fail on a cold API; try once from the browser.
    if (!initial.feed) void refresh();
    const interval = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(interval);
  }, [initial.feed]);

  const trends = initial.trends;

  return (
    <PressShell>
      <PressDateline />
      <div className="press-wrap">
        <Masthead />

        <ObservatoryHero overview={initial.overview} trends={trends} />

        <section className="obs-grid">
          <TopAgentsPanel mostActive={initial.mostActive} x402={initial.x402} />
          <WirePanel feed={feed} />
        </section>

        {trends && trends.dailyTxCount.length > 0 && (
          <section className="obs-charts">
            <TrendChart
              title="Agents active per day"
              note="Trailing 30 days · wallets with at least one transfer"
              points={trends.dailyActiveAgents}
              name="agents"
              palette={palette}
            />
            <TrendChart
              title="Transfers per day"
              note="Trailing 30 days · spam tokens left out"
              points={trends.dailyTxCount}
              name="transfers"
              palette={palette}
            />
          </section>
        )}

        <BriefOffer
          placement="observatory"
          title="Need one of these agents traced end to end?"
          lede="The observatory shows activity. The Intel Brief is the full investigation of one agent or wallet: we trace the fund flows, test every public claim against on-chain evidence, and hand you a written brief you can cite."
        />

        {children}

        <Colophon />
      </div>

      <style>{`
        .obs-lead { padding: 44px 0 0; }
        .obs-title {
          margin: 14px 0 0;
          font-size: clamp(36px, 5.6vw, 64px);
          line-height: 1.08;
          letter-spacing: -0.01em;
        }
        .obs-lede {
          margin: 20px 0 0;
          font-family: var(--font-text);
          font-size: 18px;
          line-height: 1.55;
          color: var(--ink-soft);
          max-width: 680px;
        }
        .obs-stats {
          margin-top: 32px;
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1px;
          background: var(--rule);
          border: 1px solid var(--rule);
          border-top: 3px double var(--rule-strong);
        }
        .obs-stat {
          background: var(--paper);
          padding: 16px 18px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .obs-stat-label {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ink-faint);
        }
        .obs-stat-value {
          font-size: 24px;
          line-height: 1;
          color: var(--ink);
        }
        .obs-note {
          margin: 12px 0 0;
          font-family: var(--font-text);
          font-size: 14px;
          line-height: 1.5;
          color: var(--ink-faint);
          max-width: 680px;
        }
        @media (max-width: 960px) {
          .obs-stats { grid-template-columns: repeat(2, 1fr); }
        }

        .obs-h2 { margin: 0 0 10px; font-size: clamp(22px, 2.8vw, 30px); }
        .obs-grid {
          padding-top: 52px;
          display: grid;
          grid-template-columns: 1.4fr 1fr;
          gap: 48px;
          align-items: start;
        }
        .obs-grid > *, .obs-charts > * { min-width: 0; }
        @media (max-width: 1100px) {
          .obs-grid { grid-template-columns: 1fr; }
        }

        .obs-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 0;
          border-bottom: 1px solid var(--rule-strong);
          margin-bottom: 0;
        }
        .obs-tab {
          background: transparent;
          border: none;
          padding: 9px 14px;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ink-faint);
          cursor: pointer;
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
          transition: color 0.15s, border-color 0.15s;
        }
        .obs-tab:hover { color: var(--oxblood); }
        .obs-tab-active { color: var(--oxblood); border-bottom-color: var(--oxblood); }

        .obs-table { border-bottom: 1px solid var(--rule-strong); }
        .obs-thead {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ink-faint);
          border-bottom: 1px solid var(--rule-strong);
          padding: 10px 4px;
        }
        .obs-row {
          padding: 11px 4px;
          border-bottom: 1px solid var(--rule);
          text-decoration: none;
          color: inherit;
          transition: background 0.12s;
        }
        .obs-row:hover { background: var(--oxblood-wash); }
        .obs-row:last-child { border-bottom: none; }
        .obs-lb-row {
          display: grid;
          grid-template-columns: 34px minmax(0, 1fr) 110px 90px;
          gap: 14px;
          align-items: center;
        }
        .obs-x4-row {
          display: grid;
          grid-template-columns: 34px minmax(0, 1fr) 150px 90px;
          gap: 14px;
          align-items: center;
        }
        .obs-feed-row {
          display: grid;
          grid-template-columns: 64px minmax(0, 1fr) 40px 64px 78px;
          gap: 10px;
          align-items: center;
        }
        .obs-rank { font-size: 12px; color: var(--ink-faint); }
        .obs-agent { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .obs-agent-name {
          font-family: var(--font-text);
          font-size: 15px;
          color: var(--ink);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .obs-row:hover .obs-agent-name { color: var(--oxblood); }
        .obs-agent-addr { font-size: 10.5px; color: var(--ink-faint); }
        .obs-framework { font-size: 11px; letter-spacing: 0.04em; color: var(--ink-faint); text-transform: lowercase; }
        .obs-verdict { font-family: var(--font-text); font-size: 14px; color: var(--ink); }
        .obs-value { font-size: 12.5px; color: var(--ink); }
        .obs-right { text-align: right; }
        .obs-time { font-size: 11px; color: var(--ink-faint); }
        .obs-dir { font-size: 10.5px; letter-spacing: 0.08em; }
        .obs-token { font-size: 11.5px; color: var(--ink-soft); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .obs-usd { font-size: 12px; color: var(--ink); }
        .obs-empty {
          padding: 32px 4px;
          font-family: var(--font-text);
          font-style: italic;
          font-size: 15px;
          color: var(--ink-faint);
        }
        .obs-panel-foot {
          margin: 12px 0 0;
          font-family: var(--font-text);
          font-size: 14px;
          line-height: 1.5;
          color: var(--ink-soft);
        }
        .obs-feed-note, .obs-chart-note { display: block; margin-bottom: 10px; }

        @media (max-width: 560px) {
          .obs-lb-row { grid-template-columns: 28px minmax(0, 1fr) 70px; }
          .obs-lb-row .obs-framework { display: none; }
          .obs-x4-row { grid-template-columns: 28px minmax(0, 1fr) 110px; }
          .obs-x4-row .obs-value { display: none; }
          .obs-feed-row { grid-template-columns: 56px minmax(0, 1fr) 70px; }
          .obs-feed-row .obs-dir, .obs-feed-row .obs-token { display: none; }
        }

        .obs-charts {
          padding-top: 52px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 48px;
        }
        @media (max-width: 960px) {
          .obs-charts { grid-template-columns: 1fr; }
        }
        .obs-chart {
          border: 1px solid var(--rule);
          background: var(--paper-2);
          padding: 14px 10px 6px;
        }
      `}</style>
    </PressShell>
  );
}
