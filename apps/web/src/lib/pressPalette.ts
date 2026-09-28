'use client';

import { useSyncExternalStore } from 'react';

/**
 * Press theme colors for places CSS variables can't reach (Recharts writes
 * SVG presentation attributes, where var() doesn't resolve). Mirrors the
 * light and dark token sets in styles/press.css; keep the two in step.
 */
export interface PressPalette {
  ink: string;
  inkSoft: string;
  inkFaint: string;
  paper2: string;
  ruleStrong: string;
}

const LIGHT: PressPalette = {
  ink: '#1b1815',
  inkSoft: '#4a4238',
  inkFaint: '#6b6152',
  paper2: '#e3dccd',
  ruleStrong: '#bcb19b',
};

const DARK: PressPalette = {
  ink: '#e6ddcc',
  inkSoft: '#bdb3a1',
  inkFaint: '#8c8271',
  paper2: '#1f1c16',
  ruleStrong: '#4a4336',
};

const QUERY = '(prefers-color-scheme: dark)';

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

/** The palette for the viewer's system theme; light during server render. */
export function usePressPalette(): PressPalette {
  const dark = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
  return dark ? DARK : LIGHT;
}
