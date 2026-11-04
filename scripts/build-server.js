import { build } from 'esbuild';

await build({
  entryPoints: ['server/index.js'],
  outfile: 'build/server.mjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  // ws works without its optional native accelerators; do not ship host binaries.
  external: ['bufferutil', 'utf-8-validate'],
  banner: { js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);' },
  legalComments: 'eof',
});
