import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { themeScript } from '@/components/theme-toggle';

describe('theme before first paint', () => {
  it.each([
    { stored: null, systemDark: true, dark: true, preference: undefined },
    { stored: null, systemDark: false, dark: false, preference: undefined },
    { stored: 'light', systemDark: true, dark: false, preference: 'light' },
    { stored: 'dark', systemDark: false, dark: true, preference: 'dark' },
    { stored: 'invalid', systemDark: true, dark: true, preference: undefined },
    { stored: 'blocked', systemDark: true, dark: true, preference: undefined },
  ])('resolves $stored with systemDark=$systemDark', ({ stored, systemDark, dark, preference }) => {
    const classes = new Set<string>();
    const root = {
      dataset: {} as Record<string, string>,
      classList: {
        toggle(name: string, enabled: boolean) {
          if (enabled) classes.add(name);
          else classes.delete(name);
        },
      },
    };
    runInNewContext(themeScript, {
      document: { documentElement: root },
      localStorage: {
        getItem(key: string) {
          expect(key).toBe('jev-theme');
          if (stored === 'blocked') throw new Error('Storage unavailable');
          return stored;
        },
      },
      matchMedia(query: string) {
        expect(query).toBe('(prefers-color-scheme: dark)');
        return { matches: systemDark };
      },
    });
    expect(classes.has('dark')).toBe(dark);
    expect(root.dataset.theme).toBe(preference);
  });
});
