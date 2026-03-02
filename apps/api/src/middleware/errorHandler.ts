import type { Context } from 'hono';
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
