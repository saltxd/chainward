'use client';

import { useState, useMemo } from 'react';
import { api, type AlertConfig, type AlertEvent, type Agent } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorBanner } from '@/components/ui/error-banner';
import { useToast } from '@/components/ui/toast';
import { AlertCard } from '@/components/dashboard/alert-card';
import { cn } from '@/lib/utils';

/* ── Alert type config ── */

const ALERT_TYPE_CONFIG: Record<string, { label: string; hasThreshold: boolean; defaultUnit: string }> = {
  large_transfer: { label: 'Large Transfer', hasThreshold: true, defaultUnit: 'usd' },
  balance_drop: { label: 'Balance Drop', hasThreshold: true, defaultUnit: 'percentage' },
  gas_spike: { label: 'Gas Spike', hasThreshold: true, defaultUnit: 'usd' },
  failed_tx: { label: 'Failed Transaction', hasThreshold: false, defaultUnit: 'usd' },
  inactivity: { label: 'Inactivity', hasThreshold: false, defaultUnit: 'usd' },
  new_contract: { label: 'New Contract', hasThreshold: false, defaultUnit: 'usd' },
};

/* ── URL validation ── */

const DISCORD_WEBHOOK_RE = /^https:\/\/discord\.com\/api\/webhooks\/\d+\/.+$/;
const TELEGRAM_CHAT_ID_RE = /^-?\d+$/;

function validateWebhookUrls(channels: string[], webhookUrl: string, telegramChatId: string, discordWebhook: string) {
  const errors: Record<string, string> = {};
  if (channels.includes('discord') && discordWebhook && !DISCORD_WEBHOOK_RE.test(discordWebhook)) {
    errors.discordWebhook = 'Must be a valid Discord webhook URL';
  }
  if (channels.includes('telegram') && telegramChatId && !TELEGRAM_CHAT_ID_RE.test(telegramChatId)) {
    errors.telegramChatId = 'Must be a numeric chat ID';
  }
  if (channels.includes('webhook') && webhookUrl && !webhookUrl.startsWith('https://')) {
    errors.webhookUrl = 'Must be an HTTPS URL';
  }
  return errors;
}

/* ── Explorer URL helper ── */

const EXPLORER_BASE: Record<string, string> = {
  base: 'https://basescan.org/tx/',
  solana: 'https://solscan.io/tx/',
};

function txUrl(chain: string, hash: string): string {
  return `${EXPLORER_BASE[chain] ?? EXPLORER_BASE.base}${hash}`;
}

/* ── Alert type labels ── */

const TYPE_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(ALERT_TYPE_CONFIG).map(([k, v]) => [k, v.label]),
);

/* ── Channel colors for history ── */

const CHANNEL_BADGE: Record<string, string> = {
  discord: 'bg-[#5865f2]/20 text-[#5865f2]',
  telegram: 'bg-[#26a5e4]/20 text-[#26a5e4]',
  webhook: 'bg-muted text-muted-foreground',
};

export default function AlertsPage() {
  const { data: alertList, loading, error, refetch } = useApi<AlertConfig[]>(
    () => api.getAlerts(),
    [],
  );
  const { data: agents } = useApi<Agent[]>(() => api.getAgents(), []);
  const { data: eventsResponse, loading: eventsLoading } = useApi<AlertEvent[]>(
    () => api.getAlertEvents({ limit: '20' }),
    [],
  );
  const { toast } = useToast();

  // Agent name lookup map
  const agentNameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (agents) {
      for (const a of agents) {
        if (a.agentName) map.set(a.walletAddress, a.agentName);
      }
    }
    return map;
  }, [agents]);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    walletAddress: '',
    chain: 'base',
    alertType: 'large_transfer',
    thresholdValue: '500',
    thresholdUnit: 'usd',
    channels: [] as string[],
    webhookUrl: '',
    telegramChatId: '',
    discordWebhook: '',
    lookback: '1h',
    cooldown: '5m',
  });
  const [creating, setCreating] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form validation
  const urlErrors = validateWebhookUrls(form.channels, form.webhookUrl, form.telegramChatId, form.discordWebhook);
  const hasUrlErrors = Object.keys(urlErrors).length > 0;
  const currentTypeConfig = ALERT_TYPE_CONFIG[form.alertType];

  async function handleTestAlert(id: number) {
    setTestingId(id);
    try {
      await api.testAlert(id);
      toast('Test alert sent', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to send test alert', 'error');
    } finally {
      setTestingId(null);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await api.createAlert({
        walletAddress: form.walletAddress,
        chain: form.chain,
        alertType: form.alertType,
        ...(currentTypeConfig?.hasThreshold && {
          thresholdValue: form.thresholdValue,
          thresholdUnit: form.thresholdUnit,
        }),
        channels: form.channels,
        webhookUrl: form.channels.includes('webhook') ? form.webhookUrl || undefined : undefined,
        telegramChatId: form.channels.includes('telegram') ? form.telegramChatId || undefined : undefined,
        discordWebhook: form.channels.includes('discord') ? form.discordWebhook || undefined : undefined,
      });
      setShowCreate(false);
      toast('Alert created', 'success');
      refetch();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to create alert', 'error');
    } finally {
      setCreating(false);
    }
  }

  async function toggleAlert(alert: AlertConfig) {
    try {
      await api.updateAlert(alert.id, { enabled: !alert.enabled });
      toast(alert.enabled ? 'Alert disabled' : 'Alert enabled', 'info');
      refetch();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to toggle alert', 'error');
    }
  }

  async function deleteAlert(id: number) {
    try {
      await api.deleteAlert(id);
      toast('Alert deleted', 'info');
      refetch();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to delete alert', 'error');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Alerts</h1>
          <p className="text-sm text-muted-foreground">Configure notifications for agent activity</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {showCreate ? 'Cancel' : 'Create Alert'}
        </button>
      </div>

      {error && <ErrorBanner message={error} onRetry={refetch} />}

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="rounded-lg border border-border bg-card p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Agent Wallet</label>
              <select
                value={form.walletAddress}
                onChange={(e) => setForm({ ...form, walletAddress: e.target.value })}
                required
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="">Select wallet...</option>
                {agents?.map((a) => (
                  <option key={a.id} value={a.walletAddress}>
                    {a.agentName ?? a.walletAddress.slice(0, 10) + '...'}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Alert Type</label>
              <select
                value={form.alertType}
                onChange={(e) => {
                  const alertType = e.target.value;
                  const cfg = ALERT_TYPE_CONFIG[alertType];
                  setForm({
                    ...form,
                    alertType,
                    thresholdUnit: cfg?.defaultUnit ?? 'usd',
                    thresholdValue: cfg?.hasThreshold ? form.thresholdValue : '',
                  });
                }}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                {Object.entries(ALERT_TYPE_CONFIG).map(([val, cfg]) => (
                  <option key={val} value={val}>{cfg.label}</option>
                ))}
              </select>
            </div>
            {currentTypeConfig?.hasThreshold && (
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">Threshold</label>
                <div className="flex gap-2">
                  <input
                    value={form.thresholdValue}
                    onChange={(e) => setForm({ ...form, thresholdValue: e.target.value })}
                    className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    placeholder="500"
                  />
                  <select
                    value={form.thresholdUnit}
                    onChange={(e) => setForm({ ...form, thresholdUnit: e.target.value })}
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  >
                    <option value="usd">USD</option>
                    <option value="native">Native</option>
                    <option value="percentage">%</option>
                  </select>
                </div>
              </div>
            )}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Lookback Window</label>
              <select
                value={form.lookback}
                onChange={(e) => setForm({ ...form, lookback: e.target.value })}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="5m">5 minutes</option>
                <option value="1h">1 hour</option>
                <option value="6h">6 hours</option>
                <option value="24h">24 hours</option>
                <option value="7d">7 days</option>
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">Cooldown</label>
              <select
                value={form.cooldown}
                onChange={(e) => setForm({ ...form, cooldown: e.target.value })}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="1m">1 minute</option>
                <option value="5m">5 minutes</option>
                <option value="15m">15 minutes</option>
                <option value="1h">1 hour</option>
              </select>
            </div>
          </div>

          {/* Delivery channels */}
          <div className="mt-4">
            <label className="text-sm font-medium">Delivery Channels</label>
            <div className="mt-2 flex gap-3">
              {(['webhook', 'telegram', 'discord'] as const).map((channel) => (
                <label key={channel} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.channels.includes(channel)}
                    onChange={(e) => {
                      const channels = e.target.checked
                        ? [...form.channels, channel]
                        : form.channels.filter((c) => c !== channel);
                      setForm({ ...form, channels });
                    }}
                    className="rounded border-border"
                  />
                  <span className="capitalize">{channel}</span>
                </label>
              ))}
            </div>

            <div className="mt-3 space-y-3">
              {form.channels.includes('webhook') && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">Webhook URL</label>
                  <input
                    value={form.webhookUrl}
                    onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })}
                    placeholder="https://your-server.com/webhook"
                    className={cn(
                      'rounded-lg border bg-background px-3 py-2 text-sm',
                      urlErrors.webhookUrl ? 'border-destructive' : 'border-border',
                    )}
                  />
                  {urlErrors.webhookUrl && (
                    <span className="text-xs text-destructive">{urlErrors.webhookUrl}</span>
                  )}
                </div>
              )}
              {form.channels.includes('telegram') && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">Telegram Chat ID</label>
                  <input
                    value={form.telegramChatId}
                    onChange={(e) => setForm({ ...form, telegramChatId: e.target.value })}
                    placeholder="Chat ID (e.g. 123456789)"
                    className={cn(
                      'rounded-lg border bg-background px-3 py-2 text-sm',
                      urlErrors.telegramChatId ? 'border-destructive' : 'border-border',
                    )}
                  />
                  {urlErrors.telegramChatId && (
                    <span className="text-xs text-destructive">{urlErrors.telegramChatId}</span>
                  )}
                </div>
              )}
              {form.channels.includes('discord') && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">Discord Webhook URL</label>
                  <input
                    value={form.discordWebhook}
                    onChange={(e) => setForm({ ...form, discordWebhook: e.target.value })}
                    placeholder="https://discord.com/api/webhooks/..."
                    className={cn(
                      'rounded-lg border bg-background px-3 py-2 text-sm',
                      urlErrors.discordWebhook ? 'border-destructive' : 'border-border',
                    )}
                  />
                  {urlErrors.discordWebhook && (
                    <span className="text-xs text-destructive">{urlErrors.discordWebhook}</span>
                  )}
                </div>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={creating || form.channels.length === 0 || hasUrlErrors}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create Alert'}
          </button>
        </form>
      )}

      {/* Alert list */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : alertList && alertList.length > 0 ? (
        <div className="space-y-3">
          {alertList.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              agentName={agentNameMap.get(alert.walletAddress) ?? null}
              onTest={handleTestAlert}
              onToggle={toggleAlert}
              onDelete={deleteAlert}
              onUpdated={refetch}
              isTesting={testingId === alert.id}
              isEditing={editingId === alert.id}
              onEditStart={() => setEditingId(alert.id)}
              onEditCancel={() => setEditingId(null)}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-muted-foreground">No alerts configured.</p>
        </div>
      )}

      {/* Alert history */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Alert History</h2>
        {eventsLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : eventsResponse && eventsResponse.length > 0 ? (
          <div className="space-y-2">
            {eventsResponse.map((event, i) => (
              <div
                key={`${event.alertConfigId}-${event.timestamp}-${i}`}
                className="flex items-center justify-between rounded-lg border border-border bg-card p-3"
              >
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-primary/15 px-1.5 py-0.5 text-xs font-medium text-primary">
                      {TYPE_LABELS[event.alertType] ?? event.alertType}
                    </span>
                    <span className="truncate text-sm font-medium">{event.title}</span>
                  </div>
                  {event.description && (
                    <span className="truncate text-xs text-muted-foreground">{event.description}</span>
                  )}
                  {event.triggerTxHash && (
                    <a
                      href={txUrl(event.chain, event.triggerTxHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-xs text-primary hover:underline"
                    >
                      {event.triggerTxHash.slice(0, 16)}...
                    </a>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {/* Delivery channel badges */}
                  {event.deliveryChannel && event.deliveryChannel.split(',').map((ch) => (
                    <span
                      key={ch}
                      className={cn(
                        'rounded px-1.5 py-0.5 text-xs capitalize',
                        CHANNEL_BADGE[ch.trim()] ?? 'bg-muted text-muted-foreground',
                      )}
                    >
                      {ch.trim()}
                    </span>
                  ))}
                  {/* Delivery status */}
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5 text-xs',
                      event.delivered
                        ? 'bg-[#4ade80]/20 text-[#4ade80]'
                        : event.deliveryError
                          ? 'bg-destructive/20 text-destructive'
                          : 'bg-yellow-500/20 text-yellow-400',
                    )}
                  >
                    {event.delivered ? 'Delivered' : event.deliveryError ? 'Failed' : 'Pending'}
                  </span>
                  {/* Severity */}
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5 text-xs',
                      event.severity === 'critical' && 'bg-destructive/20 text-destructive',
                      event.severity === 'warning' && 'bg-yellow-500/20 text-yellow-400',
                      event.severity === 'info' && 'bg-muted text-muted-foreground',
                    )}
                  >
                    {event.severity}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(event.timestamp).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">No alert events yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
