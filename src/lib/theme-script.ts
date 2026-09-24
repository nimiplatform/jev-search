export const THEME_SURFACE = { light: '#fffafd', dark: '#191619' } as const;

/**
 * Runs before the page paints (vite.config.ts inlines it into index.html).
 * Keeps the preference on <html> even when storage is blocked.
 */
export const themeScript = `(() => {
  const root = document.documentElement;
  let theme;
  try { theme = localStorage.getItem('jev-theme'); } catch {}
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  const dark = theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  root.classList.toggle('dark', dark);
  const meta = document.querySelector && document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '${THEME_SURFACE.dark}' : '${THEME_SURFACE.light}');
})();`;
