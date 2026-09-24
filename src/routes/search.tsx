import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { RotateCwIcon, SquareIcon } from 'lucide-react';
import { useMemo } from 'react';
import { Filters } from '@/components/filters';
import { SourceNotices } from '@/components/notices';
import { RepositoryLink } from '@/components/repository-link';
import { Results, type SearchFailure } from '@/components/results';
import { SearchBox } from '@/components/search-box';
import { SettingsButton } from '@/components/settings';
import { SponsorLink } from '@/components/sponsor-link';
import { ThemeToggle } from '@/components/theme-toggle';
import { Wordmark } from '@/components/wordmark';
import { Working } from '@/components/working';
import { isRunning } from '@/lib/ask-session';
import { sourceProgress, type SourceProgress } from '@/lib/progress';
import { clusterInOrder, type SortMode } from '@/lib/rank';
import { isSourceId, isWindowId, type SourceId, type WindowId } from '@/lib/sources';
import { useAsk } from '@/lib/use-ask';
import { APP_TITLE, useDocumentTitle } from '@/lib/use-document-title';
import { useStableOrder } from '@/lib/use-stable-order';

interface SearchParams {
  q: string;
  w?: WindowId;
  s?: string;
  sort?: SortMode;
}

function parseSources(s: string | undefined): SourceId[] | undefined {
  if (!s) return undefined;
  const ids = s.split(',').filter(isSourceId);
  return ids.length > 0 ? ids : undefined;
}

export const Route = createFileRoute('/search')({
  validateSearch: (raw: Record<string, unknown>): SearchParams => {
    const q = typeof raw.q === 'string' ? raw.q.slice(0, 300) : '';
    const out: SearchParams = { q };
    if (typeof raw.w === 'string' && isWindowId(raw.w)) out.w = raw.w;
    if (typeof raw.s === 'string' && raw.s) out.s = raw.s;
    if (raw.sort === 'newest') out.sort = 'newest';
    return out;
  },
  component: SearchPage,
});

function Header({ q }: { q: string }) {
  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
      <div className="relative mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
        <Wordmark size="sm" />
        <div className="order-last w-full min-w-0 max-w-2xl sm:order-none sm:flex-1">
          <SearchBox initial={q} compact key={q} />
        </div>
        <div className="ml-auto flex items-center gap-1">
          <SettingsButton />
          <ThemeToggle />
          <RepositoryLink />
          <SponsorLink />
        </div>
      </div>
    </header>
  );
}

function searchFailure(progress: SourceProgress[]): SearchFailure {
  if (progress.length > 0 && progress.every((p) => p.status === 'failed')) return 'all';
  if (progress.some((p) => p.status === 'failed' || p.status === 'partial')) return 'some';
  return null;
}

const pill =
  'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-offset-2';

function SearchPage() {
  const params = Route.useSearch();
  const navigate = useNavigate({ from: '/search' });
  const explicitSources = parseSources(params.s);
  const { state, stop, searchAgain } = useAsk({ q: params.q, w: params.w, s: explicitSources });
  useDocumentTitle(params.q.trim() ? `${params.q} · Jev Search` : APP_TITLE);

  const sort = params.sort ?? 'best';
  const ordered = useStableOrder(state.items, sort);
  const clusters = useMemo(() => clusterInOrder(ordered), [ordered]);
  const progress = useMemo(() => sourceProgress(state), [state]);
  const running = isRunning(state);

  const setWindow = (w: WindowId | undefined) =>
    navigate({ search: (prev) => ({ ...prev, w }) });
  const setSources = (ids: SourceId[] | undefined) =>
    navigate({ search: (prev) => ({ ...prev, s: ids?.join(',') }) });
  const resetFilters = () =>
    navigate({ search: (prev) => ({ ...prev, w: undefined, s: undefined }) });
  const setSort = (mode: SortMode) =>
    navigate({
      search: (prev) => ({ ...prev, sort: mode === 'newest' ? mode : undefined }),
      resetScroll: false,
    });

  let control: React.ReactNode = null;
  if (running) {
    control = (
      <button className={pill} onClick={stop} title="Stop this search and keep what has arrived" type="button">
        <SquareIcon aria-hidden className="size-2.5" fill="currentColor" />
        Stop
      </button>
    );
  } else if (state.phase === 'done' || state.phase === 'stopped') {
    // Icon only on phones, where the summary beside it needs the room.
    control = (
      <button
        aria-label="Search again"
        className={pill}
        onClick={searchAgain}
        title="Run this search again as a new search"
        type="button"
      >
        <RotateCwIcon aria-hidden className="size-3" />
        <span className="hidden sm:inline">Search again</span>
      </button>
    );
  }

  return (
    <>
      <Header q={params.q} />
      <main className="mx-auto w-full max-w-5xl px-4 py-4">
        {!params.q.trim() && <p className="text-muted-foreground">Type something to search.</p>}

        {params.q.trim() && state.phase === 'error' && (
          <div className="max-w-3xl rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm" role="alert">
            <p className="font-medium">Search failed</p>
            <p className="mt-1 text-muted-foreground wrap-anywhere">
              {state.error?.message}
              {state.error?.code && <span className="font-mono text-xs"> ({state.error.code})</span>}
            </p>
            <button className={`${pill} mt-3`} onClick={searchAgain} type="button">
              <RotateCwIcon aria-hidden className="size-3" />
              Search again
            </button>
          </div>
        )}

        {params.q.trim() && (state.phase !== 'error' || state.intent) && (
          <div className="max-w-3xl">
            <div className="min-w-0">
              <Filters
                state={state}
                explicitWindow={params.w}
                explicitSources={explicitSources}
                onWindow={setWindow}
                onSources={setSources}
                onReset={resetFilters}
              />
              <Working
                state={state}
                actions={
                  <div className="flex shrink-0 items-center gap-3">
                    {control}
                    {state.items.length > 0 && (
                      <div className="flex items-center gap-2 whitespace-nowrap text-xs" role="group" aria-label="Sort results">
                        <button
                          aria-pressed={sort === 'best'}
                          className="py-0.5 font-medium text-muted-foreground hover:text-foreground focus-visible:outline-offset-4 aria-pressed:text-foreground"
                          onClick={() => setSort('best')}
                          type="button"
                        >
                          Best match
                        </button>
                        <span aria-hidden className="text-muted-foreground/40">/</span>
                        <button
                          aria-pressed={sort === 'newest'}
                          className="py-0.5 font-medium text-muted-foreground hover:text-foreground focus-visible:outline-offset-4 aria-pressed:text-foreground"
                          onClick={() => setSort('newest')}
                          type="button"
                        >
                          Newest
                        </button>
                      </div>
                    )}
                  </div>
                }
              />
              <SourceNotices progress={progress} />
              <Results
                clusters={clusters}
                failure={searchFailure(progress)}
                status={running ? 'streaming' : state.phase === 'stopped' ? 'stopped' : 'done'}
              />
            </div>
          </div>
        )}
      </main>
    </>
  );
}
