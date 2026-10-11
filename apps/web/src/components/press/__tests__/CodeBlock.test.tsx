import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CodeBlock, copyText } from '../CodeBlock';

const curl = `curl -X POST https://api.chainward.ai/api/risk/check \\
  -H 'Content-Type: application/json' \\
  -d '{"target":"0x4baadba26c3c0bdef9e8faf173925d463aa53bb2","chain":"base"}'`;

describe('CodeBlock (server render)', () => {
  const html = renderToStaticMarkup(<CodeBlock>{curl}</CodeBlock>);

  it('shows the code exactly, inside one pre/code block', () => {
    const escaped = curl.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
    expect(html).toContain(`<code>${escaped}</code>`);
    expect(html.match(/<pre/g)).toHaveLength(1);
  });

  it('has a real, labelled Copy button that does not submit forms', () => {
    expect(html).toMatch(/<button[^>]*type="button"/);
    expect(html).toMatch(/<button[^>]*aria-label="Copy code"/);
    expect(html).toMatch(/>Copy<\/button>/);
  });

  it('lets keyboard users scroll long lines inside the block', () => {
    expect(html).toMatch(/<pre[^>]*class="press-code-pre"/);
    expect(html).toMatch(/<pre[^>]*tabindex="0"/);
  });

  it('announces the copy result to screen readers', () => {
    expect(html).toMatch(/role="status"/);
    expect(html).toMatch(/aria-live="polite"/);
  });
});

describe('copyText', () => {
  it('writes exactly the block text with the Clipboard API', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const selectAndCopy = vi.fn();
    await expect(copyText(curl, { clipboard: { writeText }, selectAndCopy })).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith(curl);
    expect(selectAndCopy).not.toHaveBeenCalled();
  });

  it('falls back to selecting the text when the Clipboard API is missing', async () => {
    const selectAndCopy = vi.fn().mockReturnValue('selected');
    await expect(copyText(curl, { clipboard: undefined, selectAndCopy })).resolves.toBe('selected');
    expect(selectAndCopy).toHaveBeenCalledOnce();
  });

  it('falls back when the browser refuses the clipboard write', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('NotAllowedError'));
    const selectAndCopy = vi.fn().mockReturnValue('copied');
    await expect(copyText(curl, { clipboard: { writeText }, selectAndCopy })).resolves.toBe('copied');
  });

  it('reports failure instead of throwing when nothing works', async () => {
    const selectAndCopy = vi.fn(() => {
      throw new Error('no selection API');
    });
    await expect(copyText(curl, { clipboard: undefined, selectAndCopy })).resolves.toBe('failed');
  });
});
