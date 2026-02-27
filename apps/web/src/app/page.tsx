import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <h1 className="text-5xl font-bold tracking-tight">
          Agent<span className="text-primary">Guard</span>
        </h1>
        <p className="max-w-md text-lg text-muted-foreground">
          Observability and control plane for autonomous AI agents on-chain.
        </p>
      </div>
      <div className="flex gap-4">
        <Link
          href="/login"
          className="rounded-lg border border-border px-6 py-3 text-sm font-medium transition-colors hover:bg-card"
        >
          Sign In
        </Link>
        <Link
          href="/register"
          className="rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Get Started
        </Link>
      </div>
    </div>
  );
}
