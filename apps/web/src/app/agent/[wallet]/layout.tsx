import type { Metadata } from 'next';

const API_URL = process.env.API_INTERNAL_URL || 'http://localhost:8000';

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ wallet: string }>;
}): Promise<Metadata> {
  const { wallet } = await params;
  const truncated = truncateAddress(wallet);

  try {
    const res = await fetch(`${API_URL}/api/public/agents/${wallet}`, {
      next: { revalidate: 600 },
    });

    if (!res.ok) {
      return fallbackMetadata(truncated);
    }

    const json = await res.json() as {
      success: boolean;
      data: {
        agent: { agentName: string | null };
        stats: { txCount7d: number; gasSpend7d: number };
      };
    };

    if (!json.success || !json.data) {
      return fallbackMetadata(truncated);
    }

    const { agent, stats } = json.data;
    const agentName = agent.agentName ?? truncated;
    const gasFormatted = `$${stats.gasSpend7d.toFixed(2)}`;

    const title = `${agentName} — Agent Status on ChainWard`;
    const description = `${stats.txCount7d} transactions (7d) · ${gasFormatted} gas spent · Live monitoring on Base`;

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        siteName: 'ChainWard',
        url: `https://chainward.ai/agent/${wallet}`,
        type: 'website',
        images: [{ url: '/chainward-og.png', width: 1200, height: 630 }],
      },
      twitter: {
        card: 'summary_large_image',
        site: '@chainwardai',
        title,
        description,
        images: ['/chainward-og.png'],
      },
    };
  } catch {
    return fallbackMetadata(truncated);
  }
}

function fallbackMetadata(truncated: string): Metadata {
  const title = `${truncated} — Agent Status on ChainWard`;
  const description = `Live on-chain monitoring for agent ${truncated} on Base`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: 'ChainWard',
      type: 'website',
      images: [{ url: '/chainward-og.png', width: 1200, height: 630 }],
    },
    twitter: {
      card: 'summary_large_image',
      site: '@chainwardai',
      title,
      description,
      images: ['/chainward-og.png'],
    },
  };
}

export default function AgentWalletLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
