import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  // @chainward/decode must be bundled (noExternal) — its package entry is raw
  // TS (src/index.ts), and Node 22 refuses to type-strip .ts under node_modules,
  // so leaving it external crashes the prod image. Matches apps/acp-decoder.
  noExternal: ['@chainward/common', '@chainward/db', '@chainward/decode', '@chainward/observatory'],
});
