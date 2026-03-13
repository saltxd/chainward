'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { AlertConfig } from '@/lib/api';
import { api } from '@/lib/api';

const CHANNEL_COLORS: Record<string, string> = {
  discord: 'bg-[#5865f2]/20 text-[#5865f2]',
  telegram: 'bg-[#26a5e4]/20 text-[#26a5e4]',
  webhook: 'bg-muted text-muted-foreground',
};

const ALERT_TYPE_LABELS: Record<string, string> = {
  large_transfer: 'Large Transfer',
  balance_drop: 'Balance Drop',
  gas_spike: 'Gas Spike',
  failed_tx: 'Failed Tx',
  inactivity: 'Inactivity',
  new_contract: 'New Contract',
  idle_balance: 'Idle Balance',
};

function formatThreshold(value: string | null, unit: string | null): string | null {
  if (!value) return null;
  const num = parseFloat(value);
  const clean = num % 1 === 0 ? num.toString() : num.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  switch (unit) {
    case 'usd':
      return `$${clean} USD`;
    case 'percentage':
      return `${clean}%`;
    case 'native':
      return `${clean} ETH`;
    default:
      return clean;
  }
}

interface AlertCardProps {
  alert: AlertConfig;
  agentName: string | null;
  onTest: (id: number) => void;
  onToggle: (alert: AlertConfig) => void;
  onDelete: (id: number) => void;
  onUpdated: () => void;
  isTesting: boolean;
  isEditing: boolean;
  onEditStart: () => void;
  onEditCancel: () => void;
}

export function AlertCard({
  alert,
  agentName,
  onTest,
  onToggle,
  onDelete,
  onUpdated,
  isTesting,
  isEditing,
  onEditStart,
  onEditCancel,
}: AlertCardProps) {
  if (isEditing) {
    return (
      <EditForm
        alert={alert}
        onSave={() => { onEditCancel(); onUpdated(); }}
        onCancel={onEditCancel}
      />
    );
  }

  const threshold = formatThreshold(alert.thresholdValue, alert.thresholdUnit);
  const typeLabel = ALERT_TYPE_LABELS[alert.alertType] ?? alert.alertType;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2 min-w-0">
          {/* Agent name + address */}
          <div>
            <span className="font-medium text-sm">
              {agentName ?? 'Unknown Agent'}
            </span>
            <span className="ml-2 font-mono text-xs text-muted-foreground">
              {alert.walletAddress.slice(0, 6)}...{alert.walletAddress.slice(-4)}
            </span>
          </div>

          {/* Badges row */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-primary/15 px-1.5 py-0.5 text-xs font-medium text-primary">
              {typeLabel}
            </span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs capitalize text-muted-foreground">
              {alert.chain}
            </span>
            {threshold && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                {threshold}
              </span>
            )}
          </div>

          {/* Channel pills */}
          <div className="flex flex-wrap gap-1.5">
            {alert.channels.map((ch) => (
              <span
                key={ch}
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                  CHANNEL_COLORS[ch] ?? 'bg-muted text-muted-foreground',
                )}
              >
                {ch}
              </span>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => onTest(alert.id)}
            disabled={isTesting}
            className="rounded-lg border border-border px-3 py-1 text-xs transition-colors hover:bg-muted disabled:opacity-50"
          >
            {isTesting ? 'Sending...' : 'Test'}
          </button>
          <button
            onClick={onEditStart}
            className="rounded-lg border border-border px-3 py-1 text-xs transition-colors hover:bg-muted"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(alert.id)}
            className="rounded-lg border border-destructive/30 px-3 py-1 text-xs text-destructive transition-colors hover:bg-destructive/10"
          >
            Delete
          </button>

          {/* Toggle switch */}
          <button
            onClick={() => onToggle(alert)}
            className={cn(
              'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors',
              alert.enabled ? 'bg-[#4ade80]' : 'bg-muted',
            )}
            role="switch"
            aria-checked={alert.enabled}
          >
            <span
              className={cn(
                'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform',
                alert.enabled ? 'translate-x-4' : 'translate-x-0.5',
                'mt-0.5',
              )}
            />
          </button>
        </div>
      </div>
    </div>
  );
}

function EditForm({
  alert,
  onSave,
  onCancel,
}: {
  alert: AlertConfig;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    alertType: alert.alertType,
    thresholdValue: alert.thresholdValue ?? '',
    thresholdUnit: alert.thresholdUnit ?? 'usd',
    channels: [...alert.channels],
    webhookUrl: alert.webhookUrl ?? '',
    telegramChatId: alert.telegramChatId ?? '',
    discordWebhook: alert.discordWebhook ?? '',
  });
  const [saving, setSaving] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.updateAlert(alert.id, {
        alertType: form.alertType,
        thresholdValue: form.thresholdValue || undefined,
        thresholdUnit: form.thresholdUnit,
        channels: form.channels,
        webhookUrl: form.channels.includes('webhook') ? form.webhookUrl || undefined : undefined,
        telegramChatId: form.channels.includes('telegram') ? form.telegramChatId || undefined : undefined,
        discordWebhook: form.channels.includes('discord') ? form.discordWebhook || undefined : undefined,
      });
      onSave();
    } catch {
      // toast will be called by parent
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="rounded-lg border border-primary/30 bg-card p-4">
      <div className="mb-3 text-xs font-medium text-primary">Editing Alert</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Alert Type</label>
          <select
            value={form.alertType}
            onChange={(e) => setForm({ ...form, alertType: e.target.value })}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
          >
            {Object.entries(ALERT_TYPE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Threshold</label>
          <div className="flex gap-2">
            <input
              value={form.thresholdValue}
              onChange={(e) => setForm({ ...form, thresholdValue: e.target.value })}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
              placeholder="500"
            />
            <select
              value={form.thresholdUnit}
              onChange={(e) => setForm({ ...form, thresholdUnit: e.target.value })}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
            >
              <option value="usd">USD</option>
              <option value="native">Native</option>
              <option value="percentage">%</option>
            </select>
          </div>
        </div>
      </div>

      {/* Channels */}
      <div className="mt-3">
        <label className="text-xs text-muted-foreground">Channels</label>
        <div className="mt-1 flex gap-3">
          {(['webhook', 'telegram', 'discord'] as const).map((ch) => (
            <label key={ch} className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={form.channels.includes(ch)}
                onChange={(e) => {
                  const channels = e.target.checked
                    ? [...form.channels, ch]
                    : form.channels.filter((c) => c !== ch);
                  setForm({ ...form, channels });
                }}
                className="rounded border-border"
              />
              <span className="capitalize">{ch}</span>
            </label>
          ))}
        </div>

        <div className="mt-2 space-y-2">
          {form.channels.includes('webhook') && (
            <input
              value={form.webhookUrl}
              onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })}
              placeholder="https://your-server.com/webhook"
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
            />
          )}
          {form.channels.includes('telegram') && (
            <input
              value={form.telegramChatId}
              onChange={(e) => setForm({ ...form, telegramChatId: e.target.value })}
              placeholder="Telegram chat ID (e.g. 123456789)"
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
            />
          )}
          {form.channels.includes('discord') && (
            <input
              value={form.discordWebhook}
              onChange={(e) => setForm({ ...form, discordWebhook: e.target.value })}
              placeholder="https://discord.com/api/webhooks/..."
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
            />
          )}
        </div>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={saving || form.channels.length === 0}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-border px-3 py-1.5 text-xs transition-colors hover:bg-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
