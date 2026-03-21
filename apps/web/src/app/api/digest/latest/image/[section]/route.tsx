import { ImageResponse } from '@vercel/og';

// ── Design constants ──────────────────────────────────────────────────
const BG = '#0a0a12';
const BG_CARD = '#12121f';
const GREEN = '#4ade80';
const WHITE = '#ffffff';
const GRAY = '#a1a1aa';
const DARK_GRAY = '#52525b';
const BORDER = '#1e1e2e';

const WIDTH = 1200;
const HEIGHT = 675;

// ── Number formatting ─────────────────────────────────────────────────
function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── Data fetching ─────────────────────────────────────────────────────
const API_URL = process.env.API_INTERNAL_URL || 'http://localhost:8000';

interface DigestData {
  headline?: {
    totalRevenue?: number;
    totalJobs?: number;
    activeAgents?: number;
    weekLabel?: string;
  };
  leaderboards?: {
    mostProfitable?: Array<{ name: string; revenue: number }>;
  };
  spotlight?: {
    name?: string;
    revenue?: number;
    jobs?: number;
    successRate?: number;
    uniqueHirers?: number;
  };
  alertsAnomalies?: Array<{ type: string; agentName: string; detail: string }>;
  quickStats?: {
    busiestHour?: { day: string; hour: number; txCount: number } | null;
    longestIdleAgent?: { name: string; lastTxDaysAgo: number } | null;
    highestRevenue?: { name: string; revenue: number } | null;
    mostExpensiveTx?: { gasCostUsd: number } | null;
  };
}

async function fetchDigest(): Promise<DigestData | null> {
  try {
    const res = await fetch(`${API_URL}/api/digest/latest`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const raw = json.data;
    if (!raw) return null;
    const digest =
      typeof raw.digest_data === 'string'
        ? JSON.parse(raw.digest_data)
        : raw.digest_data;
    return digest as DigestData;
  } catch {
    return null;
  }
}

// ── Shared layout pieces ──────────────────────────────────────────────
function Watermark() {
  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        justifyContent: 'flex-end',
        marginTop: 'auto',
        paddingTop: 16,
      }}
    >
      <span style={{ color: DARK_GRAY, fontSize: 18, fontWeight: 400 }}>
        chainward.ai/base/digest
      </span>
    </div>
  );
}

function Header({ title }: { title: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        marginBottom: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 28, color: GREEN, fontWeight: 700 }}>
          ChainWard
        </span>
      </div>
      <span style={{ fontSize: 22, color: GRAY, fontWeight: 400 }}>
        {title}
      </span>
    </div>
  );
}

function Divider() {
  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: 1,
        backgroundColor: BORDER,
        marginTop: 8,
        marginBottom: 24,
      }}
    />
  );
}

function EmptyImage(msg: string) {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          backgroundColor: BG,
          color: GRAY,
          fontSize: 32,
          fontWeight: 400,
        }}
      >
        <span style={{ color: GREEN, fontSize: 36, fontWeight: 700, marginBottom: 16 }}>
          ChainWard
        </span>
        <span>{msg}</span>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=60',
      },
    },
  );
}

// ── Section renderers ─────────────────────────────────────────────────

function renderHeadline(digest: DigestData) {
  const h = digest.headline;
  const revenue = h?.totalRevenue ?? 0;
  const jobs = h?.totalJobs ?? 0;
  const agents = h?.activeAgents ?? 0;
  const weekLabel = h?.weekLabel ?? 'This Week';

  const stats = [
    { label: 'Revenue', value: fmtUsd(revenue) },
    { label: 'Jobs', value: fmtCount(jobs) },
    { label: 'Active Agents', value: fmtCount(agents) },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: BG,
        padding: 60,
      }}
    >
      <Header title="Weekly Digest" />
      <Divider />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span
          style={{
            fontSize: 48,
            fontWeight: 700,
            color: WHITE,
          }}
        >
          Base Agent Economy
        </span>
        <span
          style={{
            fontSize: 26,
            fontWeight: 400,
            color: GRAY,
            marginBottom: 36,
          }}
        >
          {weekLabel}
        </span>

        <div
          style={{
            display: 'flex',
            gap: 24,
            width: '100%',
            justifyContent: 'center',
          }}
        >
          {stats.map((s) => (
            <div
              key={s.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: BG_CARD,
                border: `1px solid ${BORDER}`,
                borderRadius: 16,
                padding: '28px 48px',
                minWidth: 220,
              }}
            >
              <span
                style={{
                  fontSize: 42,
                  fontWeight: 700,
                  color: GREEN,
                }}
              >
                {s.value}
              </span>
              <span
                style={{
                  fontSize: 20,
                  fontWeight: 400,
                  color: GRAY,
                  marginTop: 8,
                }}
              >
                {s.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <Watermark />
    </div>
  );
}

function renderLeaderboard(digest: DigestData) {
  const agents = (digest.leaderboards?.mostProfitable ?? []).slice(0, 5);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: BG,
        padding: 60,
      }}
    >
      <Header title="Top Agents by Revenue" />
      <Divider />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          gap: 12,
        }}
      >
        {agents.map((agent, i) => (
          <div
            key={agent.name}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: BG_CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 12,
              padding: '20px 32px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
              <span
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  color: i === 0 ? GREEN : DARK_GRAY,
                  minWidth: 40,
                }}
              >
                {i + 1}.
              </span>
              <span
                style={{
                  fontSize: 28,
                  fontWeight: 600,
                  color: WHITE,
                }}
              >
                {agent.name}
              </span>
            </div>
            <span
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: GREEN,
              }}
            >
              {fmtUsd(agent.revenue)}
            </span>
          </div>
        ))}

        {agents.length === 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              color: GRAY,
              fontSize: 28,
            }}
          >
            No leaderboard data available
          </div>
        )}
      </div>

      <Watermark />
    </div>
  );
}

function renderSpotlight(digest: DigestData) {
  const s = digest.spotlight;
  const name = s?.name ?? 'Unknown Agent';

  const stats = [
    { label: 'Revenue', value: fmtUsd(s?.revenue ?? 0) },
    { label: 'Jobs Completed', value: fmtCount(s?.jobs ?? 0) },
    { label: 'Success Rate', value: `${s?.successRate ?? 0}%` },
    { label: 'Unique Hirers', value: fmtCount(s?.uniqueHirers ?? 0) },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: BG,
        padding: 60,
      }}
    >
      <Header title="Agent Spotlight" />
      <Divider />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 32,
        }}
      >
        <span
          style={{
            fontSize: 44,
            fontWeight: 700,
            color: WHITE,
          }}
        >
          {name}
        </span>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 20,
            width: '100%',
            maxWidth: 800,
            justifyContent: 'center',
          }}
        >
          {stats.map((stat) => (
            <div
              key={stat.label}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: BG_CARD,
                border: `1px solid ${BORDER}`,
                borderRadius: 16,
                padding: '24px 36px',
                minWidth: 340,
                flex: 1,
              }}
            >
              <span
                style={{
                  fontSize: 38,
                  fontWeight: 700,
                  color: GREEN,
                }}
              >
                {stat.value}
              </span>
              <span
                style={{
                  fontSize: 18,
                  fontWeight: 400,
                  color: GRAY,
                  marginTop: 8,
                }}
              >
                {stat.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      <Watermark />
    </div>
  );
}

function renderAnomalies(digest: DigestData) {
  const anomalies = (digest.alertsAnomalies ?? []).slice(0, 4);

  const typeColors: Record<string, string> = {
    spike: '#facc15',
    drop: '#f87171',
    anomaly: '#c084fc',
    alert: '#fb923c',
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: BG,
        padding: 60,
      }}
    >
      <Header title="Alerts & Anomalies" />
      <Divider />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          gap: 16,
        }}
      >
        {anomalies.map((a, i) => {
          const color = typeColors[a.type.toLowerCase()] ?? '#fb923c';
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: BG_CARD,
                border: `1px solid ${BORDER}`,
                borderRadius: 12,
                padding: '20px 32px',
                gap: 20,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: color,
                  borderRadius: 8,
                  padding: '6px 14px',
                  minWidth: 100,
                }}
              >
                <span
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: BG,
                    textTransform: 'uppercase',
                  }}
                >
                  {a.type}
                </span>
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  flex: 1,
                }}
              >
                <span
                  style={{
                    fontSize: 24,
                    fontWeight: 600,
                    color: WHITE,
                  }}
                >
                  {a.agentName}
                </span>
                <span
                  style={{
                    fontSize: 18,
                    fontWeight: 400,
                    color: GRAY,
                  }}
                >
                  {a.detail}
                </span>
              </div>
            </div>
          );
        })}

        {anomalies.length === 0 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              color: GRAY,
              fontSize: 28,
            }}
          >
            No anomalies this week
          </div>
        )}
      </div>

      <Watermark />
    </div>
  );
}

function renderStats(digest: DigestData) {
  const qs = digest.quickStats;

  const bh = qs?.busiestHour;
  const idle = qs?.longestIdleAgent;
  const hi = qs?.highestRevenue;

  const items = [
    { label: 'Busiest Hour', value: bh ? `${bh.day.slice(5)} ${bh.hour}:00 UTC (${bh.txCount} txs)` : '—' },
    { label: 'Longest Idle', value: idle ? `${idle.name} (${idle.lastTxDaysAgo}d)` : '—' },
    { label: 'Top Revenue', value: hi ? `${hi.name} (${fmtUsd(hi.revenue)})` : '—' },
  ];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: BG,
        padding: 60,
      }}
    >
      <Header title="Quick Stats" />
      <Divider />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          justifyContent: 'center',
          gap: 20,
        }}
      >
        {items.map((item) => (
          <div
            key={item.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: BG_CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 16,
              padding: '32px 48px',
            }}
          >
            <span
              style={{
                fontSize: 26,
                fontWeight: 400,
                color: GRAY,
              }}
            >
              {item.label}
            </span>
            <span
              style={{
                fontSize: 32,
                fontWeight: 700,
                color: WHITE,
              }}
            >
              {item.value}
            </span>
          </div>
        ))}
      </div>

      <Watermark />
    </div>
  );
}

// ── Route handler ─────────────────────────────────────────────────────

const VALID_SECTIONS = new Set([
  'headline',
  'leaderboard',
  'spotlight',
  'anomalies',
  'stats',
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ section: string }> },
) {
  const { section } = await params;

  if (!VALID_SECTIONS.has(section)) {
    return EmptyImage(`Unknown section: ${section}`);
  }

  const digest = await fetchDigest();
  if (!digest) {
    return EmptyImage('No digest data available');
  }

  const renderers: Record<string, (d: DigestData) => React.JSX.Element> = {
    headline: renderHeadline,
    leaderboard: renderLeaderboard,
    spotlight: renderSpotlight,
    anomalies: renderAnomalies,
    stats: renderStats,
  };

  const render = renderers[section];
  if (!render) {
    return EmptyImage(`Unknown section: ${section}`);
  }

  const jsx = render(digest);

  return new ImageResponse(jsx, {
    width: WIDTH,
    height: HEIGHT,
    headers: {
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=300',
    },
  });
}
