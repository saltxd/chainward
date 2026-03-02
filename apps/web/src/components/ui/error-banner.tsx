interface ErrorBannerProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorBanner({ message, onRetry }: ErrorBannerProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-destructive">
        <span>✕</span>
        <span>{message}</span>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded px-3 py-1 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20"
        >
          Retry
        </button>
      )}
    </div>
  );
}
