'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { AlertConfig } from '@/lib/api';
import { api } from '@/lib/api';

const CHANNEL_COLORS: Record<string, string> = {
  discord: 'bg-discord/20 text-discord',
  telegram: 'bg-telegram/20 text-telegram',
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

          {/* Toggle switch — liquid glass */}
          <GlassToggle
            enabled={alert.enabled}
            onChange={() => onToggle(alert)}
            label={alert.enabled ? 'Disable alert' : 'Enable alert'}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Liquid-glass style toggle. Inspired by Apple's Liquid Glass material:
 * - translucent track with backdrop blur and inset shadow (reads as glass thickness)
 * - specular gradient sheen on the thumb
 * - spring-like motion via cubic-bezier with a touch of overshoot
 * - accent glow + color bleed when active
 */
function GlassToggle({
  enabled,
  onChange,
  label,
}: {
  enabled: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      className={cn(
        'group relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full',
        'border border-white/10 backdrop-blur-md',
        // base translucent track
        'bg-gradient-to-b from-white/[0.04] to-white/[0.01]',
        // inset shadow for glass thickness
        'shadow-[inset_0_1px_1px_rgba(255,255,255,0.08),inset_0_-1px_1px_rgba(0,0,0,0.35)]',
        // spring-like timing
        'transition-[background-color,border-color,box-shadow] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
        // active state overlays with accent bleed + outer glow
        enabled &&
          'border-[#4ade80]/40 bg-gradient-to-b from-[#4ade80]/35 to-[#4ade80]/15 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),inset_0_-1px_2px_rgba(0,0,0,0.3),0_0_14px_rgba(74,222,128,0.35)]',
        // focus ring
        'outline-none focus-visible:ring-2 focus-visible:ring-[#4ade80]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      )}
    >
      {/* Specular sheen that shifts with state */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 rounded-full',
          'bg-gradient-to-t from-transparent via-white/[0.04] to-white/[0.12]',
          'opacity-60 transition-opacity duration-300',
          enabled && 'opacity-90',
        )}
      />

      {/* Thumb */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none relative z-10 ml-0.5 inline-block h-5 w-5 rounded-full',
          // thumb base: cool white with inner highlight
          'bg-gradient-to-b from-white to-white/90',
          // concentric shadow/highlight for 3D feel
          'shadow-[0_1px_2px_rgba(0,0,0,0.35),0_0_0_0.5px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.9),inset_0_-1px_0_rgba(0,0,0,0.06)]',
          // spring motion with slight overshoot — feels "liquid"
          'transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
          // active press squish
          'group-active:scale-95',
          enabled ? 'translate-x-[20px]' : 'translate-x-0',
        )}
      >
        {/* Tiny specular highlight on the thumb */}
        <span
          aria-hidden
          className="absolute inset-x-1 top-0.5 h-1.5 rounded-full bg-gradient-to-b from-white/80 to-transparent"
        />
      </span>
    </button>
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
