'use client';

import { api, type AgentEvent } from '@/lib/api';
import { useApi } from '@/hooks/use-api';

const typeColors: Record<string, string> = {
  'sequence.detected': 'text-blue-400',
  'sequence.confirmed': 'text-green-400',
  'sequence.invalidated': 'text-red-400',
  'sequence.completed': 'text-emerald-400',
  'trade.entry_signal': 'text-yellow-400',
  'trade.opened': 'text-green-400',
  'trade.closed': 'text-orange-400',
  'trade.stop_tightened': 'text-amber-400',
  'monitor.heartbeat': 'text-gray-500',
  'engine.error': 'text-red-500',
  'engine.cycle': 'text-gray-400',
};

export function EventTimeline({ agentId }: { agentId: number }) {
  const { data: events, loading } = useApi<AgentEvent[]>(
    () => api.getAgentEvents(agentId, { limit: '50' }),
    [agentId],
  );

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 animate-pulse rounded bg-muted" />
        ))}
      </div>
    );
  }

  if (!events?.length) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No events yet</p>;
  }

  return (
    <div className="space-y-1">
      {events.map((event, i) => (
        <div key={i} className="flex items-start gap-3 rounded px-2 py-1.5 hover:bg-white/5">
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {new Date(event.timestamp).toLocaleString()}
          </span>
          <span className={`shrink-0 text-sm font-mono ${typeColors[event.eventType] || 'text-muted-foreground'}`}>
            {event.eventType}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {JSON.stringify(event.payload).slice(0, 120)}
          </span>
        </div>
      ))}
    </div>
  );
}
