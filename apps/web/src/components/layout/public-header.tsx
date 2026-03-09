import Link from 'next/link';

export function PublicHeader() {
  return (
    <nav className="flex items-center justify-between px-6 py-5 md:px-12">
      <Link href="/" className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/chainward-logo.svg" alt="ChainWard" className="h-8 w-8" />
        <span className="text-lg font-semibold tracking-tight text-white">
          Chain<span className="text-[#4ade80]">Ward</span>
        </span>
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
          className="rounded-md bg-[#1B5E20] px-4 py-2 text-sm font-medium text-white transition-all hover:bg-[#2E7D32] hover:shadow-[0_0_20px_rgba(74,222,128,0.15)]"
        >
          Connect Wallet
        </Link>
      </div>
    </nav>
  );
}
