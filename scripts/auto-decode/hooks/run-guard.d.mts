// Types for run-guard.mjs, which stays plain JS so the launcher's node runs it directly.
export declare function decide(
  input: unknown,
  allowedHosts: readonly string[],
): { block: false } | { block: true; reason: string };
