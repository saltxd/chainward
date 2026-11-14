import {
  DECODES_DESCRIPTION,
  DECODES_FEED_URL,
  DECODES_URL,
  decodeUrl,
  searchDescription,
  type DecodeMeta,
} from './decodes';

const XML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

function xmlEscape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => XML_ENTITIES[c] ?? c);
}

function feedItem(meta: DecodeMeta): string {
  const url = xmlEscape(decodeUrl(meta.slug));
  return [
    '    <item>',
    `      <title>${xmlEscape(meta.title)}</title>`,
    `      <link>${url}</link>`,
    `      <guid isPermaLink="true">${url}</guid>`,
    `      <pubDate>${new Date(meta.date).toUTCString()}</pubDate>`,
    `      <description>${xmlEscape(searchDescription(meta))}</description>`,
    '    </item>',
  ].join('\n');
}

/** RSS 2.0 for the published decodes, in the order given (newest first from the loader). */
export function buildDecodesFeed(decodes: DecodeMeta[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    '    <title>ChainWard Decodes</title>',
    `    <link>${DECODES_URL}</link>`,
    `    <description>${xmlEscape(DECODES_DESCRIPTION)}</description>`,
    '    <language>en</language>',
    `    <atom:link href="${DECODES_FEED_URL}" rel="self" type="application/rss+xml"/>`,
    ...decodes.map(feedItem),
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}
