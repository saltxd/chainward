import { describe, it, expect } from 'vitest';
import { buildClaudeEnv, FORWARDED_TELEMETRY_VARS } from '../src/report-writer.js';

describe('buildClaudeEnv — env allowlist for the spawned `claude` subprocess', () => {
  it('forwards the Claude OAuth token + all telemetry vars', () => {
    const source: NodeJS.ProcessEnv = {
      HOME: '/home/x',
      PATH: '/usr/bin',
      CLAUDE_CODE_OAUTH_TOKEN: 'oauth-tok',
      CLAUDE_CODE_ENABLE_TELEMETRY: '1',
      CLAUDE_CODE_ENHANCED_TELEMETRY_BETA: '1',
      OTEL_TRACES_EXPORTER: 'otlp',
      OTEL_METRICS_EXPORTER: 'otlp',
      OTEL_LOGS_EXPORTER: 'otlp',
      OTEL_EXPORTER_OTLP_PROTOCOL: 'grpc',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://phoenix-svc.observability.svc.cluster.local:4317',
      OTEL_EXPORTER_OTLP_HEADERS: 'authorization=Bearer phx-key',
      OTEL_RESOURCE_ATTRIBUTES: 'service.name=acp-decoder',
    };
    const env = buildClaudeEnv(source);
    expect(env.CLAUDE_CODE_OAUTH_TOKEN).toBe('oauth-tok');
    for (const k of FORWARDED_TELEMETRY_VARS) {
      expect(env[k], `${k} must be forwarded so the CLI exports traces`).toBe(source[k]);
    }
    // This is the actual bug we fixed: telemetry must reach the subprocess.
    expect(env.OTEL_EXPORTER_OTLP_ENDPOINT).toContain('phoenix-svc');
    expect(env.OTEL_EXPORTER_OTLP_HEADERS).toContain('Bearer');
  });

  it('does NOT leak wallet/DB/Privy secrets into the subprocess', () => {
    const source: NodeJS.ProcessEnv = {
      HOME: '/home/x',
      PATH: '/usr/bin',
      CLAUDE_CODE_OAUTH_TOKEN: 'oauth-tok',
      // secrets the pod carries that must never reach `claude`:
      WALLET_SIGNER_PRIVATE_KEY: '0xdeadbeef',
      PRIVATE_KEY: '0xsigner',
      DATABASE_URL: 'postgres://u:p@db/x',
      PRIVY_APP_SECRET: 'privy-secret',
      REDIS_URL: 'redis://r',
    };
    const env = buildClaudeEnv(source);
    expect(env.WALLET_SIGNER_PRIVATE_KEY).toBeUndefined();
    expect(env.PRIVATE_KEY).toBeUndefined();
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.PRIVY_APP_SECRET).toBeUndefined();
    expect(env.REDIS_URL).toBeUndefined();
    // only the known-safe keys are present
    const allowed = new Set(['HOME', 'PATH', 'CLAUDE_CODE_OAUTH_TOKEN', ...FORWARDED_TELEMETRY_VARS]);
    for (const k of Object.keys(env)) {
      expect(allowed.has(k), `unexpected key leaked into subprocess env: ${k}`).toBe(true);
    }
  });

  it('always provides HOME and PATH fallbacks', () => {
    const env = buildClaudeEnv({});
    expect(env.HOME).toBeTruthy();
    expect(env.PATH).toBeTruthy();
  });
});
