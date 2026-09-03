import type { BriefContactMethod } from './api';

/** How the buyer wants the brief delivered. Private is the default. */
export type BriefDelivery = 'private' | 'public';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Map the checkout's delivery choice + contact string onto the API's contact
 * method. Public → X thread. Private → email when the contact is an email
 * address, otherwise a Telegram handle.
 */
export function contactMethodFor(delivery: BriefDelivery, contact: string): BriefContactMethod {
  if (delivery === 'public') return 'x';
  return EMAIL_RE.test(contact.trim()) ? 'email' : 'telegram';
}
