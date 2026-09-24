import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Bundles the Desktop-supervised Electron Host: `dist-electron/main.js` (ESM,
 * with the App's host/ and src/lib modules inlined and every package left
 * external) and the Kit preload as `dist-electron/preload.cjs`. A production
 * bundle rejects the development renderer URL argument.
 */
export async function buildElectron({ production }) {
  await build({
    entryPoints: [path.join(appRoot, 'src-electron/main.ts')],
    outfile: path.join(appRoot, 'dist-electron/main.js'),
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'esm',
    packages: 'external',
    external: ['electron'],
    define: { __NIMI_ELECTRON_PRODUCTION__: production ? 'true' : 'false' },
    logLevel: 'warning',
  });
  await build({
    entryPoints: [path.join(appRoot, 'src-electron/preload.cts')],
    outfile: path.join(appRoot, 'dist-electron/preload.cjs'),
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'cjs',
    external: ['electron'],
    logLevel: 'warning',
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await buildElectron({ production: process.argv.includes('--production') });
}
