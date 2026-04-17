import { ImageResponse } from '@vercel/og';
import { getDecodeBySlug } from '@/lib/decodes';

const BG = '#0a0b0a';
const GREEN = '#3dd88d';
const WHITE = '#ffffff';
const GRAY = '#a1a1aa';
const DARK_GRAY = '#52525b';
const BORDER = '#1e1e2e';

const WIDTH = 1200;
const HEIGHT = 675;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const decode = getDecodeBySlug(slug);

  if (!decode) {
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
          }}
        >
          <span style={{ color: GREEN, fontSize: 36, fontWeight: 700, marginBottom: 16 }}>
            ChainWard
          </span>
          <span>Decode not found</span>
        </div>
      ),
      { width: WIDTH, height: HEIGHT },
    );
  }

  const { meta } = decode;

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
        {/* Header bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            width: '100%',
            marginBottom: 8,
          }}
        >
          <span style={{ fontSize: 28, color: GREEN, fontWeight: 700 }}>
            ChainWard
          </span>
          <span style={{ fontSize: 22, color: GRAY, fontWeight: 400 }}>
            On-Chain Decode
          </span>
        </div>

        {/* Divider */}
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

        {/* Centered content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
          }}
        >
          <span
            style={{
              fontSize: 56,
              fontWeight: 700,
              color: WHITE,
              lineHeight: 1.1,
              maxWidth: 900,
            }}
          >
            {meta.title}
          </span>
          {meta.subtitle && (
            <span
              style={{
                fontSize: 24,
                fontWeight: 400,
                color: GRAY,
                marginTop: 20,
                maxWidth: 700,
                lineHeight: 1.4,
              }}
            >
              {meta.subtitle}
            </span>
          )}
        </div>

        {/* Footer URL */}
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
            chainward.ai/decodes/{slug}
          </span>
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      headers: {
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=3600',
      },
    },
  );
}
