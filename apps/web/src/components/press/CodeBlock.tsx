'use client';

import { useEffect, useRef, useState } from 'react';

export type CopyOutcome = 'copied' | 'selected' | 'failed';

export interface CopyEnv {
  /** navigator.clipboard, when the browser exposes it (it doesn't on plain http or in some frames). */
  clipboard?: { writeText(text: string): Promise<void> };
  /** Select the block's text and try the legacy copy command; 'selected' when only the selection worked. */
  selectAndCopy: () => CopyOutcome;
}

/** Copy `text`, falling back to selecting it so the reader can copy by hand. Never throws. */
export async function copyText(text: string, env: CopyEnv): Promise<CopyOutcome> {
  if (env.clipboard) {
    try {
      await env.clipboard.writeText(text);
      return 'copied';
    } catch {
      // Permission refused or not focused: fall through to the selection fallback.
    }
  }
  try {
    return env.selectAndCopy();
  } catch {
    return 'failed';
  }
}

function selectAndCopy(el: HTMLElement | null): CopyOutcome {
  const selection = window.getSelection();
  if (!el || !selection) return 'failed';
  selection.selectAllChildren(el);
  try {
    return document.execCommand('copy') ? 'copied' : 'selected';
  } catch {
    return 'selected';
  }
}

const LABEL: Record<CopyOutcome | 'idle', string> = {
  idle: 'Copy',
  copied: 'Copied',
  selected: 'Selected',
  failed: "Can't copy",
};

const ANNOUNCE: Record<CopyOutcome | 'idle', string> = {
  idle: '',
  copied: 'Copied to clipboard.',
  selected: 'Copying is blocked here. The code is selected: press Ctrl+C or Cmd+C.',
  failed: 'Copying is blocked here. Select the code and copy it by hand.',
};

/** A code block with a Copy button. Long lines scroll inside the block, never the page. */
export function CodeBlock({ children }: { children: string }) {
  const codeRef = useRef<HTMLElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [state, setState] = useState<CopyOutcome | 'idle'>('idle');

  useEffect(() => () => clearTimeout(timer.current), []);

  const onCopy = async () => {
    const outcome = await copyText(children, {
      clipboard: typeof navigator !== 'undefined' ? navigator.clipboard : undefined,
      selectAndCopy: () => selectAndCopy(codeRef.current),
    });
    setState(outcome);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), outcome === 'copied' ? 1600 : 4000);
  };

  return (
    <div className="press-code">
      <pre className="press-code-pre" tabIndex={0}>
        <code ref={codeRef}>{children}</code>
      </pre>
      <button type="button" className="press-code-copy" aria-label="Copy code" onClick={onCopy}>
        {LABEL[state]}
      </button>
      <span className="press-code-status" role="status" aria-live="polite">
        {ANNOUNCE[state]}
      </span>
    </div>
  );
}
