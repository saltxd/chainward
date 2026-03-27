'use client';

import { useState } from 'react';
import { useSession, logout } from '@/lib/auth-client';
import { useDisconnect } from 'wagmi';
import { useRouter } from 'next/navigation';
import { api, type Agent, type ApiKey } from '@/lib/api';
import { useApi } from '@/hooks/use-api';
import { ErrorBanner } from '@/components/ui/error-banner';
import { cn } from '@/lib/utils';

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

  async function handleDisconnect() {
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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Account settings and API key management</p>
      </div>

      {keyError && <ErrorBanner message={keyError} />}

      <div className="grid gap-6">
        {/* Account info */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Account</h2>
          <div className="mt-4 space-y-3">
            <div className="flex flex-col gap-1 text-sm sm:flex-row sm:justify-between">
              <span className="text-muted-foreground">Wallet</span>
              <span className="truncate font-mono">{user?.walletAddress ?? '-'}</span>
            </div>
            <div className="flex flex-col gap-1 text-sm sm:flex-row sm:justify-between">
              <span className="text-muted-foreground">Display Name</span>
              <span>{user?.displayName ?? '-'}</span>
            </div>
          </div>
          <button
            onClick={handleDisconnect}
            className="mt-4 min-h-[44px] rounded-lg border border-destructive/50 px-3 py-2 text-sm text-destructive transition-colors hover:bg-destructive/10"
          >
            Disconnect
          </button>
        </div>

        {/* Plan info */}
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Plan</h2>
          <div className="mt-4 flex items-center gap-4">
            <span className="rounded-full bg-accent px-3 py-1 text-sm font-medium capitalize text-accent-foreground">
              {tier}
            </span>
            <span className="text-sm text-muted-foreground">
              {agents?.length ?? 0} / {agentLimit} agents used
            </span>
          </div>
          <div className="mt-4">
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{
                  width: `${typeof agentLimit === 'number' ? Math.min(((agents?.length ?? 0) / agentLimit) * 100, 100) : 10}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* New key reveal banner */}
        {newRawKey && (
          <div className="rounded-lg border border-accent-foreground/30 bg-accent-foreground/5 p-6">
            <h3 className="text-sm font-semibold text-accent-foreground">API Key Created</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Copy this key now. It will not be shown again.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <code className="flex-1 rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm">
                {newRawKey}
              </code>
              <button
                onClick={handleCopyKey}
                className="rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-muted"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <button
              onClick={() => setNewRawKey(null)}
              className="mt-3 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* API Keys */}
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">API Keys</h2>
            <button
              onClick={() => setShowCreateKey(!showCreateKey)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm transition-colors hover:bg-muted"
            >
              Generate Key
            </button>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            API keys allow programmatic access to ChainWard. Keys are shown once at creation.
          </p>

          {/* Create key form */}
          {showCreateKey && (
            <form onSubmit={handleCreateKey} className="mt-4 rounded-lg border border-border bg-background p-4">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Key Name</label>
                  <input
                    value={keyForm.name}
                    onChange={(e) => setKeyForm({ ...keyForm, name: e.target.value })}
                    required
                    placeholder="e.g., Production CI/CD"
                    className="rounded-lg border border-border bg-card px-3 py-2 text-sm placeholder:text-muted-foreground"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">Scopes</label>
                  <div className="flex gap-2">
                    {['read', 'write', 'admin'].map((scope) => (
                      <button
                        key={scope}
                        type="button"
                        onClick={() => toggleScope(scope)}
                        className={cn(
                          'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                          keyForm.scopes.includes(scope)
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {scope}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  type="submit"
                  disabled={creatingKey || !keyForm.name || keyForm.scopes.length === 0}
                  className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {creatingKey ? 'Creating...' : 'Create Key'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreateKey(false)}
                  className="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-muted"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {/* Key list */}
          <div className="mt-4">
            {apiKeys && apiKeys.length > 0 ? (
              <div className="space-y-3">
                {apiKeys.map((key) => (
                  <div
                    key={key.id}
                    className="flex flex-col gap-2 rounded-lg border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{key.name}</span>
                        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                          {key.keyPrefix}...
                        </code>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {key.scopes.map((scope) => (
                          <span
                            key={scope}
                            className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                          >
                            {scope}
                          </span>
                        ))}
                        <span className="text-xs text-muted-foreground">
                          Created {new Date(key.createdAt).toLocaleDateString()}
                        </span>
                        {key.lastUsedAt && (
                          <span className="text-xs text-muted-foreground">
                            Last used {new Date(key.lastUsedAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRevokeKey(key.id)}
                      className="min-h-[44px] self-start rounded-lg border border-destructive/50 px-3 py-2 text-xs text-destructive transition-colors hover:text-destructive/80 sm:self-auto sm:border-0 sm:p-0"
                    >
                      Revoke
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-background p-4 text-center">
                <p className="text-sm text-muted-foreground">No API keys created yet.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
