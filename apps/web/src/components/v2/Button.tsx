import Link from 'next/link';
import { ReactNode, ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'ghost' | 'link' | 'danger';
type Size = 'md' | 'sm';

interface CommonProps {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  className?: string;
  fullWidth?: boolean;
}

type ButtonAsButton = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'className'> & {
    href?: undefined;
  };

type ButtonAsLink = CommonProps & {
  href: string;
  external?: boolean;
};

export function Button(props: ButtonAsButton | ButtonAsLink) {
  const {
    variant = 'primary',
    size = 'md',
    children,
    className = '',
    fullWidth = false,
  } = props;
  const cls = [
    'v2-btn',
    `v2-btn-${variant}`,
    `v2-btn-size-${size}`,
    fullWidth ? 'v2-btn-full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if ('href' in props && props.href !== undefined) {
    const { href } = props;
    const external = 'external' in props ? props.external : false;
    if (external) {
      return (
        <a href={href} className={cls} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    }
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }

  const {
    variant: _v,
    size: _s,
    children: _c,
    className: _cn,
    fullWidth: _fw,
    ...rest
  } = props as ButtonAsButton;
  return (
    <button className={cls} {...rest}>
      {children}
    </button>
  );
}
