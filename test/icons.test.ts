import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function pngSize(path: string) {
  const buf = readFileSync(path);
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

describe('app icons', () => {
  it.each([
    ['public/favicon.png', 400],
    ['public/apple-touch-icon.png', 400],
    ['public/icon-192.png', 192],
    ['public/icon-512.png', 512],
    ['public/icon-maskable-512.png', 512],
  ] as const)('%s is %d px', (path, size) => {
    expect(pngSize(path)).toEqual({ width: size, height: size });
  });
});

describe('desktop page', () => {
  const html = readFileSync('index.html', 'utf8');

  it('mounts the app and registers no service worker', () => {
    expect(html).toContain('<div id="app"');
    expect(html).toContain('src="/src/main.tsx"');
    expect(html).not.toContain('serviceWorker');
    expect(html).not.toContain('manifest');
    expect(html).not.toContain('cloudflareinsights');
  });
});
