/**
 * The bound values in a Drizzle condition (eq, and, isNull ...), so a fake
 * database can tell which rows a WHERE clause picks without running SQL.
 */
export function sqlParams(condition: unknown): unknown[] {
  const out: unknown[] = [];
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (node.constructor?.name === 'Param') {
      out.push((node as { value: unknown }).value);
      return;
    }
    if ('queryChunks' in node) visit((node as { queryChunks: unknown[] }).queryChunks);
  };
  visit(condition);
  return out;
}
