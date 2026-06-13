import { redirect } from 'next/navigation';

// The wallet-lookup result view is superseded by the Risk-Check report page.
// Redirect /wallet/:address → /report/:address (canonical, lowercased).
export default async function WalletAddressRedirect({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  redirect(`/report/${address.toLowerCase()}`);
}
