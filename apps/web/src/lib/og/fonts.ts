import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The share cards' type: Newsreader (display cut for headlines, text cut for
 * reasons) and JetBrains Mono for labels and addresses, the same faces as the
 * public pages. Static TTF instances live in apps/web/assets/og-fonts (OFL,
 * license in each file's name table); satori can't read woff2 or variable fonts.
 *
 * Paths are literal joins on process.cwd() (apps/web in dev, in the standalone
 * server and in the render script) so Next's file tracing copies the files into
 * the standalone build.
 */

export const OG_FONT = {
  display: 'Newsreader Display',
  text: 'Newsreader',
  mono: 'JetBrains Mono',
} as const;

export interface OgFont {
  name: string;
  data: Buffer;
  weight: 400 | 500 | 700;
  style: 'normal' | 'italic';
}

async function readFonts(): Promise<OgFont[]> {
  const [display, displayItalic, text, mono, monoBold] = await Promise.all([
    readFile(join(process.cwd(), 'assets', 'og-fonts', 'Newsreader-DisplayMedium.ttf')),
    readFile(join(process.cwd(), 'assets', 'og-fonts', 'Newsreader-DisplayMediumItalic.ttf')),
    readFile(join(process.cwd(), 'assets', 'og-fonts', 'Newsreader-Text.ttf')),
    readFile(join(process.cwd(), 'assets', 'og-fonts', 'JetBrainsMono-Medium.ttf')),
    readFile(join(process.cwd(), 'assets', 'og-fonts', 'JetBrainsMono-Bold.ttf')),
  ]);
  return [
    { name: OG_FONT.display, data: display, weight: 500, style: 'normal' },
    { name: OG_FONT.display, data: displayItalic, weight: 500, style: 'italic' },
    { name: OG_FONT.text, data: text, weight: 400, style: 'normal' },
    { name: OG_FONT.mono, data: mono, weight: 500, style: 'normal' },
    { name: OG_FONT.mono, data: monoBold, weight: 700, style: 'normal' },
  ];
}

let cached: Promise<OgFont[]> | null = null;

/**
 * Read once per process. If the files are missing the cards still render, in
 * satori's built-in sans, rather than failing the image.
 */
export function loadOgFonts(): Promise<OgFont[]> {
  cached ??= readFonts().catch((err: unknown) => {
    console.warn('[og] share-card fonts unavailable, using the fallback face:', err);
    cached = null;
    return [];
  });
  return cached;
}
