import type { Metadata } from 'next';

const API_URL = process.env.API_INTERNAL_URL || 'http://localhost:8000';

function truncateAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatEthFromHex(hex: string): string {
  const wei = BigInt(hex);
  const eth = Number(wei) / 1e18;
  if (eth === 0) return '0';
  if (eth < 0.0001) return '< 0.0001';
  return eth.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>;
}): Promise<Metadata> {
  const { address } = await params;
  const truncated = truncateAddress(address);

  try {
    const res = await fetch(`${API_URL}/api/wallets/${address}`, {
      next: { revalidate: 600 },
    });

    if (!res.ok) {
      return fallbackMetadata(truncated);
    }

    const json = await res.json() as {
      success: boolean;
      data: {
        balances: Array<{ contractAddress: string; tokenBalance: string }>;
        transactions: Array<unknown>;
      };
    };

    if (!json.success || !json.data) {
      return fallbackMetadata(truncated);
    }

    const { data } = json;
    const txCount = data.transactions.length;

    const nativeBalance = data.balances.find((b) => b.contractAddress === 'native');
    const ethBalance = nativeBalance ? formatEthFromHex(nativeBalance.tokenBalance) : '0';

    const title = `${truncated} — Wallet Activity on Base`;
    const description = `${txCount} recent transactions · ${ethBalance} ETH · View live on-chain activity for ${truncated} on Base`;

    return {
      title,
      description,
      alternates: { canonical: `https://chainward.ai/wallet/${address}` },
      openGraph: {
        title,
        description,
        siteName: 'ChainWard',
        url: `https://chainward.ai/wallet/${address}`,
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
    return fallbackMetadata(truncated, address);
  }
}

function fallbackMetadata(truncated: string, address?: string): Metadata {
  const title = `${truncated} — Wallet Activity on Base`;
  const description = `View live on-chain activity for ${truncated} on Base`;

  return {
    title,
    description,
    ...(address && { alternates: { canonical: `https://chainward.ai/wallet/${address}` } }),
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

export default function WalletAddressLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
