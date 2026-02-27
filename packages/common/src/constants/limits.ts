import type { Tier, TierLimits } from '../types/api.js';

export const TIER_LIMITS: Record<Tier, TierLimits> = {
  free: {
    agentLimit: 3,
    eventLimit: 10_000,
    balancePollInterval: 300, // 5 minutes
    historyRetention: 7, // days
  },
  starter: {
    agentLimit: 10,
    eventLimit: 100_000,
    balancePollInterval: 60, // 1 minute
    historyRetention: 90,
  },
  pro: {
    agentLimit: 50,
    eventLimit: 1_000_000,
    balancePollInterval: 30,
    historyRetention: 365,
  },
  enterprise: {
    agentLimit: -1, // unlimited
    eventLimit: -1, // unlimited
    balancePollInterval: 15,
    historyRetention: 730, // 2 years
  },
} as const;

export const API_RATE_LIMITS = {
  free: { windowMs: 60_000, max: 60 },
  starter: { windowMs: 60_000, max: 300 },
  pro: { windowMs: 60_000, max: 1000 },
  enterprise: { windowMs: 60_000, max: 5000 },
} as const;
