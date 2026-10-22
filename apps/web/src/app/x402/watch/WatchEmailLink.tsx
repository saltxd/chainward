'use client';

import type { ReactNode } from 'react';
import { track } from '@/lib/track';

export const WATCH_CONTACT = 'hello@chainward.ai';

// A fixed subject, so a seller's email is easy to find in the inbox.
const SUBJECT = 'x402 endpoint watch';
const BODY = 'Host, or /.well-known/x402 or openapi.json URL:\n';

export const WATCH_MAILTO = `mailto:${WATCH_CONTACT}?subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(BODY)}`;

/**
 * The post that sent the visitor, from `?ref=` (x-1027, sx-1028, hn). Only short
 * campaign tags pass: anything else is dropped, never echoed into analytics.
 */
export function campaignRef(search: string): string | null {
  const ref = new URLSearchParams(search).get('ref');
  return ref && /^[a-z0-9][a-z0-9_-]{0,31}$/i.test(ref) ? ref.toLowerCase() : null;
}

/** The watch page's email CTA; each click is counted with its placement and the post that sent the visitor. */
export function WatchEmailLink({
  placement,
  className,
  children,
}: {
  placement: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={WATCH_MAILTO}
      className={className}
      onClick={() => {
        const ref = typeof window === 'undefined' ? null : campaignRef(window.location.search);
        track('watch_cta_click', ref ? { placement, ref } : { placement });
      }}
    >
      {children}
    </a>
  );
}
