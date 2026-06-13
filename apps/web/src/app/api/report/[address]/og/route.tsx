import { ImageResponse } from '@vercel/og';
import { DISCLAIMER, SEVERITY_HEX, topSeverity } from '@/lib/risk';
import type { RiskBand, RiskReport, RiskSeverity } from '@/lib/api';

const API_URL = process.env.API_INTERNAL_URL || 'http://localhost:8000';

const BG = '#0a0b0a';
const GREEN = '#3aa76d';
const WHITE = '#ffffff';
const GRAY = '#9ba397';
const DARK_GRAY = '#585f56';
const BORDER = '#1e231f';

const WIDTH = 1200;
const HEIGHT = 675;

const BAND_LABEL: Record<RiskBand, string> = {
  'low-signal': 'LOW SIGNAL',
  mixed: 'MIXED SIGNAL',
  elevated: 'ELEVATED SIGNAL',
  'high-signal': 'HIGH SIGNAL',
};

function truncate(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

async function fetchReport(address: string): Promise<RiskReport | null> {
  try {
    const res = await fetch(`${API_URL}/api/risk/report/${address}`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      success: boolean;
      data?: { report: RiskReport };
    };
    return json.success ? (json.data?.report ?? null) : null;
  } catch {
    return null;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  const report = await fetchReport(address.toLowerCase());

  const flagCount = report?.flags.length ?? 0;
  const top: RiskSeverity | null = report ? topSeverity(report.flags) : null;
  // Severity color drives the accent — NEVER a green "safe" grade. When there
  // are zero flags, fall back to neutral gray (not green).
  const accent = top ? SEVERITY_HEX[top] : DARK_GRAY;

  return new ImageResponse(
    (
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
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
          }}
        >
          <span style={{ fontSize: 28, color: GREEN, fontWeight: 700 }}>
            ChainWard
          </span>
          <span style={{ fontSize: 22, color: GRAY, fontWeight: 400 }}>
            On-Chain Risk Flags
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            width: '100%',
            height: 1,
            backgroundColor: BORDER,
            marginTop: 16,
            marginBottom: 36,
          }}
        />

        {/* Address */}
        <span style={{ fontSize: 30, color: WHITE, fontWeight: 600 }}>
          {truncate(address)}
        </span>

        {/* Flag count — the headline metric. Accent is severity-driven. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 18,
            marginTop: 28,
          }}
        >
          <span
            style={{
              fontSize: 140,
              fontWeight: 800,
              color: accent,
              lineHeight: 1,
            }}
          >
            {report ? flagCount : '—'}
          </span>
          <span
            style={{
              display: 'flex',
              flexDirection: 'column',
              marginBottom: 18,
            }}
          >
            <span style={{ fontSize: 30, color: GRAY }}>
              {flagCount === 1 ? 'flag' : 'flags'}
            </span>
            <span style={{ fontSize: 22, color: DARK_GRAY }}>
              from on-chain behavior
            </span>
          </span>
        </div>

        {/* Neutral band pill */}
        {report && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginTop: 20,
            }}
          >
            <span
              style={{
                display: 'flex',
                border: `1px solid ${accent}`,
                color: accent,
                fontSize: 20,
                letterSpacing: 2,
                padding: '6px 16px',
              }}
            >
              {BAND_LABEL[report.band]}
            </span>
          </div>
        )}

        {/* Disclaimer — required in the share card text */}
        <div
          style={{
            display: 'flex',
            marginTop: 'auto',
            paddingTop: 24,
          }}
        >
          <span style={{ fontSize: 17, color: DARK_GRAY, maxWidth: 980, lineHeight: 1.4 }}>
            {DISCLAIMER}
          </span>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: {
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=600',
      },
    },
  );
}
