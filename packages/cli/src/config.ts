import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

interface Config {
  apiKey: string;
  apiUrl: string;
}

const CONFIG_DIR = join(homedir(), '.chainward');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export function getConfig(): Config | null {
  if (!existsSync(CONFIG_FILE)) return null;
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) as Config;
  } catch {
    return null;
  }
}

export function saveConfig(config: Config): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
}

export function requireConfig(): Config {
  const config = getConfig();
  if (!config?.apiKey) {
    console.error('Not logged in. Run `chainward login` first.');
    process.exit(1);
  }
  return config;
}

export const DEFAULT_API_URL = 'https://api.chainward.ai';
