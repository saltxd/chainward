'use client';

import { useEffect } from 'react';

const SCRIPT_ID = 'cw-umami-tracker';

/**
 * First-party analytics loader. The public pages are statically prerendered,
 * so a server-rendered <Script> can never see runtime env — the website id
 * must arrive via a request. On mount this fetches /a/meta (a force-dynamic
 * route handler that reads pod env per request) and, when analytics is
 * configured, injects the Umami tracker into <head>, pointed at the
 * same-origin /a proxy.
 *
 * - 204 from /a/meta (dev, self-hosters, missing env) → no-op.
 * - Renders nothing; pages stay fully static.
 * - Double-inject guarded by element id: the root layout mounts this once,
 *   but client-side navigations / strict-mode double effects are handled.
 */
export function Analytics() {
  useEffect(() => {
    if (document.getElementById(SCRIPT_ID)) return;

    let cancelled = false;

    fetch('/a/meta')
      .then((res) => (res.ok && res.status === 200 ? res.json() : null))
      .then((meta: { websiteId?: string } | null) => {
        if (cancelled || !meta?.websiteId) return;
        if (document.getElementById(SCRIPT_ID)) return; // re-check post-await

        const script = document.createElement('script');
        script.id = SCRIPT_ID;
        script.src = '/a/script.js';
        script.defer = true;
        script.setAttribute('data-website-id', meta.websiteId);
        script.setAttribute('data-host-url', '/a');
        document.head.appendChild(script);
      })
      .catch(() => {
        // Analytics must never surface an error to the visitor.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
