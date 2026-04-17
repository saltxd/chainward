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
  const styles = (
    <style jsx>{`
      .v2-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-family: var(--font-mono), ui-monospace, monospace;
        font-weight: 600;
        letter-spacing: 0.02em;
        text-decoration: none;
        transition: all 0.15s;
        cursor: pointer;
        border: none;
        white-space: nowrap;
      }
      .v2-btn-size-md {
        padding: 13px 20px;
        font-size: 13px;
      }
      .v2-btn-size-sm {
        padding: 7px 14px;
        font-size: 12px;
      }
      .v2-btn-full {
        width: 100%;
        justify-content: center;
      }
      .v2-btn-primary {
        background: var(--phosphor);
        color: var(--bg);
      }
      .v2-btn-primary:hover {
        box-shadow: 0 0 32px rgba(61, 216, 141, 0.35);
        transform: translateY(-1px);
      }
      .v2-btn-primary:disabled {
        background: var(--muted);
        color: var(--fg-dim);
        cursor: not-allowed;
        transform: none;
        box-shadow: none;
      }
      .v2-btn-ghost {
        background: transparent;
        color: var(--fg);
        border: 1px solid var(--line-2);
      }
      .v2-btn-ghost:hover {
        border-color: var(--phosphor);
        color: var(--phosphor);
      }
      .v2-btn-link {
        padding: 0 !important;
        background: transparent;
        color: var(--phosphor);
      }
      .v2-btn-link:hover {
        color: var(--fg);
      }
      .v2-btn-danger {
        background: transparent;
        color: var(--danger);
        border: 1px solid rgba(230, 103, 103, 0.3);
      }
      .v2-btn-danger:hover {
        background: rgba(230, 103, 103, 0.08);
        border-color: var(--danger);
      }
    `}</style>
  );

  if ('href' in props && props.href !== undefined) {
    const { href } = props;
    const external = 'external' in props ? props.external : false;
    if (external) {
      return (
        <a
          href={href}
          className={cls}
          target="_blank"
          rel="noopener noreferrer"
        >
          {children}
          {styles}
        </a>
      );
    }
    return (
      <Link href={href} className={cls}>
        {children}
        {styles}
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
      {styles}
    </button>
  );
}
