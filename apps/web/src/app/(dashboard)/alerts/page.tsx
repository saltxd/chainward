'use client';

import { useState } from 'react';
import { api, type AlertConfig, type AlertEvent, type Agent } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorBanner } from '@/components/ui/error-banner';
import { cn } from '@/lib/utils';

export default function AlertsPage() {
  const { data: alertList, loading, error, refetch } = useApi<AlertConfig[]>(
    () => api.getAlerts(),
    [],
  );
  const { data: agents } = useApi<Agent[]>(() => api.getAgents(), []);
  const { data: eventsResponse } = useApi(
    () => api.getAlertEvents({ limit: '20' }),
    [],
  );

  const [testError, setTestError] = useState<string | null>(null);
  const [createAlertError, setCreateAlertError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    walletAddress: '',
    chain: 'base',
    alertType: 'large_transfer',
    thresholdValue: '500',
    thresholdUnit: 'usd',
    channels: [] as string[],
    webhookUrl: '',
    slackWebhook: '',
    discordWebhook: '',
    lookback: '1h',
    cooldown: '5m',
  });
  const [creating, setCreating] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);

  async function handleTestAlert(id: number) {
    setTestingId(id);
    setTestError(null);
    try {
      await api.testAlert(id);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'Failed to send test alert');
    } finally {
      setTestingId(null);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateAlertError(null);
    try {
      await api.createAlert({
        walletAddress: form.walletAddress,
        chain: form.chain,
        alertType: form.alertType,
        thresholdValue: form.thresholdValue,
        thresholdUnit: form.thresholdUnit,
        channels: form.channels,
        webhookUrl: form.channels.includes('webhook') ? form.webhookUrl || undefined : undefined,
        slackWebhook: form.channels.includes('slack') ? form.slackWebhook || undefined : undefined,
        discordWebhook: form.channels.includes('discord') ? form.discordWebhook || undefined : undefined,
      });
      setShowCreate(false);
      refetch();
    } catch (err) {
      setCreateAlertError(err instanceof Error ? err.message : 'Failed to create alert');
    } finally {
      setCreating(false);
    }
  }

  async function toggleAlert(alert: AlertConfig) {
    await api.updateAlert(alert.id, { enabled: !alert.enabled });
    refetch();
  }

  async function deleteAlert(id: number) {
    await api.deleteAlert(id);
    refetch();
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
          Create Alert
        </button>
      </div>

      {error && <ErrorBanner message={error} onRetry={refetch} />}
      {testError && <ErrorBanner message={testError} />}
      {createAlertError && <ErrorBanner message={createAlertError} />}

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
                onChange={(e) => setForm({ ...form, alertType: e.target.value })}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                <option value="large_transfer">Large Transfer</option>
                <option value="balance_drop">Balance Drop</option>
                <option value="gas_spike">Gas Spike</option>
                <option value="failed_tx">Failed Transaction</option>
                <option value="inactivity">Inactivity</option>
                <option value="new_contract">New Contract</option>
              </select>
            </div>
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
              {(['webhook', 'slack', 'discord'] as const).map((channel) => (
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
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
              )}
              {form.channels.includes('slack') && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">Slack Webhook URL</label>
                  <input
                    value={form.slackWebhook}
                    onChange={(e) => setForm({ ...form, slackWebhook: e.target.value })}
                    placeholder="https://hooks.slack.com/services/..."
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
              )}
              {form.channels.includes('discord') && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-muted-foreground">Discord Webhook URL</label>
                  <input
                    value={form.discordWebhook}
                    onChange={(e) => setForm({ ...form, discordWebhook: e.target.value })}
                    placeholder="https://discord.com/api/webhooks/..."
                    className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
                  />
                </div>
              )}
            </div>
          </div>

          <button
            type="submit"
            disabled={creating || form.channels.length === 0}
            className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {creating ? 'Creating...' : 'Create Alert'}
          </button>
        </form>
      )}

      {/* Alert list */}
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : alertList && alertList.length > 0 ? (
        <div className="space-y-3">
          {alertList.map((alert) => (
            <div
              key={alert.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-4"
            >
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{alert.alertType}</span>
                  <span className="text-xs text-muted-foreground">{alert.chain}</span>
                </div>
                <span className="font-mono text-xs text-muted-foreground">
                  {alert.walletAddress.slice(0, 10)}...{alert.walletAddress.slice(-4)}
                </span>
                {alert.thresholdValue && (
                  <span className="text-xs text-muted-foreground">
                    Threshold: {alert.thresholdValue} {alert.thresholdUnit}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleTestAlert(alert.id)}
                  disabled={testingId === alert.id}
                  className="rounded-lg border border-border px-3 py-1 text-xs transition-colors hover:bg-muted disabled:opacity-50"
                >
                  {testingId === alert.id ? 'Sending...' : 'Test'}
                </button>
                <button
                  onClick={() => toggleAlert(alert)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                    alert.enabled
                      ? 'bg-accent text-accent-foreground'
                      : 'bg-muted text-muted-foreground',
                  )}
                >
                  {alert.enabled ? 'Enabled' : 'Disabled'}
                </button>
                <button
                  onClick={() => deleteAlert(alert.id)}
                  className="text-xs text-destructive transition-colors hover:text-destructive/80"
                >
                  Delete
                </button>
              </div>
            </div>
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
        {eventsResponse && 'data' in eventsResponse && (eventsResponse as { data: AlertEvent[] }).data.length > 0 ? (
          <div className="space-y-2">
            {(eventsResponse as { data: AlertEvent[] }).data.map((event, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg border border-border bg-card p-3"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">{event.title}</span>
                  {event.description && (
                    <span className="text-xs text-muted-foreground">{event.description}</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'rounded px-1.5 py-0.5 text-xs',
                      event.delivered
                        ? 'bg-[#4ade80]/20 text-[#4ade80]'
                        : 'bg-yellow-500/20 text-yellow-400',
                    )}
                  >
                    {event.delivered ? 'Delivered' : 'Pending'}
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
