import { describe, expect, it } from 'vitest';
import { alertEventStatus, deliveryChannelOptions, NO_DESTINATION } from '../alertChannels';

// Telegram asks for a chat ID but nothing says which bot to message, so a new
// user can't set it up. It is not offered for new alerts; an alert that already
// delivers to Telegram keeps the option so editing it doesn't drop the channel.

describe('deliveryChannelOptions', () => {
  it('offers webhook and Discord for a new alert', () => {
    expect(deliveryChannelOptions()).toEqual(['webhook', 'discord']);
    expect(deliveryChannelOptions([])).toEqual(['webhook', 'discord']);
  });

  it('offers webhook and Discord when editing an alert without Telegram', () => {
    expect(deliveryChannelOptions(['discord'])).toEqual(['webhook', 'discord']);
  });

  it('keeps Telegram when editing an alert that already uses it', () => {
    expect(deliveryChannelOptions(['telegram'])).toEqual(['webhook', 'telegram', 'discord']);
    expect(deliveryChannelOptions(['discord', 'telegram'])).toEqual(['webhook', 'telegram', 'discord']);
  });
});

describe('alertEventStatus', () => {
  it('reads an alert with no destination as a setup gap, not a failure', () => {
    expect(alertEventStatus({ delivered: false, deliveryError: NO_DESTINATION }).status).toBe('setup');
  });

  it('reads a real delivery error as a failure, with the error', () => {
    const s = alertEventStatus({ delivered: false, deliveryError: 'discord: 404 Unknown Webhook' });
    expect(s.status).toBe('failed');
    expect(s.label).toContain('404 Unknown Webhook');
  });

  it('reads delivered and not-yet-delivered events as before', () => {
    expect(alertEventStatus({ delivered: true, deliveryError: null }).status).toBe('delivered');
    expect(alertEventStatus({ delivered: true, deliveryError: 'telegram: chat not found' }).status).toBe('delivered');
    expect(alertEventStatus({ delivered: false, deliveryError: null }).status).toBe('pending');
  });
});
