'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { track } from '@/lib/track';

/** Every path into the paid brief goes through this link so the click is counted
 * with its placement (landing line, report document, decode footer…). */
export function BriefCtaLink({
  placement,
  className,
  children,
}: {
  placement: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href="/request-brief"
      className={className}
      onClick={() => track('brief_cta_click', { placement })}
    >
      {children}
    </Link>
  );
}
