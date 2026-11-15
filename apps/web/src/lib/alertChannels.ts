/**
 * Delivery channels the alert forms offer. Telegram is left out for new alerts:
 * the form asks for a chat ID but nothing tells a new user which bot to message.
 * An alert that already delivers to Telegram keeps the option, so editing it
 * doesn't silently drop the channel. The API and delivery still support it.
 */

export type DeliveryChannel = 'webhook' | 'telegram' | 'discord';

export function deliveryChannelOptions(existing: readonly string[] = []): DeliveryChannel[] {
  return existing.includes('telegram') ? ['webhook', 'telegram', 'discord'] : ['webhook', 'discord'];
}

/** The indexer's delivery outcome when no listed channel had a destination (alertDelivery.ts). */
export const NO_DESTINATION = 'no destination configured';

export type AlertEventStatus = 'delivered' | 'failed' | 'setup' | 'pending';

/**
 * How an alert event's delivery reads in the history. An alert with no
 * destination is a setup gap (amber), not a failed send (red).
 */
export function alertEventStatus(event: {
  delivered: boolean;
  deliveryError: string | null;
}): { status: AlertEventStatus; label: string } {
  if (event.delivered) return { status: 'delivered', label: 'Delivered' };
  if (event.deliveryError === NO_DESTINATION) {
    return { status: 'setup', label: 'Not sent: this alert has no destination set up' };
  }
  if (event.deliveryError) return { status: 'failed', label: `Delivery failed: ${event.deliveryError}` };
  return { status: 'pending', label: 'Delivery pending' };
}
