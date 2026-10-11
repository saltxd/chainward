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
