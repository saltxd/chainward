import { ReactNode } from 'react';

interface CodeBlockProps {
  children: ReactNode;
  inline?: boolean;
}

export function CodeBlock({ children, inline = false }: CodeBlockProps) {
  if (inline) {
    return (
      <code className="v2-code-inline">
        {children}
        <style jsx>{`
          .v2-code-inline {
            font-family: var(--font-mono), ui-monospace, monospace;
            font-size: 0.9em;
            color: var(--phosphor);
            background: rgba(61, 216, 141, 0.08);
            padding: 1px 6px;
            border: 1px solid var(--line);
          }
        `}</style>
      </code>
    );
  }
  return (
    <pre className="v2-code-block">
      <code>{children}</code>
      <style jsx>{`
        .v2-code-block {
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 12.5px;
          line-height: 1.7;
          background: var(--bg-1);
          border: 1px solid var(--line);
          padding: 16px 18px;
          overflow-x: auto;
          color: var(--fg);
          margin: 0;
        }
      `}</style>
    </pre>
  );
}
