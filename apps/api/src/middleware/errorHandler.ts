import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ZodError } from 'zod';
import type { ApiErrorResponse } from '@chainward/common';
import { logger } from '../lib/logger.js';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

const HTTP_EXCEPTION_ERRORS: Partial<Record<number, { code: string; message: string }>> = {
  413: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body too large' },
};

export function handleError(err: Error, c: Context): Response {
  if (err instanceof AppError) {
    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    };
    return c.json(body, err.statusCode as 400);
  }

  // Schema .parse() failures are bad input, not server faults.
  if (err instanceof ZodError) {
    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    };
    return c.json(body, 400);
  }

  // Hono's own middleware (bodyLimit → 413, etc.) throws these; keep their status.
  if (err instanceof HTTPException) {
    const known = HTTP_EXCEPTION_ERRORS[err.status];
    const body: ApiErrorResponse = {
      success: false,
      error: {
        code: known?.code ?? 'HTTP_ERROR',
        message: err.message || known?.message || 'Request failed',
      },
    };
    return c.json(body, err.status);
  }

  logger.error({ err }, 'Unhandled error');

  const body: ApiErrorResponse = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    },
  };
  return c.json(body, 500);
}
