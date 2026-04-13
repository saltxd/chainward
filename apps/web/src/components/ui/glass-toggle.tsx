'use client';

import { cn } from '@/lib/utils';

interface GlassToggleProps {
  enabled: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}

/**
 * Clean switch. Quiet depth — no halo, no sparkle, no drama.
 * Brand green is present, not loud. Works in a list of many.
 */
export function GlassToggle({
  enabled,
  onChange,
  label,
  disabled,
}: GlassToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      onClick={onChange}
      disabled={disabled}
      className={cn(
        'group relative h-[22px] w-[38px] shrink-0 cursor-pointer rounded-full',
        'ring-1 ring-inset ring-white/[0.06]',
        'transition-colors duration-200 ease-out',
        'disabled:cursor-not-allowed disabled:opacity-50',
        // Subtle recessed feel — one shadow, not ten
        'shadow-[inset_0_1px_1px_rgba(0,0,0,0.35)]',
        // OFF: muted
        !enabled && 'bg-white/[0.06]',
        // ON: brand color, solid. No gradient, no glow.
        enabled && 'bg-[#4ade80]/80 ring-[#4ade80]/20',
        // Focus
        'outline-none focus-visible:ring-2 focus-visible:ring-[#4ade80]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute top-0.5 left-0.5 h-[18px] w-[18px] rounded-full bg-white',
          'shadow-[0_1px_2px_rgba(0,0,0,0.3)]',
          'transition-transform duration-200 ease-out',
          enabled && 'translate-x-[16px]',
          'group-active:scale-95',
        )}
      />
    </button>
  );
}
