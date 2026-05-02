import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
  noExternal: ['@chainward/common', '@chainward/db', '@chainward/decode'],
});
