/**
 * The column update for a brief order's fulfilment transition, as reported by
 * the ops poller. Pure so the rules are testable:
 *   - fulfilled → stamp fulfilledAt, store the written brief (in-app delivery)
 *   - failed    → record the error, never stamp fulfilment
 *   - ops notes are APPENDED to the buyer's own request notes, never overwrite
 */

export interface FulfillmentInput {
  status: 'fulfilled' | 'failed';
  deliveryRef?: string;
  error?: string;
  briefMarkdown?: string;
  prevNotes: string | null;
}

export interface FulfillmentUpdate {
  status: 'fulfilled' | 'failed';
  fulfilledAt?: Date;
  briefMarkdown?: string;
  notes?: string;
}

export function buildFulfillmentUpdate(input: FulfillmentInput): FulfillmentUpdate {
  const note = input.deliveryRef
    ? `delivered: ${input.deliveryRef}`
    : input.error
      ? `error: ${input.error}`
      : null;
  const brief = input.status === 'fulfilled' ? input.briefMarkdown?.trim() : undefined;
  return {
    status: input.status,
    ...(input.status === 'fulfilled' ? { fulfilledAt: new Date() } : {}),
    ...(brief ? { briefMarkdown: brief } : {}),
    ...(note ? { notes: [input.prevNotes, note].filter(Boolean).join(' | ') } : {}),
  };
}
