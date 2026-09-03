import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProvenanceLine } from '../_components';

describe('ProvenanceLine', () => {
  it('renders nothing for reports filed before provenance was recorded', () => {
    expect(renderToStaticMarkup(<ProvenanceLine provenance={undefined} />)).toBe('');
  });

  it('credits our own node when the decode read from it', () => {
    const html = renderToStaticMarkup(
      <ProvenanceLine provenance={{ data_source: 'sentinel', head_lag_seconds: 4 }} />,
    );
    expect(html).toContain('own Base node');
    expect(html).toContain('4s behind head');
    expect(html).not.toContain('public');
  });

  it('names the public RPC fallback when the decode did not use our node', () => {
    const html = renderToStaticMarkup(
      <ProvenanceLine provenance={{ data_source: 'fallback', head_lag_seconds: 2 }} />,
    );
    expect(html).toContain('public Base RPC');
    expect(html).not.toContain('own Base node');
  });
});
