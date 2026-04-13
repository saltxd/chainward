'use client';

import { cn } from '@/lib/utils';

interface GlassToggleProps {
  enabled: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}

/**
 * Liquid-glass style toggle.
 *
 * OFF: recessed dark well with subtle highlight — reads as a concave pit
 * ON: green-tinted glass lit from within + outer halo
 * Thumb: pearl-like with radial gradient, specular sparkle, and spring motion
 *
 * Sized for presence (28×52px) so the material qualities actually read.
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
        'group relative h-7 w-[52px] shrink-0 cursor-pointer rounded-full',
        'ring-1 ring-inset',
        'transition-[background-color,box-shadow,color] duration-[450ms] ease-[cubic-bezier(0.34,1.3,0.64,1)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        // OFF — recessed dark well
        !enabled && [
          'bg-black/50',
          'ring-white/[0.06]',
          'shadow-[inset_0_2px_4px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(0,0,0,0.4)]',
        ],
        // ON — green glass, inner light + outer halo
        enabled && [
          'bg-gradient-to-b from-[#4ade80]/60 to-[#22c55e]/25',
          'ring-[#4ade80]/30',
          'shadow-[inset_0_1px_2px_rgba(255,255,255,0.22),inset_0_-1px_2px_rgba(0,0,0,0.3),0_0_18px_rgba(74,222,128,0.45),0_0_36px_rgba(74,222,128,0.15)]',
        ],
        // Focus
        'outline-none focus-visible:ring-2 focus-visible:ring-[#4ade80]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      )}
    >
      {/* Specular highlight — curved surface catches light from top */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden rounded-full"
      >
        <span
          className={cn(
            'absolute inset-x-2 top-0 h-1/2 rounded-full',
            'bg-gradient-to-b from-white/25 to-transparent',
            'transition-opacity duration-500',
            enabled ? 'opacity-75' : 'opacity-25',
          )}
        />
      </span>

      {/* Thumb — glass pearl with dimension */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute top-1/2 h-6 w-6 -translate-y-1/2 rounded-full',
          // Radial gradient: highlight at top-left, body tone, edge darkens
          'bg-[radial-gradient(circle_at_30%_25%,#ffffff_0%,#f3f4f6_55%,#d1d5db_100%)]',
          // Thin rim suggests glass edge
          'ring-1 ring-black/10',
          // Stacked shadows: drop, contact, inner top-highlight, inner bottom-shadow
          'shadow-[0_2px_5px_rgba(0,0,0,0.4),0_1px_2px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.95),inset_0_-0.5px_0.5px_rgba(0,0,0,0.08)]',
          // Spring motion — slight overshoot on arrival
          'transition-transform duration-[450ms] ease-[cubic-bezier(0.34,1.6,0.64,1)]',
          enabled ? 'translate-x-[26px]' : 'translate-x-0.5',
          // Press squish — liquid feel
          'group-active:scale-[0.92]',
        )}
      >
        {/* Specular sparkle — tiny highlight on the pearl */}
        <span
          aria-hidden
          className="absolute left-1 top-0.5 h-[5px] w-[9px] rounded-full bg-white/80 blur-[0.5px]"
        />
      </span>
    </button>
  );
}
