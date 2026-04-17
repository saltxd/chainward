import { ReactNode } from 'react';

type Tone = 'neutral' | 'phosphor' | 'amber' | 'danger' | 'cyan';

interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
}

export function Badge({ tone = 'neutral', children }: BadgeProps) {
  return <span className={`v2-badge v2-badge-${tone}`}>{children}</span>;
}
