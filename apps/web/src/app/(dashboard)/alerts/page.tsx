'use client';

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, type AlertConfig, type AlertEvent, type Agent } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorBanner } from '@/components/ui/error-banner';
import { useToast } from '@/components/ui/toast';
import { AlertCard } from '@/components/dashboard/alert-card';
import {
  SectionHead,
  Button,
  Badge,
  DataTable,
  type Column,
} from '@/components/v2';

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

const CHANNEL_TONE: Record<string, 'cyan' | 'phosphor' | 'neutral'> = {
  discord: 'cyan',
  telegram: 'cyan',
  webhook: 'neutral',
};

export default function AlertsPage() {
  return (
    <Suspense>
      <AlertsContent />
    </Suspense>
  );
}

function AlertsContent() {
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

  const currentPresetKey: AlertPresetKey = (form.alertType in ALERT_PRESETS
    ? form.alertType
    : 'failed_tx') as AlertPresetKey;
  const currentPresetDescription =
    ALERT_PRESETS[currentPresetKey]?.description ??
    'Choose a preset, then pick a delivery channel to finish setup.';

  // Alert events columns
  const eventColumns: Column<AlertEvent>[] = [
    {
      key: 'status',
      header: '',
      width: '20px',
      render: (event) => (
        <span
          className="v2-alerts-dot"
          style={{
            background: event.delivered
              ? 'var(--phosphor)'
              : event.deliveryError
                ? 'var(--danger)'
                : 'var(--amber)',
            boxShadow: event.delivered
              ? '0 0 6px var(--phosphor)'
              : event.deliveryError
                ? '0 0 6px var(--danger)'
                : '0 0 6px var(--amber)',
          }}
        />
      ),
    },
    {
      key: 'time',
      header: 'time',
      width: '140px',
      render: (event) => (
        <span style={{ color: 'var(--muted)' }}>
          {new Date(event.timestamp).toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      ),
    },
    {
      key: 'type',
      header: 'type',
      width: '150px',
      render: (event) => (
        <span style={{ color: 'var(--phosphor)' }}>
          {TYPE_LABELS[event.alertType] ?? event.alertType}
        </span>
      ),
    },
    {
      key: 'title',
      header: 'event',
      render: (event) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span style={{ color: 'var(--fg)' }}>{event.title}</span>
          {event.description && (
            <span style={{ fontSize: 11, color: 'var(--fg-dim)' }}>{event.description}</span>
          )}
          {event.triggerTxHash && (
            <a
              href={txUrl(event.chain, event.triggerTxHash)}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 11,
                color: 'var(--cyan)',
                textDecoration: 'none',
                fontFamily: 'var(--font-mono)',
              }}
            >
              {event.triggerTxHash.slice(0, 18)}…
            </a>
          )}
        </div>
      ),
    },
    {
      key: 'channels',
      header: 'channels',
      width: '180px',
      render: (event) => (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {event.deliveryChannel && event.deliveryChannel.split(',').map((ch) => (
            <Badge key={ch} tone={CHANNEL_TONE[ch.trim()] ?? 'neutral'}>
              {ch.trim()}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'severity',
      header: 'severity',
      width: '100px',
      align: 'right',
      render: (event) => (
        <Badge
          tone={
            event.severity === 'critical'
              ? 'danger'
              : event.severity === 'warning'
                ? 'amber'
                : 'neutral'
          }
        >
          {event.severity}
        </Badge>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
      <div className="v2-alerts-header">
        <SectionHead
          tag="alerts.configured"
          title={
            <>
              Triggers <span className="serif">you&apos;ve armed.</span>
            </>
          }
          lede="Watch agents for anomalies — reverts, gas spikes, silence. Deliver to Discord, Telegram, or a webhook."
        />
        <Button onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? 'cancel' : '+ create alert'}
        </Button>
      </div>

      {error && <ErrorBanner message={error} onRetry={refetch} />}

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="v2-alerts-form">
          {/* Preset picker */}
          <div className="v2-alerts-preset">
            <span className="v2-alerts-label">start from preset</span>
            <div className="v2-alerts-preset-row">
              {(Object.entries(ALERT_PRESETS) as [AlertPresetKey, typeof ALERT_PRESETS.failed_tx][]).map(([key, preset]) => {
                const active = form.alertType === preset.alertType;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => applyPreset(key)}
                    className={`v2-alerts-preset-btn ${active ? 'v2-alerts-preset-btn-active' : ''}`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
            <p className="v2-alerts-preset-desc">{currentPresetDescription}</p>
          </div>

          <div className="v2-alerts-form-grid">
            <label>
              <span>agent wallet</span>
              <select
                value={form.walletAddress}
                onChange={(e) => setForm({ ...form, walletAddress: e.target.value })}
                required
              >
                <option value="">select wallet…</option>
                {agents?.map((a) => (
                  <option key={a.id} value={a.walletAddress}>
                    {a.agentName ?? a.walletAddress.slice(0, 10) + '...'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>alert type</span>
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
              >
                {Object.entries(ALERT_TYPE_CONFIG).map(([val, cfg]) => (
                  <option key={val} value={val}>{cfg.label}</option>
                ))}
              </select>
            </label>
            {currentTypeConfig?.hasThreshold && (
              <label>
                <span>{currentTypeConfig.thresholdLabel ?? 'threshold'}</span>
                <div className="v2-alerts-threshold">
                  <input
                    value={form.thresholdValue}
                    onChange={(e) => setForm({ ...form, thresholdValue: e.target.value })}
                    placeholder={form.alertType === 'idle_balance' ? '50' : '500'}
                  />
                  {form.alertType !== 'idle_balance' && (
                    <select
                      value={form.thresholdUnit}
                      onChange={(e) => setForm({ ...form, thresholdUnit: e.target.value })}
                    >
                      <option value="usd">USD</option>
                      <option value="native">Native</option>
                      <option value="percentage">%</option>
                    </select>
                  )}
                </div>
                {form.alertType === 'idle_balance' && (
                  <span className="v2-alerts-form-hint">
                    fires when balance stays above this amount with no outgoing tx for the lookback duration
                  </span>
                )}
              </label>
            )}
            <label>
              <span>{form.alertType === 'idle_balance' ? 'idle duration' : 'lookback window'}</span>
              <select
                value={form.lookback}
                onChange={(e) => setForm({ ...form, lookback: e.target.value })}
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
            </label>
            <label>
              <span>cooldown</span>
              <select
                value={form.cooldown}
                onChange={(e) => setForm({ ...form, cooldown: e.target.value })}
              >
                <option value="1m">1 minute</option>
                <option value="5m">5 minutes</option>
                <option value="15m">15 minutes</option>
                <option value="1h">1 hour</option>
              </select>
            </label>
          </div>

          {/* Delivery channels */}
          <div className="v2-alerts-channels">
            <span className="v2-alerts-label">delivery channels</span>
            <div className="v2-alerts-channel-row">
              {(['webhook', 'telegram', 'discord'] as const).map((channel) => (
                <label key={channel} className="v2-alerts-channel-check">
                  <input
                    type="checkbox"
                    checked={form.channels.includes(channel)}
                    onChange={(e) => {
                      const channels = e.target.checked
                        ? [...form.channels, channel]
                        : form.channels.filter((c) => c !== channel);
                      setForm({ ...form, channels });
                    }}
                  />
                  <span>{channel}</span>
                </label>
              ))}
            </div>
            <p className="v2-alerts-form-hint">
              choose at least one delivery channel to activate this alert
            </p>

            <div className="v2-alerts-channel-inputs">
              {form.channels.includes('webhook') && (
                <label>
                  <span>webhook url</span>
                  <input
                    value={form.webhookUrl}
                    onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })}
                    placeholder="https://your-server.com/webhook"
                    style={{
                      borderColor: urlErrors.webhookUrl ? 'var(--danger)' : undefined,
                    }}
                  />
                  {urlErrors.webhookUrl && (
                    <span className="v2-alerts-form-err">{urlErrors.webhookUrl}</span>
                  )}
                </label>
              )}
              {form.channels.includes('telegram') && (
                <label>
                  <span>telegram chat id</span>
                  <input
                    value={form.telegramChatId}
                    onChange={(e) => setForm({ ...form, telegramChatId: e.target.value })}
                    placeholder="chat id (e.g. 123456789)"
                    style={{
                      borderColor: urlErrors.telegramChatId ? 'var(--danger)' : undefined,
                    }}
                  />
                  {urlErrors.telegramChatId && (
                    <span className="v2-alerts-form-err">{urlErrors.telegramChatId}</span>
                  )}
                </label>
              )}
              {form.channels.includes('discord') && (
                <label>
                  <span>discord webhook url</span>
                  <input
                    value={form.discordWebhook}
                    onChange={(e) => setForm({ ...form, discordWebhook: e.target.value })}
                    placeholder="https://discord.com/api/webhooks/..."
                    style={{
                      borderColor: urlErrors.discordWebhook ? 'var(--danger)' : undefined,
                    }}
                  />
                  {urlErrors.discordWebhook && (
                    <span className="v2-alerts-form-err">{urlErrors.discordWebhook}</span>
                  )}
                </label>
              )}
            </div>
          </div>

          <div style={{ marginTop: 4 }}>
            <Button
              type="submit"
              disabled={creating || form.channels.length === 0 || hasUrlErrors}
            >
              {creating ? 'creating…' : './create alert'}
            </Button>
          </div>
        </form>
      )}

      {/* Alert list */}
      <div>
        <div className="v2-alerts-section-head">
          <SectionHead tag="alerts.active" title={<>Active <span className="serif">triggers.</span></>} />
        </div>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : alertList && alertList.length > 0 ? (
          <div
            style={{
              border: '1px solid var(--line)',
              background: 'var(--bg-1)',
            }}
          >
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
          <div className="v2-alerts-empty">
            <p style={{ color: 'var(--fg)', fontSize: 14, margin: 0 }}>
              No alerts configured yet.
            </p>
            <p style={{ color: 'var(--fg-dim)', fontSize: 13, marginTop: 8, marginBottom: 0 }}>
              Start with a recommended preset, then choose where notifications should go.
            </p>
            {agents && agents.length > 0 && (
              <div className="v2-alerts-empty-presets">
                {(Object.entries(ALERT_PRESETS) as [AlertPresetKey, typeof ALERT_PRESETS.failed_tx][]).map(([key, preset]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => applyPreset(key, agents[0]!.walletAddress)}
                    className="v2-alerts-preset-btn"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Alert history */}
      <div>
        <div className="v2-alerts-section-head">
          <SectionHead
            tag="alerts.history"
            title={<>Recent <span className="serif">events.</span></>}
          />
        </div>
        {eventsLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : (
          <DataTable
            columns={eventColumns}
            rows={eventsResponse ?? []}
            empty="No alert events yet."
          />
        )}
      </div>

      <style>{`
        .v2-alerts-header {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 24px;
          flex-wrap: wrap;
        }
        .v2-alerts-header .v2-sh-head { margin-bottom: 0; }
        .v2-alerts-section-head {
          margin-bottom: 16px;
        }
        .v2-alerts-section-head .v2-sh-head { margin-bottom: 0; }
        .v2-alerts-form {
          border: 1px solid var(--line-2);
          background: var(--bg-1);
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .v2-alerts-label {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--muted);
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .v2-alerts-preset {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding-bottom: 20px;
          border-bottom: 1px solid var(--line);
        }
        .v2-alerts-preset-row {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .v2-alerts-preset-btn {
          padding: 9px 14px;
          background: transparent;
          border: 1px solid var(--line-2);
          color: var(--fg-dim);
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 12px;
          letter-spacing: 0.04em;
          cursor: pointer;
          transition: all 0.15s;
        }
        .v2-alerts-preset-btn:hover {
          border-color: var(--phosphor);
          color: var(--phosphor);
        }
        .v2-alerts-preset-btn-active {
          border-color: var(--phosphor);
          color: var(--phosphor);
          background: rgba(61, 216, 141, 0.06);
        }
        .v2-alerts-preset-desc {
          font-size: 12px;
          color: var(--fg-dim);
          margin: 0;
        }
        .v2-alerts-form-grid {
          display: grid;
          gap: 16px;
          grid-template-columns: 1fr 1fr;
        }
        .v2-alerts-form-grid label {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .v2-alerts-form-grid label > span,
        .v2-alerts-channels label > span {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--muted);
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .v2-alerts-form input,
        .v2-alerts-form select {
          background: transparent;
          border: 1px solid var(--line-2);
          color: var(--fg);
          padding: 10px 14px;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 13px;
          min-height: 42px;
        }
        .v2-alerts-form input:focus,
        .v2-alerts-form select:focus {
          outline: none;
          border-color: var(--phosphor);
        }
        .v2-alerts-threshold {
          display: flex;
          gap: 8px;
        }
        .v2-alerts-threshold input { flex: 1; min-width: 0; }
        .v2-alerts-threshold select { flex: 0 0 auto; }
        .v2-alerts-form-hint {
          font-size: 11px;
          color: var(--muted);
          margin: 0;
        }
        .v2-alerts-form-err {
          font-size: 11px;
          color: var(--danger);
        }
        .v2-alerts-channels {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding-top: 20px;
          border-top: 1px solid var(--line);
        }
        .v2-alerts-channel-row {
          display: flex;
          gap: 18px;
          flex-wrap: wrap;
        }
        .v2-alerts-channel-check {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: var(--font-mono);
          font-size: 13px;
          color: var(--fg);
          cursor: pointer;
        }
        .v2-alerts-channel-check input {
          width: 14px;
          height: 14px;
          margin: 0;
          min-height: 0;
          padding: 0;
          appearance: none;
          -webkit-appearance: none;
          background: transparent;
          border: 1px solid var(--line-2);
          cursor: pointer;
          position: relative;
          flex-shrink: 0;
        }
        .v2-alerts-channel-check input:checked {
          background: var(--phosphor);
          border-color: var(--phosphor);
        }
        .v2-alerts-channel-check input:checked::after {
          content: '';
          position: absolute;
          left: 3px;
          top: 0px;
          width: 4px;
          height: 8px;
          border: solid var(--bg);
          border-width: 0 1.5px 1.5px 0;
          transform: rotate(45deg);
        }
        .v2-alerts-channel-inputs {
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 8px;
        }
        .v2-alerts-channel-inputs label {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .v2-alerts-empty {
          border: 1px solid var(--line);
          background: var(--bg-1);
          padding: 48px 24px;
          text-align: center;
        }
        .v2-alerts-empty-presets {
          margin-top: 20px;
          display: flex;
          justify-content: center;
          gap: 10px;
          flex-wrap: wrap;
        }
        .v2-alerts-dot {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }

        @media (max-width: 720px) {
          .v2-alerts-form-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
