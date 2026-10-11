import { notFound, permanentRedirect } from 'next/navigation';
import { legacyAgentRedirect } from '@/lib/observatory';

// The old client-only agent status page is retired: the report page covers the
// same wallet with data in the HTML. /agent/<wallet>[?chain=] → /report/<wallet>[?chain=].
export default async function LegacyAgentPage({
  params,
  searchParams,
}: {
  params: Promise<{ wallet: string }>;
  searchParams: Promise<{ chain?: string | string[] }>;
}) {
  const { wallet } = await params;
  const target = legacyAgentRedirect(wallet, (await searchParams).chain);
  if (!target) notFound();
  permanentRedirect(target);
}
