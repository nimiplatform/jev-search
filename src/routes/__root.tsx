import { HeadContent, Link, Scripts, createRootRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import appCss from '../styles.css?url';

export const Route = createRootRoute({
  head: () => ({
    links: [{ href: appCss, rel: 'stylesheet' }],
    meta: [
      { charSet: 'utf-8' },
      { content: 'width=device-width, initial-scale=1', name: 'viewport' },
      { title: 'last24hours' },
      {
        content:
          'Ask in plain language. We pick the right sources across the web, Hacker News, Reddit, GitHub, X, arXiv, YouTube, Wikipedia, IMDb and WeChat, send the right query, and rank what comes back. No generated answers.',
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
              Search by{' '}
              <a className="underline" href="https://www.search1api.com" rel="noreferrer" target="_blank">
                Search1API
              </a>
              , judgments by{' '}
              <a className="underline" href="https://typesafe.ai" rel="noreferrer" target="_blank">
                TypeSafe
              </a>
              . Queries are sent to both.
            </span>
            <a className="underline" href="https://github.com/fatwang2/last24hours" rel="noreferrer" target="_blank">
              Open source
            </a>
          </div>
        </footer>
        <Scripts />
      </body>
    </html>
  );
}
