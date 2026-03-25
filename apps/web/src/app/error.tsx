'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="rounded-full bg-red-500/10 p-4">
        <svg className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
        </svg>
      </div>
      <div>
        <h2 className="text-lg font-semibold text-white">Something went wrong</h2>
        <p className="mt-1 text-sm text-[#71717a]">
          {error.message || 'An unexpected error occurred.'}
        </p>
      </div>
      <button
        onClick={reset}
        className="rounded-md bg-[#1B5E20] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2E7D32]"
      >
        Try again
      </button>
    </div>
  );
}
