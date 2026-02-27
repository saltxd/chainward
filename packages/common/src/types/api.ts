export interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: {
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

export const TIERS = ['free', 'starter', 'pro', 'enterprise'] as const;
export type Tier = (typeof TIERS)[number];

export interface TierLimits {
  agentLimit: number;
  eventLimit: number; // monthly
  balancePollInterval: number; // seconds
  historyRetention: number; // days
}
