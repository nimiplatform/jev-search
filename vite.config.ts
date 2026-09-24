import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { themeScript } from './src/lib/theme-script';

/** Sets the colour scheme before the first paint, from the same script the tests run. */
function themeBeforePaint(): Plugin {
  return {
    name: 'jev-search:theme-before-paint',
    transformIndexHtml: () => [{ tag: 'script', children: themeScript, injectTo: 'head' }],
  };
}

export default defineConfig({
  // The packaged Host loads dist/index.html from a file URL, so asset URLs stay relative.
  base: './',
  plugins: [
    // Generates src/routeTree.gen.ts from src/routes (see tsr.config.json).
    tanstackRouter({ target: 'react' }),
    viteReact(),
    tailwindcss(),
    themeBeforePaint(),
  ],
  resolve: { tsconfigPaths: true },
});
