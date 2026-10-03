'use client';

import Link from 'next/link';
import { useSession } from '@/lib/auth-client';

/** Quiet account entry: the signed-in wallet goes to the dashboard, otherwise "Connect Wallet". */
export function MastheadAccount() {
  const { data: session } = useSession();
  const address = session?.user?.walletAddress;
  if (address) {
    const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
    return (
      <Link href="/overview" className="ph-nav-signin" title="Dashboard">
        {short}
      </Link>
    );
  }
  return (
    <Link href="/login" className="ph-nav-signin">
      Connect Wallet
    </Link>
  );
}
