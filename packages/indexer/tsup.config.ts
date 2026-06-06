import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/scout/index.ts', 'src/reconcile/index.ts'],
  format: ['esm'],
  dts: true,
  noExternal: ['@chainward/common', '@chainward/db', '@chainward/observatory'],
});
