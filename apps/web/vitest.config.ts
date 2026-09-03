import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Pure-logic + server-render tests only (node env, no DOM). Component tests
// render with react-dom/server so the static/SSR default is what gets asserted.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/__tests__/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
