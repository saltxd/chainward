'use client';

import { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: ReactNode;
  align?: 'left' | 'right' | 'center';
  render: (row: T, index: number) => ReactNode;
  accent?: boolean;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  empty?: ReactNode;
  rowHref?: (row: T) => string | undefined;
  onRowClick?: (row: T, index: number) => void;
}

export function DataTable<T>({
  columns,
  rows,
  empty,
  rowHref,
  onRowClick,
}: DataTableProps<T>) {
  const grid = columns.map((c) => c.width ?? '1fr').join(' ');
  return (
    <div className="v2-tbl">
      <div className="v2-tbl-header" style={{ gridTemplateColumns: grid }}>
        {columns.map((c) => (
          <div key={c.key} style={{ textAlign: c.align ?? 'left' }}>
            {c.header}
          </div>
        ))}
      </div>
      {rows.length === 0 && (
        <div className="v2-tbl-empty">{empty ?? 'No data yet.'}</div>
      )}
      {rows.map((row, i) => {
        const href = rowHref?.(row);
        const content = columns.map((c) => (
          <div
            key={c.key}
            style={{
              textAlign: c.align ?? 'left',
              color: c.accent ? 'var(--phosphor)' : 'var(--fg)',
            }}
          >
            {c.render(row, i)}
          </div>
        ));
        if (href) {
          return (
            <a
              key={i}
              href={href}
              className="v2-tbl-row v2-tbl-row-link"
              style={{ gridTemplateColumns: grid }}
            >
              {content}
            </a>
          );
        }
        if (onRowClick) {
          return (
            <div
              key={i}
              className="v2-tbl-row v2-tbl-row-link"
              role="button"
              tabIndex={0}
              onClick={() => onRowClick(row, i)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onRowClick(row, i);
                }
              }}
              style={{ gridTemplateColumns: grid }}
            >
              {content}
            </div>
          );
        }
        return (
          <div
            key={i}
            className="v2-tbl-row"
            style={{ gridTemplateColumns: grid }}
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}
