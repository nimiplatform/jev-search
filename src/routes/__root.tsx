import { HeadContent, Link, Scripts, createRootRoute, useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import appCss from '../styles.css?url';

export const Route = createRootRoute({
  head: () => ({
    links: [
      { href: appCss, rel: 'stylesheet' },
      { href: '/favicon.png', rel: 'icon', type: 'image/png', sizes: '400x400' },
      { href: '/apple-touch-icon.png?v=typesafe', rel: 'apple-touch-icon', sizes: '400x400' },
      { href: 'https://fonts.googleapis.com', rel: 'preconnect' },
      { href: 'https://fonts.gstatic.com', rel: 'preconnect', crossOrigin: 'anonymous' },
      {
        href: 'https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,400;6..72,500&display=swap',
        rel: 'stylesheet',
      },
    ],
    meta: [
      { charSet: 'utf-8' },
      { content: 'width=device-width, initial-scale=1', name: 'viewport' },
      { title: 'Jev Search — Picks where to search. Ranks what comes back.' },
      {
        content:
          "TypeSafe's Jev reads your question, selects sources, time ranges and search terms, and ranks the results. No generated answers.",
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
  const isHome = useRouterState({ select: (state) => state.location.pathname === '/' });

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-dvh flex flex-col">
        <div className="flex flex-1 flex-col">{children}</div>
        <footer className="border-t px-4 py-4 text-xs text-muted-foreground">
          <div className={isHome ? 'mx-auto max-w-5xl text-center' : 'mx-auto max-w-5xl'}>
            <span>
              Understanding and ranking by{' '}
              <a className="text-foreground/80 hover:underline" href="https://typesafe.ai" rel="noreferrer" target="_blank">
                Jev, TypeSafe's judgment model
              </a>
              {' · '}built by{' '}
              <a className="text-foreground/80 hover:underline" href="https://www.search1api.com" rel="noreferrer" target="_blank">
                Search1API
              </a>
              {' · '}no generated answers{' · '}your query is sent to both
            </span>
          </div>
        </footer>
        <Scripts />
      </body>
    </html>
  );
}
