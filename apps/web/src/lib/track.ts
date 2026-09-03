/**
 * Funnel events → Umami. The tracker is injected client-side by
 * components/press/Analytics (same-origin /a proxy), so `window.umami` may be
 * absent: during server render, in dev, for self-hosters, or before the script
 * loads. Every call is a guarded no-op in those cases and can never throw.
 *
 * PRIVACY: payloads carry categories only (band, placement, price). Never send
 * an address, a handle, or anything that identifies the visitor or the subject.
 */

export type TrackEvent =
  | 'check_submit'
  | 'check_result'
  | 'brief_cta_click'
  | 'brief_connect_click'
  | 'brief_signin_ok'
  | 'brief_order_created'
  | 'brief_paid';

export type TrackData = Record<string, string | number | boolean>;

interface UmamiTracker {
  track?: (name: string, data?: TrackData) => void;
}

declare global {
  interface Window {
    umami?: UmamiTracker;
  }
}

export function track(name: TrackEvent, data?: TrackData): void {
  try {
    if (typeof window === 'undefined') return;
    window.umami?.track?.(name, data);
  } catch {
    // Analytics must never surface an error to the visitor.
  }
}
