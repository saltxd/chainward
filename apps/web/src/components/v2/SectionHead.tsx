import { ReactNode } from 'react';

interface SectionHeadProps {
  tag: string;
  title: ReactNode;
  lede?: ReactNode;
  align?: 'start' | 'center';
}

export function SectionHead({ tag, title, lede, align = 'start' }: SectionHeadProps) {
  return (
    <div className={`v2-sh-head ${align === 'center' ? 'v2-sh-head-center' : ''}`}>
      <div>
        <div className="v2-sh-tag">{tag}</div>
        <h2 className="v2-sh-title display">{title}</h2>
      </div>
      {lede && <p className="v2-sh-lede">{lede}</p>}
    </div>
  );
}
