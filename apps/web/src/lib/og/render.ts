import type { ReactElement } from 'react';
import { ImageResponse } from '@vercel/og';
import { loadOgFonts } from './fonts';

/**
 * A card as a PNG response, with the share-card fonts loaded.
 *
 * The header key must be lowercase: ImageResponse spreads our headers over its
 * own 'cache-control' (a year, immutable), and a 'Cache-Control' key lands
 * beside it, so both values were joined into one contradictory header.
 */
export async function cardResponse(
  element: ReactElement,
  size: { width: number; height: number },
  cacheControl?: string,
): Promise<ImageResponse> {
  const fonts = await loadOgFonts();
  return new ImageResponse(element, {
    ...size,
    fonts,
    ...(cacheControl ? { headers: { 'cache-control': cacheControl } } : {}),
  });
}
