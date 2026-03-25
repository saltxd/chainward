import type { Metadata } from 'next';
import { SnippetsClient } from './snippets-client';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function SnippetsPage() {
  return <SnippetsClient />;
}
