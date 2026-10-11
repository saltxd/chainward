import { z } from 'zod';
import { ALERT_TYPES, DELIVERY_CHANNELS } from '@chainward/common';
import { validateWebhookUrl } from './validateUrl.js';

const safeWebhookUrl = z.string().url().refine(
  (url) => validateWebhookUrl(url) === null,
  { message: 'Webhook URL must be HTTPS and point to a public domain' },
);

/** Threshold units the dashboard, SDK and CLI send. */
const THRESHOLD_UNITS = ['usd', 'native', 'percentage'] as const;

export const createAlertSchema = z
  .object({
    walletAddress: z.string().min(1),
    chain: z.enum(['base', 'solana']),
    alertType: z.enum(ALERT_TYPES),
    thresholdValue: z.string().optional(),
    // 'hours' is what `chainward alerts create` (CLI 0.1.x) sends for inactivity.
    thresholdUnit: z.enum([...THRESHOLD_UNITS, 'hours']).optional(),
    lookbackWindow: z.string().optional(),
    channels: z.array(z.enum(DELIVERY_CHANNELS)).min(1),
    webhookUrl: safeWebhookUrl.optional(),
    telegramChatId: z.string().optional(),
    discordWebhook: safeWebhookUrl.optional(),
    cooldown: z.string().optional(),
  })
  .superRefine((input, ctx) => {
    if (input.thresholdUnit !== 'hours') return;
    if (input.alertType !== 'inactivity') {
      ctx.addIssue({ code: 'custom', path: ['thresholdUnit'], message: 'hours is only a unit for inactivity alerts' });
    } else if (!(Number(input.thresholdValue) > 0)) {
      ctx.addIssue({ code: 'custom', path: ['thresholdValue'], message: 'Inactive hours must be a positive number' });
    }
  });

export const updateAlertSchema = z.object({
  thresholdValue: z.string().optional(),
  thresholdUnit: z.enum(THRESHOLD_UNITS).optional(),
  lookbackWindow: z.string().optional(),
  channels: z.array(z.enum(DELIVERY_CHANNELS)).optional(),
  webhookUrl: safeWebhookUrl.optional(),
  telegramChatId: z.string().optional(),
  discordWebhook: safeWebhookUrl.optional(),
  enabled: z.boolean().optional(),
  cooldown: z.string().optional(),
});

export type CreateAlertBody = Omit<z.infer<typeof createAlertSchema>, 'thresholdUnit'> & {
  thresholdUnit?: (typeof THRESHOLD_UNITS)[number];
};

/**
 * Parse a create-alert body. An inactivity alert fires on its lookback window
 * (the evaluator reads lookbackWindow, the dashboard sends it), so the hours
 * an older CLI sends as thresholdValue + 'hours' become that window and the
 * alert is stored like one made in the dashboard.
 */
export function parseCreateAlert(body: unknown): CreateAlertBody {
  const { thresholdUnit, ...input } = createAlertSchema.parse(body);
  if (thresholdUnit !== 'hours') return { ...input, ...(thresholdUnit ? { thresholdUnit } : {}) };
  const { thresholdValue, ...rest } = input;
  return { ...rest, lookbackWindow: input.lookbackWindow ?? `${Number(thresholdValue)} hours` };
}
