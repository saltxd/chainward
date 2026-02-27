'use client';

import { signOut } from '@/lib/auth-client';
import { useRouter } from 'next/navigation';

export function Header() {
  const router = useRouter();

  async function handleSignOut() {
    await signOut();
    router.push('/login');
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-border px-6">
      <div />
      <button
        onClick={handleSignOut}
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        Sign Out
      </button>
    </header>
  );
}
