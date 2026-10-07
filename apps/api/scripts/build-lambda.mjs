// Bundle the three Lambda entry points into self-contained files under lambda-dist/.
// Run after `prisma generate` (the generated client is imported from src/generated).
import { build } from 'esbuild';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

rmSync('lambda-dist', { recursive: true, force: true });
mkdirSync('lambda-dist', { recursive: true });

const entries = { api: 'src/lambda/api.ts', worker: 'src/lambda/worker.ts', scheduled: 'src/lambda/scheduled.ts' };

await build({
  entryPoints: entries,
  outdir: 'lambda-dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outExtension: { '.js': '.mjs' },
  sourcemap: false,
  minify: false,
  // The nodejs22.x runtime already ships the AWS SDK v3 clients; keeping them external keeps the zip small.
  external: ['@aws-sdk/*', 'pg-native'],
  banner: {
    // esbuild's ESM output needs these for the few CommonJS dependencies (pg, mammoth, jszip) that use require/__dirname.
    js: "import { createRequire as __createRequire } from 'node:module'; import { fileURLToPath as __fileURLToPath } from 'node:url'; import { dirname as __dirname_ } from 'node:path'; const require = __createRequire(import.meta.url); const __filename = __fileURLToPath(import.meta.url); const __dirname = __dirname_(__filename);",
  },
  logLevel: 'info',
});

writeFileSync('lambda-dist/package.json', JSON.stringify({ type: 'module' }, null, 2));
console.log('lambda bundles written to lambda-dist/ (api.mjs, worker.mjs, scheduled.mjs)');
