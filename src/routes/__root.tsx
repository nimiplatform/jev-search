import { HeadContent, Link, Scripts, createRootRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import appCss from '../styles.css?url';

export const Route = createRootRoute({
  head: () => ({
    links: [
      { href: appCss, rel: 'stylesheet' },
      { href: '/favicon.svg', rel: 'icon', type: 'image/svg+xml' },
      { href: '/favicon.ico', rel: 'icon', sizes: '32x32' },
      { href: '/apple-touch-icon.png', rel: 'apple-touch-icon' },
    ],
    meta: [
      { charSet: 'utf-8' },
      { content: 'width=device-width, initial-scale=1', name: 'viewport' },
      { title: 's1 ask' },
      {
        content:
          "Ask the web, ranked by Jev. TypeSafe's Jev reads your question, picks where to look across ten engines, and puts the results that answer you first. No generated answers.",
        name: 'description',
      },
    ],
  }),
  notFoundComponent: NotFound,
  shellComponent: RootDocument,
});

function NotFound() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-24 text-center">
      <h1 className="text-2xl font-semibold">Nothing here</h1>
      <p className="mt-2 text-muted-foreground">That page does not exist.</p>
      <Link className="mt-6 inline-block text-link underline" to="/">
        Back to search
      </Link>
    </main>
  );
}

function RootDocument({ children }: { readonly children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-dvh flex flex-col">
        <div className="flex-1">{children}</div>
        <footer className="border-t px-4 py-4 text-xs text-muted-foreground">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2">
            <span>
              Understanding and ranking by{' '}
              <a className="underline" href="https://typesafe.ai" rel="noreferrer" target="_blank">
                TypeSafe's Jev
              </a>
              . Sources via{' '}
              <a className="underline" href="https://www.search1api.com" rel="noreferrer" target="_blank">
                Search1API
              </a>
              . Your query is sent to both.
            </span>
          </div>
        </footer>
        <Scripts />
      </body>
    </html>
  );
}
