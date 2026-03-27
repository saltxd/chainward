'use client';

import { useEffect, useState } from 'react';

interface FeedItem {
  id: number;
  time: string;
  type: 'transfer' | 'swap' | 'contract' | 'alert';
  agent: string;
  message: string;
  amount?: string;
  status: 'success' | 'warning' | 'info';
}

const FEED_ITEMS: FeedItem[] = [
  {
    id: 1,
    time: '0.4s ago',
    type: 'transfer',
    agent: 'Rebalancer',
    message: 'Sent 0.12 ETH to Uniswap V3',
    amount: '$312.48',
    status: 'success',
  },
  {
    id: 2,
    time: '1.2s ago',
    type: 'swap',
    agent: 'Yield Bot',
    message: 'Swapped USDC for ETH on Aerodrome',
    amount: '$1,450.00',
    status: 'success',
  },
  {
    id: 3,
    time: '3.8s ago',
    type: 'alert',
    agent: 'Alpha Scanner',
    message: 'Gas spike detected: $4.20 (3x threshold)',
    status: 'warning',
  },
  {
    id: 4,
    time: '5.1s ago',
    type: 'contract',
    agent: 'Rebalancer',
    message: 'New contract interaction: 0x7Fc6...3a1d',
    status: 'info',
  },
  {
    id: 5,
    time: '8.4s ago',
    type: 'transfer',
    agent: 'DCA Agent',
    message: 'Received 500 USDC from Coinbase',
    amount: '$500.00',
    status: 'success',
  },
  {
    id: 6,
    time: '12.0s ago',
    type: 'swap',
    agent: 'Yield Bot',
    message: 'Claimed 0.003 AERO rewards',
    amount: '$2.14',
    status: 'success',
  },
];

const typeIcons: Record<string, string> = {
  transfer: '\u2192',
  swap: '\u21c4',
  contract: '\u25c7',
  alert: '\u26a0',
};

const statusColors: Record<string, string> = {
  success: 'text-accent-foreground',
  warning: 'text-yellow-400',
  info: 'text-blue-400',
};

const statusDotColors: Record<string, string> = {
  success: 'bg-accent-foreground',
  warning: 'bg-yellow-400',
  info: 'bg-blue-400',
};

export function ActivityFeed() {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    // Stagger reveal items
    const timers: NodeJS.Timeout[] = [];
    FEED_ITEMS.forEach((_, i) => {
      timers.push(
        setTimeout(() => {
          setVisibleCount((c) => Math.max(c, i + 1));
        }, 400 + i * 600),
      );
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="relative overflow-hidden rounded-sm border border-border bg-background">
      {/* Terminal header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <div className="flex gap-1.5">
          <div className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
          <div className="h-2.5 w-2.5 rounded-full bg-[#ffbd2e]" />
          <div className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        </div>
        <span className="ml-2 font-mono text-xs text-muted-foreground">chainward monitor</span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-foreground opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-foreground" />
          </span>
          <span className="font-mono text-[10px] text-accent-foreground">LIVE</span>
        </div>
      </div>

      {/* Feed content */}
      <div className="divide-y divide-border/50 font-mono text-xs">
        {FEED_ITEMS.slice(0, visibleCount).map((item, i) => (
          <div
            key={item.id}
            className="flex items-center gap-3 px-4 py-2.5 transition-all duration-500"
            style={{
              opacity: i < visibleCount ? 1 : 0,
              transform: i < visibleCount ? 'translateY(0)' : 'translateY(8px)',
            }}
          >
            <span className="w-16 shrink-0 text-muted-foreground/60">{item.time}</span>
            <span className={`w-4 shrink-0 text-center ${statusColors[item.status]}`}>
              {typeIcons[item.type]}
            </span>
            <span className="w-20 shrink-0 truncate text-muted-foreground">{item.agent}</span>
            <span className="flex-1 truncate text-foreground">{item.message}</span>
            {item.amount && (
              <span className={`shrink-0 font-mono ${statusColors[item.status]}`}>{item.amount}</span>
            )}
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDotColors[item.status]}`} />
          </div>
        ))}

        {/* Cursor line */}
        <div className="flex items-center gap-3 px-4 py-2.5">
          <span className="w-16 shrink-0 text-muted-foreground/60">now</span>
          <span className="animate-pulse text-accent-foreground">_</span>
          <span className="text-muted-foreground/60">Monitoring agents on Base...</span>
        </div>
      </div>

      {/* Bottom fade */}
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background to-transparent" />
    </div>
  );
}
