import { ReactNode } from 'react';

interface CodeBlockProps {
  children: ReactNode;
  inline?: boolean;
}

export function CodeBlock({ children, inline = false }: CodeBlockProps) {
  if (inline) {
    return <code className="v2-code-inline">{children}</code>;
  }
  return (
    <pre className="v2-code-block">
      <code>{children}</code>
    </pre>
  );
}
