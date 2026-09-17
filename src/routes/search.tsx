import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { Filters } from '@/components/filters';
import { Progress, Understanding } from '@/components/progress';
import { Results, ResultsSkeleton } from '@/components/results';
import { SearchBox } from '@/components/search-box';
import { Weights } from '@/components/weights';
import { Wordmark } from '@/components/wordmark';
import { DEFAULT_WEIGHTS, clusterItems } from '@/lib/rank';
import { isSourceId, isWindowId, type SourceId, type WindowId } from '@/lib/sources';
import { useAsk } from '@/lib/use-ask';

interface SearchParams {
  q: string;
  w?: WindowId;
  s?: string;
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
    return out;
  },
  head: ({ match }) => ({
    meta: [{ title: match.search.q ? `${match.search.q} · s1 ask` : 's1 ask' }],
  }),
  component: SearchPage,
});

function Header({ q }: { q: string }) {
  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
        <Wordmark size="sm" />
        <div className="flex-1 max-w-2xl">
          <SearchBox initial={q} compact key={q} />
        </div>
      </div>
    </header>
  );
}

function SearchPage() {
  const params = Route.useSearch();
  const navigate = useNavigate({ from: '/search' });
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);
  const explicitSources = parseSources(params.s);
  const state = useAsk({ q: params.q, w: params.w, s: explicitSources });

  const clusters = useMemo(() => clusterItems(state.items, weights), [state.items, weights]);

  const setWindow = (w: WindowId | undefined) =>
    navigate({ search: (prev) => ({ ...prev, w }) });
  const setSources = (ids: SourceId[] | undefined) =>
    navigate({ search: (prev) => ({ ...prev, s: ids?.join(',') }) });

  return (
    <>
      <Header q={params.q} />
      <main className="mx-auto max-w-5xl px-4 py-4">
        {!params.q.trim() && <p className="text-muted-foreground">Type something to search.</p>}

        {state.phase === 'error' && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
            <p className="font-medium">Search failed</p>
            <p className="mt-1 text-muted-foreground">{state.message}</p>
          </div>
        )}

        {params.q.trim() && state.phase !== 'error' && (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_240px]">
            <div className="min-w-0">
              {state.intent ? (
                <Filters
                  intent={state.intent}
                  explicitWindow={params.w}
                  explicitSources={explicitSources}
                  onWindow={setWindow}
                  onSources={setSources}
                />
              ) : null}
              <div className="mt-3 flex flex-col gap-2 rounded-lg border bg-muted/30 px-3 py-2">
                {state.intent && <Understanding intent={state.intent} />}
                <Progress state={state} />
              </div>
              {state.phase === 'done' && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {state.items.length} results in {clusters.length} groups
                </p>
              )}
              {state.items.length === 0 && state.phase !== 'done' ? (
                <ResultsSkeleton />
              ) : (
                <Results clusters={clusters} request={params.q} weights={weights} />
              )}
            </div>
            <aside className="lg:sticky lg:top-20 lg:self-start">
              <Weights value={weights} onChange={setWeights} />
            </aside>
          </div>
        )}
      </main>
    </>
  );
}
