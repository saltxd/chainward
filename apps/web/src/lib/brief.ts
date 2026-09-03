import type { BriefContactMethod, BriefOrder } from './api';

export type OrderDeliveryKey =
  | 'awaiting_payment'
  | 'queued'
  | 'in_progress'
  | 'ready'
  | 'delivered'
  | 'failed'
  | 'cancelled';

export interface OrderDeliveryState {
  key: OrderDeliveryKey;
  label: string;
  hint: string;
}

/** What the buyer should understand about an order right now. */
export function orderDeliveryState(order: Pick<BriefOrder, 'status' | 'contactMethod' | 'briefMarkdown'>): OrderDeliveryState {
  switch (order.status) {
    case 'pending':
      return { key: 'awaiting_payment', label: 'awaiting payment', hint: 'Pay to queue the decode.' };
    case 'paid':
      return { key: 'queued', label: 'queued', hint: 'In the queue. Your brief appears here within 48 hours.' };
    case 'fulfilling':
      return { key: 'in_progress', label: 'decoding', hint: 'The investigation is running now.' };
    case 'fulfilled':
      if (order.briefMarkdown) {
        return { key: 'ready', label: 'ready', hint: 'Your brief is below.' };
      }
      return {
        key: 'delivered',
        label: order.contactMethod === 'x' ? 'posted as a thread' : 'delivered',
        hint:
          order.contactMethod === 'x'
            ? 'Published as an @chainwardai thread tagging you.'
            : 'Delivered to your contact.',
      };
    case 'failed':
      return { key: 'failed', label: 'failed', hint: 'Something went wrong on our side. We will re-run it.' };
    default:
      return { key: 'cancelled', label: order.status, hint: '' };
  }
}

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
