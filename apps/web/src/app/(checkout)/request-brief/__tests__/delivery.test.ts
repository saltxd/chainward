import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// The checkout needs wallet providers to render, so this reads its source. Briefs are
// delivered privately only: the public @chainwardai thread option would post from the
// brand account with no review.
const page = readFileSync(fileURLToPath(new URL('../page.tsx', import.meta.url)), 'utf8');

describe('request-brief delivery', () => {
  // Orders placed before this change with public delivery keep their own confirmation.
  it('offers no public delivery option', () => {
    expect(page).not.toContain('value="public"');
    expect(page).not.toMatch(/or as a public (@chainwardai )?thread/);
  });

  it('still asks where to send the brief privately', () => {
    expect(page).toContain('Your Telegram handle or email');
  });
});
