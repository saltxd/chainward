import chalk from 'chalk';
import { requireConfig } from './config.js';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: { code: string; message: string };
  pagination?: { total: number; limit: number; offset: number; hasMore: boolean };
}

let cachedConfig: { apiKey: string; apiUrl: string } | null = null;

function getClientConfig() {
  if (!cachedConfig) cachedConfig = requireConfig();
  return cachedConfig;
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const { apiKey, apiUrl } = getClientConfig();

  const url = `${apiUrl}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const body = (await res.json()) as ApiResponse<T>;

  if (!res.ok || !body.success) {
    const msg = body.error?.message ?? `HTTP ${res.status}`;
    throw new ApiError(msg, res.status, body.error?.code);
  }

  return body;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function handleError(err: unknown): never {
  if (err instanceof ApiError) {
    if (err.status === 401) {
      console.error(chalk.red('Authentication failed. Run `chainward login` to update your API key.'));
    } else {
      console.error(chalk.red(`API error: ${err.message}`));
    }
  } else if (err instanceof Error) {
    if (err.message.includes('fetch failed') || err.message.includes('ECONNREFUSED')) {
      console.error(chalk.red('Could not reach ChainWard API. Check your connection.'));
    } else {
      console.error(chalk.red(err.message));
    }
  } else {
    console.error(chalk.red('An unexpected error occurred.'));
  }
  process.exit(1);
}
