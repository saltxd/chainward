'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, type AlertConfig, type AlertEvent, type Agent } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorBanner } from '@/components/ui/error-banner';
import { useToast } from '@/components/ui/toast';
import { AlertCard } from '@/components/dashboard/alert-card';
import { cn } from '@/lib/utils';

/* ── Alert type config ── */

const ALERT_TYPE_CONFIG: Record<string, { label: string; hasThreshold: boolean; defaultUnit: string; thresholdLabel?: string }> = {
  large_transfer: { label: 'Large Transfer', hasThreshold: true, defaultUnit: 'usd' },
  balance_drop: { label: 'Balance Drop', hasThreshold: true, defaultUnit: 'percentage' },
  gas_spike: { label: 'Gas Spike', hasThreshold: true, defaultUnit: 'usd' },
  failed_tx: { label: 'Failed Transaction', hasThreshold: false, defaultUnit: 'usd' },
  inactivity: { label: 'Inactivity', hasThreshold: false, defaultUnit: 'usd' },
  new_contract: { label: 'New Contract', hasThreshold: false, defaultUnit: 'usd' },
  idle_balance: { label: 'Idle Balance', hasThreshold: true, defaultUnit: 'usd', thresholdLabel: 'Min Balance (USD)' },
};

type AlertPresetKey = 'failed_tx' | 'gas_spike' | 'inactivity';

const ALERT_PRESETS: Record<AlertPresetKey, {
  label: string;
  description: string;
  alertType: AlertPresetKey;
  thresholdValue?: string;
  thresholdUnit?: string;
  lookback: string;
  cooldown: string;
}> = {
  failed_tx: {
    label: 'Failed Transaction',
    description: 'Catch reverted transactions as soon as an agent fails.',
    alertType: 'failed_tx',
    lookback: '1h',
    cooldown: '1m',
  },
  gas_spike: {
    label: 'Gas Spike',
    description: 'Get warned when a wallet pays unusually high gas.',
    alertType: 'gas_spike',
    thresholdValue: '25',
    thresholdUnit: 'usd',
    lookback: '1h',
    cooldown: '5m',
  },
  inactivity: {
    label: 'Inactivity',
    description: 'Get nudged when an agent stops doing anything on-chain.',
    alertType: 'inactivity',
    lookback: '24h',
    cooldown: '1h',
  },
};

function getPresetFormPatch(presetKey: AlertPresetKey, walletAddress?: string) {
  const preset = ALERT_PRESETS[presetKey];
  const config = ALERT_TYPE_CONFIG[preset.alertType]!;

  return {
    ...(walletAddress ? { walletAddress } : {}),
    alertType: preset.alertType,
    thresholdValue: config.hasThreshold ? (preset.thresholdValue ?? '500') : '',
    thresholdUnit: preset.thresholdUnit ?? config.defaultUnit,
    lookback: preset.lookback,
    cooldown: preset.cooldown,
  };
}

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
  discord: 'bg-[#5865f2]/20 text-discord',
  telegram: 'bg-[#26a5e4]/20 text-telegram',
  webhook: 'bg-muted text-muted-foreground',
};

export default function AlertsPage() {
  const searchParams = useSearchParams();
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
  const [didApplyQueryPreset, setDidApplyQueryPreset] = useState(false);

  // Form validation
  const urlErrors = validateWebhookUrls(form.channels, form.webhookUrl, form.telegramChatId, form.discordWebhook);
  const hasUrlErrors = Object.keys(urlErrors).length > 0;
  const currentTypeConfig = ALERT_TYPE_CONFIG[form.alertType];
  const defaultWallet = form.walletAddress || agents?.[0]?.walletAddress || '';

  function applyPreset(presetKey: AlertPresetKey, walletAddress = defaultWallet) {
    setShowCreate(true);
    setForm((current) => ({
      ...current,
      ...getPresetFormPatch(presetKey, walletAddress || undefined),
    }));
  }

  useEffect(() => {
    if (didApplyQueryPreset || !agents) return;

    const presetParam = searchParams.get('preset');
    const walletParam = searchParams.get('wallet');
    const matchedWallet = walletParam
      ? agents.find((agent) => agent.walletAddress.toLowerCase() === walletParam.toLowerCase())?.walletAddress
      : undefined;
    const presetKey: AlertPresetKey = presetParam === 'gas_spike' || presetParam === 'inactivity'
      ? presetParam
      : 'failed_tx';

    if (presetParam || matchedWallet) {
      applyPreset(presetKey, matchedWallet ?? agents[0]?.walletAddress ?? '');
    }

    setDidApplyQueryPreset(true);
  }, [agents, didApplyQueryPreset, searchParams]);

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
        lookbackWindow: form.lookback,
        channels: form.channels,
        webhookUrl: form.channels.includes('webhook') ? form.webhookUrl || undefined : undefined,
        telegramChatId: form.channels.includes('telegram') ? form.telegramChatId || undefined : undefined,
        discordWebhook: form.channels.includes('discord') ? form.discordWebhook || undefined : undefined,
        cooldown: form.cooldown,
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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Alerts</h1>
          <p className="text-sm text-muted-foreground">Configure notifications for agent activity</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="min-h-[44px] shrink-0 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {showCreate ? 'Cancel' : 'Create Alert'}
        </button>
      </div>

      {error && <ErrorBanner message={error} onRetry={refetch} />}

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="rounded-lg border border-border bg-card p-6">
          <div className="mb-5">
            <p className="text-sm font-medium">Start from a recommended preset</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(Object.entries(ALERT_PRESETS) as [AlertPresetKey, typeof ALERT_PRESETS.failed_tx][]).map(([key, preset]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyPreset(key)}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-xs transition-colors',
                    form.alertType === preset.alertType
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {ALERT_PRESETS[(form.alertType in ALERT_PRESETS ? form.alertType : 'failed_tx') as AlertPresetKey]?.description
                ?? 'Choose a preset, then pick a delivery channel to finish setup.'}
            </p>
          </div>

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
                <label className="text-sm font-medium">{currentTypeConfig.thresholdLabel ?? 'Threshold'}</label>
                <div className="flex gap-2">
                  <input
                    value={form.thresholdValue}
                    onChange={(e) => setForm({ ...form, thresholdValue: e.target.value })}
                    className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    placeholder={form.alertType === 'idle_balance' ? '50' : '500'}
                  />
                  {form.alertType !== 'idle_balance' && (
                    <select
                      value={form.thresholdUnit}
                      onChange={(e) => setForm({ ...form, thresholdUnit: e.target.value })}
                      className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    >
                      <option value="usd">USD</option>
                      <option value="native">Native</option>
                      <option value="percentage">%</option>
                    </select>
                  )}
                </div>
                {form.alertType === 'idle_balance' && (
                  <p className="text-xs text-muted-foreground">
                    Fires when balance stays above this amount with no outgoing transactions for the lookback duration
                  </p>
                )}
              </div>
            )}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">
                {form.alertType === 'idle_balance' ? 'Idle Duration' : 'Lookback Window'}
              </label>
              <select
                value={form.lookback}
                onChange={(e) => setForm({ ...form, lookback: e.target.value })}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                {form.alertType === 'idle_balance' ? (
                  <>
                    <option value="6h">6 hours</option>
                    <option value="12h">12 hours</option>
                    <option value="24h">24 hours</option>
                    <option value="48h">48 hours</option>
                    <option value="7d">7 days</option>
                  </>
                ) : (
                  <>
                    <option value="5m">5 minutes</option>
                    <option value="1h">1 hour</option>
                    <option value="6h">6 hours</option>
                    <option value="24h">24 hours</option>
                    <option value="7d">7 days</option>
                  </>
                )}
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
            <p className="mt-2 text-xs text-muted-foreground">
              Choose at least one delivery channel to activate this alert.
            </p>

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
          <p className="mt-2 text-sm text-muted-foreground">
            Start with a recommended preset, then choose where the notifications should go.
          </p>
          {agents && agents.length > 0 && (
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {(Object.entries(ALERT_PRESETS) as [AlertPresetKey, typeof ALERT_PRESETS.failed_tx][]).map(([key, preset]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyPreset(key, agents[0]!.walletAddress)}
                  className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          )}
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
                className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
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
                <div className="flex shrink-0 flex-wrap items-center gap-2">
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
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5 text-xs',
                      event.delivered
                        ? 'bg-accent-foreground/20 text-accent-foreground'
                        : event.deliveryError
                          ? 'bg-destructive/20 text-destructive'
                          : 'bg-yellow-500/20 text-yellow-400',
                    )}
                  >
                    {event.delivered ? 'Delivered' : event.deliveryError ? 'Failed' : 'Pending'}
                  </span>
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
