import Link from 'next/link';

export function PublicHeader() {
  return (
    <nav className="flex items-center justify-between px-6 py-5 md:px-12">
      <Link href="/" className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/chainward-logo.svg" alt="ChainWard" className="h-8 w-8" />
        <span className="text-lg font-semibold tracking-tight text-foreground">Chain<span className="text-accent-foreground">Ward</span></span>
      </Link>
      <div className="flex items-center gap-3">
        <Link
          href="/wallet"
          className="text-sm text-muted-foreground transition-colors hover:text-white"
        >
          Wallet Lookup
        </Link>
        <Link
          href="/login"
          className="rounded-sm bg-primary px-4 py-2 text-sm font-medium text-foreground transition-all hover:bg-primary/90"
        >
          Connect Wallet
        </Link>
      </div>
    </nav>
  );
}
