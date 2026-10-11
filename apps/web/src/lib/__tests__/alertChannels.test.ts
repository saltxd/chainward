import { describe, expect, it } from 'vitest';
import { deliveryChannelOptions } from '../alertChannels';

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
