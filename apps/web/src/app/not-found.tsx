import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="rounded-full bg-[#4ade80]/10 p-4">
        <span className="text-3xl font-bold text-[#4ade80]">404</span>
      </div>
      <div>
        <h2 className="text-lg font-semibold text-white">Page not found</h2>
        <p className="mt-1 text-sm text-[#71717a]">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
      </div>
      <Link
        href="/"
        className="rounded-md bg-[#1B5E20] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2E7D32]"
      >
        Back to home
      </Link>
    </div>
  );
}
