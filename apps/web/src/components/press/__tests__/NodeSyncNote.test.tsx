import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NodeSyncNote, NodeSyncNoteText } from '../NodeClaim';

describe('NodeSyncNoteText', () => {
  it('says nothing while provenance is unknown or live', () => {
    expect(renderToStaticMarkup(<NodeSyncNoteText status="unknown" lag={null} />)).toBe('');
    expect(renderToStaticMarkup(<NodeSyncNoteText status="live" lag={0} />)).toBe('');
  });

  it('states the resync and the block lag while syncing', () => {
    const html = renderToStaticMarkup(<NodeSyncNoteText status="syncing" lag={444_658} />);
    expect(html).toContain('resyncing');
    expect(html).toContain('444,658 blocks behind');
    expect(html).toContain('public Base RPC');
  });

  it('states the resync without a number when the lag is unknown', () => {
    const html = renderToStaticMarkup(<NodeSyncNoteText status="syncing" lag={null} />);
    expect(html).toContain('resyncing');
    expect(html).not.toContain('blocks behind');
  });

  it('states the fallback when the node is offline', () => {
    const html = renderToStaticMarkup(<NodeSyncNoteText status="offline" lag={null} />);
    expect(html).toContain('offline');
    expect(html).toContain('public Base RPC');
  });
});

describe('NodeSyncNote (server render)', () => {
  it('renders nothing in static HTML', () => {
    expect(renderToStaticMarkup(<NodeSyncNote />)).toBe('');
  });
});
