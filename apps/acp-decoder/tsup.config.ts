import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  sourcemap: true,
  platform: 'node',
  target: 'node22',
  // Bundle the SDK in so we don't need tsx/esm at runtime to handle its
  // extensionless imports. Eliminates the loader hook that breaks Node's
  // pipe-stdio buffering in K8s.
  noExternal: [
    '@chainward/common',
    '@chainward/db',
    '@chainward/decode',
    '@virtuals-protocol/acp-node-v2',
  ],
  // ESM bundles can't use CJS `require` natively, but the SDK's transitive
  // deps (object-inspect, deep-equal, etc.) are CJS modules calling
  // require('util') etc. Inject a createRequire shim so they resolve Node
  // builtins.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
});
