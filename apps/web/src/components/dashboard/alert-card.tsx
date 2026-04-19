'use client';

import { useState } from 'react';
import type { AlertConfig } from '@/lib/api';
import { api } from '@/lib/api';
import { GlassToggle } from '@/components/ui/glass-toggle';
import { Badge, Button } from '@/components/v2';

const CHANNEL_TONE: Record<string, 'cyan' | 'phosphor' | 'neutral'> = {
  discord: 'cyan',
  telegram: 'cyan',
  webhook: 'neutral',
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
    <div className="v2-alert-card">
      <div className="v2-alert-card-main">
        {/* Type / name header */}
        <div className="v2-alert-card-head">
          <span className="v2-alert-card-type">{typeLabel}</span>
          <span className="v2-alert-card-sep">│</span>
          <span className="v2-alert-card-name">
            {agentName ?? 'Unknown Agent'}
          </span>
          <span className="v2-alert-card-wallet">
            {alert.walletAddress.slice(0, 6)}…{alert.walletAddress.slice(-4)}
          </span>
        </div>

        {/* Meta row */}
        <div className="v2-alert-card-meta">
          <Badge>{alert.chain}</Badge>
          {threshold && <Badge tone="amber">{threshold}</Badge>}
          {alert.channels.map((ch) => (
            <Badge key={ch} tone={CHANNEL_TONE[ch] ?? 'neutral'}>
              {ch}
            </Badge>
          ))}
          {!alert.enabled && <Badge tone="danger">disabled</Badge>}
        </div>
      </div>

      {/* Actions */}
      <div className="v2-alert-card-actions">
        <Button variant="ghost" size="sm" onClick={() => onTest(alert.id)} disabled={isTesting}>
          {isTesting ? 'sending…' : 'test'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onEditStart}>
          edit
        </Button>
        <Button variant="danger" size="sm" onClick={() => onDelete(alert.id)}>
          delete
        </Button>
        <GlassToggle
          enabled={alert.enabled}
          onChange={() => onToggle(alert)}
          label={alert.enabled ? 'Disable alert' : 'Enable alert'}
        />
      </div>

      <style>{`
        .v2-alert-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 18px 22px;
          border-top: 1px solid var(--line);
          transition: background 0.15s;
          flex-wrap: wrap;
        }
        .v2-alert-card:first-child { border-top: none; }
        .v2-alert-card:hover { background: rgba(58, 167, 109, 0.03); }
        .v2-alert-card-main {
          display: flex;
          flex-direction: column;
          gap: 10px;
          min-width: 0;
          flex: 1 1 320px;
        }
        .v2-alert-card-head {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          font-size: 13px;
        }
        .v2-alert-card-type {
          color: var(--phosphor);
          font-family: var(--font-mono);
          font-size: 12px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .v2-alert-card-sep {
          color: var(--line-2);
        }
        .v2-alert-card-name {
          color: var(--fg);
        }
        .v2-alert-card-wallet {
          font-family: var(--font-mono);
          font-size: 12px;
          color: var(--fg-dim);
        }
        .v2-alert-card-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .v2-alert-card-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
      `}</style>
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
    <form onSubmit={handleSave} className="v2-alert-edit">
      <div className="v2-alert-edit-head">
        <span className="v2-alert-edit-tag">[ editing alert ]</span>
      </div>
      <div className="v2-alert-edit-grid">
        <label>
          <span>alert type</span>
          <select
            value={form.alertType}
            onChange={(e) => setForm({ ...form, alertType: e.target.value })}
          >
            {Object.entries(ALERT_TYPE_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </label>
        <label>
          <span>threshold</span>
          <div className="v2-alert-edit-threshold">
            <input
              value={form.thresholdValue}
              onChange={(e) => setForm({ ...form, thresholdValue: e.target.value })}
              placeholder="500"
            />
            <select
              value={form.thresholdUnit}
              onChange={(e) => setForm({ ...form, thresholdUnit: e.target.value })}
            >
              <option value="usd">USD</option>
              <option value="native">Native</option>
              <option value="percentage">%</option>
            </select>
          </div>
        </label>
      </div>

      <div className="v2-alert-edit-channels">
        <span className="v2-alert-edit-label">channels</span>
        <div className="v2-alert-edit-channel-row">
          {(['webhook', 'telegram', 'discord'] as const).map((ch) => (
            <label key={ch} className="v2-alert-edit-checkbox">
              <input
                type="checkbox"
                checked={form.channels.includes(ch)}
                onChange={(e) => {
                  const channels = e.target.checked
                    ? [...form.channels, ch]
                    : form.channels.filter((c) => c !== ch);
                  setForm({ ...form, channels });
                }}
              />
              <span>{ch}</span>
            </label>
          ))}
        </div>

        <div className="v2-alert-edit-channel-inputs">
          {form.channels.includes('webhook') && (
            <input
              value={form.webhookUrl}
              onChange={(e) => setForm({ ...form, webhookUrl: e.target.value })}
              placeholder="https://your-server.com/webhook"
            />
          )}
          {form.channels.includes('telegram') && (
            <input
              value={form.telegramChatId}
              onChange={(e) => setForm({ ...form, telegramChatId: e.target.value })}
              placeholder="Telegram chat ID (e.g. 123456789)"
            />
          )}
          {form.channels.includes('discord') && (
            <input
              value={form.discordWebhook}
              onChange={(e) => setForm({ ...form, discordWebhook: e.target.value })}
              placeholder="https://discord.com/api/webhooks/..."
            />
          )}
        </div>
      </div>

      <div className="v2-alert-edit-actions">
        <Button type="submit" disabled={saving || form.channels.length === 0} size="sm">
          {saving ? 'saving…' : './save'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel} type="button">
          cancel
        </Button>
      </div>

      <style>{`
        .v2-alert-edit {
          border: 1px solid var(--phosphor-dim);
          background: var(--bg-1);
          padding: 22px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .v2-alert-edit-head {
          display: flex;
          align-items: center;
        }
        .v2-alert-edit-tag {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--phosphor);
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .v2-alert-edit-grid {
          display: grid;
          gap: 16px;
          grid-template-columns: 1fr 1fr;
        }
        .v2-alert-edit-grid label,
        .v2-alert-edit-channels {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .v2-alert-edit-grid label > span,
        .v2-alert-edit-label {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--muted);
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .v2-alert-edit input,
        .v2-alert-edit select {
          background: transparent;
          border: 1px solid var(--line-2);
          color: var(--fg);
          padding: 10px 14px;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 13px;
        }
        .v2-alert-edit input:focus,
        .v2-alert-edit select:focus {
          outline: none;
          border-color: var(--phosphor);
        }
        .v2-alert-edit-threshold {
          display: flex;
          gap: 8px;
        }
        .v2-alert-edit-threshold input { flex: 1; }
        .v2-alert-edit-channel-row {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;
        }
        .v2-alert-edit-checkbox {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: var(--font-mono);
          font-size: 13px;
          color: var(--fg-dim);
          cursor: pointer;
        }
        .v2-alert-edit-checkbox input {
          width: 14px;
          height: 14px;
          margin: 0;
          appearance: none;
          -webkit-appearance: none;
          background: transparent;
          border: 1px solid var(--line-2);
          cursor: pointer;
          position: relative;
          flex-shrink: 0;
          padding: 0;
        }
        .v2-alert-edit-checkbox input:checked {
          background: var(--phosphor);
          border-color: var(--phosphor);
        }
        .v2-alert-edit-checkbox input:checked::after {
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
        .v2-alert-edit-channel-inputs {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 8px;
        }
        .v2-alert-edit-actions {
          display: flex;
          gap: 8px;
        }
        @media (max-width: 720px) {
          .v2-alert-edit-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </form>
  );
}
