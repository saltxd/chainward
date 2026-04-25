import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'ChainWard agent profile';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const API_INTERNAL_URL = process.env.API_INTERNAL_URL || 'http://localhost:8000';

export default async function og({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const res = await fetch(`${API_INTERNAL_URL}/api/observatory/agent/${slug}`);
  if (!res.ok) {
    return new ImageResponse(<div>not found</div>, { ...size });
  }
  const { data: agent } = await res.json();

  const score = agent.health?.score;
  const scoreColor =
    score == null ? '#888' : score >= 70 ? '#4ade80' : score >= 40 ? '#facc15' : '#f87171';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#0a0a0a',
          color: '#e5e5e5',
          padding: '60px',
          fontFamily: 'monospace',
        }}
      >
        <div style={{ fontSize: 28, color: '#4ade80' }}>chainward.ai/base</div>
        <div style={{ fontSize: 80, marginTop: 20, fontWeight: 700 }}>
          {agent.agentName ?? agent.slug}
        </div>
        <div style={{ fontSize: 24, color: '#888', marginTop: 8 }}>{agent.walletAddress}</div>

        <div style={{ display: 'flex', gap: 60, marginTop: 60 }}>
          {/* Score */}
          {score != null && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 18, color: '#888' }}>health score</div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  fontSize: 120,
                  color: scoreColor,
                  fontWeight: 700,
                  lineHeight: 1,
                }}
              >
                {score}
                <span style={{ fontSize: 36, color: '#666', marginLeft: 8 }}>/100</span>
              </div>
            </div>
          )}

          {/* ACP Revenue */}
          {agent.acp?.revenue > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontSize: 18, color: '#888' }}>revenue</div>
              <div style={{ fontSize: 80, color: '#e5e5e5', fontWeight: 700 }}>
                ${Math.round(agent.acp.revenue).toLocaleString()}
              </div>
              <div style={{ fontSize: 18, color: '#888' }}>
                {agent.acp.jobs.toLocaleString()} jobs
              </div>
            </div>
          )}
        </div>
      </div>
    ),
    { ...size },
  );
}
