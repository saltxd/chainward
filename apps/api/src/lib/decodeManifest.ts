import manifest from '../data/decode-manifest.json' with { type: 'json' };

export interface DecodeManifestEntry {
  slug: string;
  title: string;
  subtitle: string;
  date: string;
  url: string;
  addresses: string[];
}

interface DecodeManifest {
  generatedAt: string;
  decodes: DecodeManifestEntry[];
  byAddress: Record<string, string[]>;
}

const typed = manifest as DecodeManifest;
const bySlug = new Map(typed.decodes.map((d) => [d.slug, d]));

export function listDecodes(): DecodeManifestEntry[] {
  return typed.decodes;
}

export function findDecodesForAddress(address: string): DecodeManifestEntry[] {
  const slugs = typed.byAddress[address.toLowerCase()] ?? [];
  return slugs.flatMap((s) => {
    const d = bySlug.get(s);
    return d ? [d] : [];
  });
}
