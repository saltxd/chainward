import { describe, expect, it } from 'vitest';
import { contactMethodFor } from '../brief';

describe('contactMethodFor', () => {
  it('routes a public order to the X thread', () => {
    expect(contactMethodFor('public', '@you')).toBe('x');
  });

  it('routes a private order with an email address to email', () => {
    expect(contactMethodFor('private', 'you@example.com')).toBe('email');
  });

  it('routes a private order with a handle to Telegram', () => {
    expect(contactMethodFor('private', '@you')).toBe('telegram');
    expect(contactMethodFor('private', 'you')).toBe('telegram');
  });

  it('does not mistake an @handle for an email', () => {
    expect(contactMethodFor('private', '@you.eth')).toBe('telegram');
  });
});
