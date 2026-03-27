import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="rounded-full bg-accent-foreground/10 p-4">
        <span className="text-3xl font-bold text-accent-foreground">404</span>
      </div>
      <div>
        <h2 className="text-lg font-semibold text-white">Page not found</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
      </div>
      <Link
        href="/"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Back to home
      </Link>
    </div>
  );
}
