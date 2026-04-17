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
      <style jsx>{`
        .v2-tbl {
          border: 1px solid var(--line);
          background: var(--bg-1);
          font-family: var(--font-mono), ui-monospace, monospace;
          font-size: 13px;
        }
        .v2-tbl-header {
          display: grid;
          padding: 12px 20px;
          border-bottom: 1px solid var(--line);
          color: var(--muted);
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }
        .v2-tbl-row {
          display: grid;
          padding: 14px 20px;
          align-items: center;
          border-top: 1px solid var(--line);
          transition: background 0.15s;
          color: inherit;
          text-decoration: none;
        }
        .v2-tbl-row:hover {
          background: rgba(61, 216, 141, 0.03);
        }
        .v2-tbl-row-link {
          cursor: pointer;
        }
        .v2-tbl-empty {
          padding: 40px 20px;
          text-align: center;
          color: var(--muted);
          font-style: italic;
          font-size: 13px;
        }
      `}</style>
    </div>
  );
}
