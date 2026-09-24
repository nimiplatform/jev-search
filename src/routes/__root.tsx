import { Link, Outlet, createRootRoute, useRouterState } from '@tanstack/react-router';
import { RepositoryLink } from '@/components/repository-link';
import { SettingsButton } from '@/components/settings';
import { SourceIcon } from '@/components/source-icon';
import { SponsorLink } from '@/components/sponsor-link';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';

export const Route = createRootRoute({
  component: RootLayout,
  notFoundComponent: NotFound,
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

function RootLayout() {
  const isHome = useRouterState({ select: (state) => state.location.pathname === '/' });

  return (
    <>
      {isHome && (
        <div className="absolute right-4 top-4 flex items-center gap-1 sm:right-6">
          <SettingsButton />
          <ThemeToggle />
          <RepositoryLink />
          <SponsorLink />
        </div>
      )}
      <div className="flex flex-1 flex-col">
        <Outlet />
      </div>
      {/* Two things with different jobs: where to go next (content, above the
          rule, home only: results are where to go next on the search page)
          and who did what to the query (one credit line, below it). */}
      <footer className="text-xs text-muted-foreground">
        {isHome && (
          <nav
            aria-label="Jev community"
            className="mx-auto flex max-w-5xl items-center justify-center gap-x-6 px-4 pb-2 text-sm"
          >
            <a
              className="inline-flex min-h-11 items-center gap-1.5 text-foreground/80 hover:text-primary-text hover:underline"
              href="https://github.com/fatwang2/awesome-jev"
              rel="noreferrer"
              target="_blank"
              title="Projects built with Jev"
            >
              <SourceIcon className="size-3.5" id="github" />
              Showcase
            </a>
            <a
              className="inline-flex min-h-11 items-center gap-1.5 text-foreground/80 hover:text-primary-text hover:underline"
              href="https://www.reddit.com/r/typesafe_jev/"
              rel="noreferrer"
              target="_blank"
              title="r/typesafe_jev on Reddit"
            >
              <SourceIcon className="size-3.5" id="reddit" />
              Community
            </a>
          </nav>
        )}
        <div className="border-t">
          <p className={cn('mx-auto max-w-5xl px-4 py-4 leading-relaxed', isHome && 'text-center')}>
            <span className="block sm:inline">
              Judgment via Nimi
              {' · '}Search by{' '}
              <a className="text-foreground/80 hover:underline" href="https://www.search1api.com" rel="noreferrer" target="_blank">
                Search1API
              </a>
            </span>
            <span className="hidden sm:inline">{' · '}</span>
            <span className="block sm:inline">No generated answers</span>
          </p>
        </div>
      </footer>
    </>
  );
}
