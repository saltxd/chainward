import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ObservatoryAgent, KnownContract, SpamTokenData } from './types.js';

type IntelligenceSource = 'local' | 'remote' | 'empty';

/**
 * Determine the intelligence source from environment.
 *
 * - `local`  — reads JSON files from packages/intelligence/ (production)
 * - `remote` — reads from a URL endpoint (future)
 * - `empty`  — returns empty data (self-hosted / fresh install)
 *
 * If INTELLIGENCE_SOURCE is not set, auto-detects based on whether local
 * data files exist.
 */
function getSource(): IntelligenceSource {
  const src = process.env.INTELLIGENCE_SOURCE;
  if (src === 'local' || src === 'remote' || src === 'empty') return src;

  // Auto-detect: use local if data exists, otherwise empty
  const dir = getLocalDir();
  if (existsSync(resolve(dir, 'observatory-agents.json'))) return 'local';
  return 'empty';
}

function getLocalDir(): string {
  return process.env.INTELLIGENCE_DIR ?? resolve(process.cwd(), 'packages/intelligence');
}

async function readLocalJson<T>(filename: string): Promise<T | null> {
  const filePath = resolve(getLocalDir(), filename);
  if (!existsSync(filePath)) return null;
  const raw = await readFile(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

/** Load curated observatory agent list. Returns empty array for self-hosted instances. */
export async function getObservatoryAgents(): Promise<ObservatoryAgent[]> {
  const source = getSource();
  if (source === 'empty') return [];
  if (source === 'remote') {
    // Future: fetch from remote intelligence API
    return [];
  }
  return (await readLocalJson<ObservatoryAgent[]>('observatory-agents.json')) ?? [];
}

/** Load known DeFi protocol contract registry. Returns empty array for self-hosted instances. */
export async function getProtocolRegistry(): Promise<KnownContract[]> {
  const source = getSource();
  if (source === 'empty') return [];
  if (source === 'remote') return [];
  return (await readLocalJson<KnownContract[]>('protocol-registry.json')) ?? [];
}

/** Load spam token filter data. Returns empty lists for self-hosted instances. */
export async function getSpamTokenData(): Promise<SpamTokenData> {
  const empty: SpamTokenData = { spamTokens: [], knownTokens: [] };
  const source = getSource();
  if (source === 'empty') return empty;
  if (source === 'remote') return empty;
  return (await readLocalJson<SpamTokenData>('spam-tokens.json')) ?? empty;
}

/** Get the resolved intelligence source for diagnostics */
export function getIntelligenceSource(): IntelligenceSource {
  return getSource();
}
