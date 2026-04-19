'use client';

import { useState } from 'react';
import { useSession, logout } from '@/lib/auth-client';
import { useDisconnect } from 'wagmi';
import { useRouter } from 'next/navigation';
import { api, type Agent, type ApiKey } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { ErrorBanner } from '@/components/ui/error-banner';
import {
  SectionHead,
  Button,
  Badge,
  DataTable,
  type Column,
} from '@/components/v2';

export default function SettingsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { data: agents } = useApi<Agent[]>(() => api.getAgents(), []);
  const { data: apiKeys, refetch: refetchKeys } = useApi<ApiKey[]>(
    () => api.getApiKeys(),
    [],
  );

  const { disconnect } = useDisconnect();

  const user = session?.user;
  const tier = user?.tier ?? 'free';
  const agentLimit = tier === 'free' ? 3 : tier === 'starter' ? 10 : tier === 'pro' ? 50 : 'unlimited';

  const [showCreateKey, setShowCreateKey] = useState(false);
  const [keyForm, setKeyForm] = useState({ name: '', scopes: ['read'] as string[] });
  const [creatingKey, setCreatingKey] = useState(false);
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  async function handleDisconnect() {
    if (!confirmDisconnect) {
      setConfirmDisconnect(true);
      setTimeout(() => setConfirmDisconnect(false), 3000);
      return;
    }
    await logout();
    disconnect();
    router.push('/login');
  }

  async function handleCreateKey(e: React.FormEvent) {
    e.preventDefault();
    setCreatingKey(true);
    setKeyError(null);
    try {
      const result = await api.createApiKey({
        name: keyForm.name,
        scopes: keyForm.scopes,
      });
      setNewRawKey(result.data.rawKey);
      setShowCreateKey(false);
      setKeyForm({ name: '', scopes: ['read'] });
      refetchKeys();
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : 'Failed to create API key');
    } finally {
      setCreatingKey(false);
    }
  }

  async function handleRevokeKey(id: number) {
    await api.revokeApiKey(id);
    refetchKeys();
  }

  function handleCopyKey() {
    if (newRawKey) {
      navigator.clipboard.writeText(newRawKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function toggleScope(scope: string) {
    setKeyForm((prev) => ({
      ...prev,
      scopes: prev.scopes.includes(scope)
        ? prev.scopes.filter((s) => s !== scope)
        : [...prev.scopes, scope],
    }));
  }

  const usagePct =
    typeof agentLimit === 'number'
      ? Math.min(((agents?.length ?? 0) / agentLimit) * 100, 100)
      : 10;

  const keyColumns: Column<ApiKey>[] = [
    {
      key: 'name',
      header: 'name',
      render: (key) => <span style={{ color: 'var(--fg)' }}>{key.name}</span>,
    },
    {
      key: 'prefix',
      header: 'prefix',
      width: '160px',
      render: (key) => (
        <span
          style={{
            color: 'var(--phosphor)',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
          }}
        >
          {key.keyPrefix}…
        </span>
      ),
    },
    {
      key: 'scopes',
      header: 'scopes',
      width: '200px',
      render: (key) => (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {key.scopes.map((scope) => (
            <Badge key={scope}>{scope}</Badge>
          ))}
        </div>
      ),
    },
    {
      key: 'created',
      header: 'created',
      width: '120px',
      render: (key) => (
        <span style={{ color: 'var(--fg-dim)', fontSize: 12 }}>
          {new Date(key.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      key: 'lastUsed',
      header: 'last used',
      width: '120px',
      render: (key) => (
        <span style={{ color: 'var(--fg-dim)', fontSize: 12 }}>
          {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : '—'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '100px',
      align: 'right',
      render: (key) => (
        <Button variant="danger" size="sm" onClick={() => handleRevokeKey(key.id)}>
          revoke
        </Button>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
      <SectionHead
        tag="settings"
        title={
          <>
            Account &amp; <span className="serif">access.</span>
          </>
        }
        lede="Wallet binding, tier usage, and API keys for programmatic access to ChainWard."
      />

      {keyError && <ErrorBanner message={keyError} />}

      {/* Account */}
      <div>
        <div className="v2-settings-section-head">
          <SectionHead tag="account" title="Wallet binding." />
        </div>
        <div className="v2-settings-card">
          <dl className="v2-settings-dl">
            <div>
              <dt>wallet</dt>
              <dd className="v2-settings-mono">{user?.walletAddress ?? '—'}</dd>
            </div>
            <div>
              <dt>display name</dt>
              <dd>{user?.displayName ?? '—'}</dd>
            </div>
          </dl>
          <div className="v2-settings-divider" />
          <div className="v2-settings-disconnect">
            <div>
              <p className="v2-settings-row-title">Sign out</p>
              <p className="v2-settings-row-desc">
                Disconnects your wallet session from this device.
              </p>
            </div>
            <button
              onClick={handleDisconnect}
              className={`v2-settings-disconnect-btn ${confirmDisconnect ? 'v2-settings-disconnect-btn-confirm' : ''}`}
            >
              {confirmDisconnect ? 'click again to confirm' : 'disconnect'}
            </button>
          </div>
        </div>
      </div>

      {/* Plan */}
      <div>
        <div className="v2-settings-section-head">
          <SectionHead tag="plan.usage" title={<>Tier &amp; <span className="serif">capacity.</span></>} />
        </div>
        <div className="v2-settings-card">
          <div className="v2-settings-plan">
            <div className="v2-settings-plan-head">
              <Badge tone="phosphor">{tier}</Badge>
              <span className="v2-settings-plan-usage">
                {agents?.length ?? 0} / {agentLimit} agents
              </span>
            </div>
            <div className="v2-settings-meter">
              <div
                className="v2-settings-meter-fill"
                style={{ width: `${usagePct}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* New key reveal banner */}
      {newRawKey && (
        <div className="v2-settings-new-key">
          <div className="v2-settings-new-key-head">
            <span className="v2-settings-tag">[ api.key.created ]</span>
            <button
              onClick={() => setNewRawKey(null)}
              className="v2-settings-dismiss"
              type="button"
            >
              dismiss
            </button>
          </div>
          <p className="v2-settings-new-key-warn">
            Copy this key now — it will not be shown again.
          </p>
          <div className="v2-settings-new-key-row">
            <code className="v2-settings-new-key-code">{newRawKey}</code>
            <Button variant="ghost" size="sm" onClick={handleCopyKey}>
              {copied ? 'copied!' : 'copy'}
            </Button>
          </div>
        </div>
      )}

      {/* API Keys */}
      <div>
        <div className="v2-settings-section-head v2-settings-section-head-with-action">
          <SectionHead
            tag="api.keys"
            title={<>Programmatic <span className="serif">access.</span></>}
          />
          <Button onClick={() => setShowCreateKey(!showCreateKey)}>
            {showCreateKey ? 'cancel' : '+ generate key'}
          </Button>
        </div>
        <p className="v2-settings-prelude">
          API keys grant programmatic access. Keys are shown once at creation — store them securely.
        </p>

        {showCreateKey && (
          <form onSubmit={handleCreateKey} className="v2-settings-form">
            <div className="v2-settings-form-grid">
              <label>
                <span>key name</span>
                <input
                  value={keyForm.name}
                  onChange={(e) => setKeyForm({ ...keyForm, name: e.target.value })}
                  required
                  placeholder="e.g., production ci/cd"
                />
              </label>
              <label>
                <span>scopes</span>
                <div className="v2-settings-scopes">
                  {['read', 'write', 'admin'].map((scope) => {
                    const active = keyForm.scopes.includes(scope);
                    return (
                      <button
                        key={scope}
                        type="button"
                        onClick={() => toggleScope(scope)}
                        className={`v2-settings-scope-btn ${active ? 'v2-settings-scope-btn-active' : ''}`}
                      >
                        {scope}
                      </button>
                    );
                  })}
                </div>
              </label>
            </div>
            <div className="v2-settings-form-actions">
              <Button
                type="submit"
                disabled={creatingKey || !keyForm.name || keyForm.scopes.length === 0}
                size="sm"
              >
                {creatingKey ? 'creating…' : './create key'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => setShowCreateKey(false)}
              >
                cancel
              </Button>
            </div>
          </form>
        )}

        {apiKeys && apiKeys.length > 0 ? (
          <DataTable columns={keyColumns} rows={apiKeys} />
        ) : (
          <div className="v2-settings-empty">
            <p style={{ color: 'var(--fg)', fontSize: 14, margin: 0 }}>
              No API keys created yet.
            </p>
            <p style={{ color: 'var(--fg-dim)', fontSize: 13, marginTop: 8, marginBottom: 0 }}>
              Generate a key to integrate ChainWard with your CI/CD or scripts.
            </p>
          </div>
        )}
      </div>

      <style>{`
        .v2-settings-section-head {
          margin-bottom: 16px;
        }
        .v2-settings-section-head .v2-sh-head { margin-bottom: 0; }
        .v2-settings-section-head-with-action {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 24px;
          flex-wrap: wrap;
        }
        .v2-settings-prelude {
          color: var(--fg-dim);
          font-size: 13px;
          margin: 0 0 20px 0;
        }
        .v2-settings-card {
          border: 1px solid var(--line);
          background: var(--bg-1);
          padding: 24px;
        }
        .v2-settings-tag {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--phosphor);
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .v2-settings-dl {
          display: flex;
          flex-direction: column;
          gap: 14px;
          margin: 0;
        }
        .v2-settings-dl > div {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          flex-wrap: wrap;
        }
        .v2-settings-dl dt {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--muted);
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .v2-settings-dl dd {
          margin: 0;
          font-size: 13px;
          color: var(--fg);
        }
        .v2-settings-mono {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 12px;
          color: var(--fg-dim);
          word-break: break-all;
        }
        .v2-settings-divider {
          height: 1px;
          background: var(--line);
          margin: 24px 0;
        }
        .v2-settings-disconnect {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          flex-wrap: wrap;
        }
        .v2-settings-row-title {
          font-size: 13px;
          color: var(--fg);
          font-weight: 500;
          margin: 0;
        }
        .v2-settings-row-desc {
          font-size: 12px;
          color: var(--fg-dim);
          margin: 4px 0 0 0;
        }
        .v2-settings-disconnect-btn {
          padding: 10px 16px;
          font-family: var(--font-mono);
          font-size: 12px;
          letter-spacing: 0.04em;
          background: transparent;
          border: 1px solid rgba(230, 103, 103, 0.3);
          color: var(--danger);
          cursor: pointer;
          transition: all 0.15s;
        }
        .v2-settings-disconnect-btn:hover {
          background: rgba(230, 103, 103, 0.08);
          border-color: var(--danger);
        }
        .v2-settings-disconnect-btn-confirm {
          background: rgba(230, 103, 103, 0.12);
          border-color: var(--danger);
        }
        .v2-settings-plan {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .v2-settings-plan-head {
          display: flex;
          align-items: center;
          gap: 14px;
          flex-wrap: wrap;
        }
        .v2-settings-plan-usage {
          font-family: var(--font-mono);
          font-size: 13px;
          color: var(--fg-dim);
          font-variant-numeric: tabular-nums;
        }
        .v2-settings-meter {
          height: 6px;
          background: var(--line);
          overflow: hidden;
        }
        .v2-settings-meter-fill {
          height: 100%;
          background: var(--phosphor);
          box-shadow: 0 0 8px rgba(58, 167, 109, 0.4);
          transition: width 0.3s;
        }
        .v2-settings-new-key {
          border: 1px solid var(--phosphor-dim);
          background: rgba(58, 167, 109, 0.04);
          padding: 20px 22px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .v2-settings-new-key-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .v2-settings-dismiss {
          background: transparent;
          border: none;
          color: var(--fg-dim);
          font-family: var(--font-mono);
          font-size: 11px;
          cursor: pointer;
          letter-spacing: 0.06em;
          padding: 0;
        }
        .v2-settings-dismiss:hover { color: var(--fg); }
        .v2-settings-new-key-warn {
          font-size: 12px;
          color: var(--amber);
          margin: 0;
        }
        .v2-settings-new-key-row {
          display: flex;
          align-items: stretch;
          gap: 10px;
        }
        .v2-settings-new-key-code {
          flex: 1;
          padding: 12px 14px;
          background: var(--bg);
          border: 1px solid var(--line-2);
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 12.5px;
          color: var(--phosphor);
          overflow-x: auto;
          white-space: nowrap;
        }
        .v2-settings-form {
          border: 1px solid var(--line-2);
          background: var(--bg-1);
          padding: 24px;
          margin-bottom: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .v2-settings-form-grid {
          display: grid;
          gap: 16px;
          grid-template-columns: 1fr 1fr;
        }
        .v2-settings-form-grid label {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .v2-settings-form-grid label > span {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--muted);
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .v2-settings-form input {
          background: transparent;
          border: 1px solid var(--line-2);
          color: var(--fg);
          padding: 10px 14px;
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 13px;
          min-height: 42px;
        }
        .v2-settings-form input::placeholder { color: var(--muted); }
        .v2-settings-form input:focus {
          outline: none;
          border-color: var(--phosphor);
        }
        .v2-settings-scopes {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .v2-settings-scope-btn {
          padding: 8px 14px;
          background: transparent;
          border: 1px solid var(--line-2);
          color: var(--fg-dim);
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 12px;
          letter-spacing: 0.04em;
          cursor: pointer;
          transition: all 0.15s;
          text-transform: lowercase;
        }
        .v2-settings-scope-btn:hover {
          border-color: var(--phosphor);
          color: var(--phosphor);
        }
        .v2-settings-scope-btn-active {
          border-color: var(--phosphor);
          background: var(--phosphor);
          color: var(--bg);
        }
        .v2-settings-form-actions {
          display: flex;
          gap: 8px;
        }
        .v2-settings-empty {
          border: 1px solid var(--line);
          background: var(--bg-1);
          padding: 48px 24px;
          text-align: center;
        }

        @media (max-width: 720px) {
          .v2-settings-form-grid { grid-template-columns: 1fr; }
          .v2-settings-dl > div { flex-direction: column; gap: 4px; }
        }
      `}</style>
    </div>
  );
}
