import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import RugCheckPage, { metadata } from '../page';

// /rugcheck: paste a Base token, get the rug check, free for people. The page says what
// the check reads and what it does not, sends bots to the paid check, and never calls a
// token "safe".
describe('/rugcheck', () => {
  const html = renderToStaticMarkup(<RugCheckPage />);
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

  it('asks for a Base token and runs the rug check', () => {
    expect(text).toContain('Rug check for Base tokens');
    expect(text).toContain('Subject: Base token address');
    expect(text).toContain('Run the rug check →');
  });

  it('says what the check reads', () => {
    expect(text).toMatch(/who launched it/i);
    expect(text).toMatch(/within the hour/);
    expect(text).toMatch(/Clanker/);
  });

  it('says what it does not do', () => {
    expect(text).toMatch(/honeypot/);
    expect(text).toMatch(/not a guarantee/);
  });

  it('sends bots and apps to the paid check', () => {
    expect(text).toContain('https://api.chainward.ai/api/risk/rugcheck?address=');
    expect(text).toContain('$0.02');
    expect(html).toContain('href="/docs"');
  });

  it('owns its canonical URL', () => {
    expect(metadata.alternates.canonical).toBe('https://chainward.ai/rugcheck');
  });

  // The page's own words; the site chrome around it (dateline, masthead) is shared.
  it('never says safe, and uses no em dashes', () => {
    const article = html.slice(html.indexOf('<article'), html.indexOf('</article>'));
    expect(text).not.toMatch(/\bsafe\b/i);
    expect(article).not.toContain('—');
  });
});
