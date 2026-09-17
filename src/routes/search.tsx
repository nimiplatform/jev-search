import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { Filters } from '@/components/filters';
import { Results, ResultsSkeleton } from '@/components/results';
import { SearchBox } from '@/components/search-box';
import { Weights } from '@/components/weights';
import { Wordmark } from '@/components/wordmark';
import { DEFAULT_WEIGHTS, clusterItems } from '@/lib/rank';
import { isSourceId, isWindowId, type SourceId, type WindowId } from '@/lib/sources';
import { searchFn } from '@/server/search';

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
  loaderDeps: ({ search }) => ({ q: search.q, w: search.w, s: search.s }),
  loader: async ({ deps }) => {
    if (!deps.q.trim()) return null;
    return searchFn({ data: { q: deps.q, w: deps.w, s: parseSources(deps.s) } });
  },
  head: ({ loaderData }) => {
    const q = loaderData?.ok ? loaderData.data.request : '';
    return { meta: [{ title: q ? `${q} · last24hours` : 'last24hours' }] };
  },
  pendingComponent: Pending,
  pendingMs: 150,
  component: SearchPage,
});

function Header({ q }: { q: string }) {
  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
        <Wordmark size="sm" />
        <div className="flex-1 max-w-2xl">
          <SearchBox initial={q} compact />
        </div>
      </div>
    </header>
  );
}

function Pending() {
  const { q } = Route.useSearch();
  return (
    <>
      <Header q={q} />
      <main className="mx-auto max-w-5xl px-4 py-4">
        <p className="text-sm text-muted-foreground">Reading the request, searching, ranking…</p>
        <ResultsSkeleton />
      </main>
    </>
  );
}

function SearchPage() {
  const params = Route.useSearch();
  const response = Route.useLoaderData();
  const navigate = useNavigate({ from: '/search' });
  const [weights, setWeights] = useState(DEFAULT_WEIGHTS);

  const data = response?.ok ? response.data : null;
  const clusters = useMemo(
    () => (data ? clusterItems(data.items, weights) : []),
    [data, weights]
  );

  const setWindow = (w: WindowId | undefined) =>
    navigate({ search: (prev) => ({ ...prev, w }) });
  const setSources = (ids: SourceId[] | undefined) =>
    navigate({ search: (prev) => ({ ...prev, s: ids?.join(',') }) });

  return (
    <>
      <Header q={params.q} />
      <main className="mx-auto max-w-5xl px-4 py-4">
        {!params.q.trim() && (
          <p className="text-muted-foreground">Type something to search.</p>
        )}

        {response && !response.ok && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
            <p className="font-medium">
              {response.error === 'rate_limited' ? 'Slow down' : 'Search failed'}
            </p>
            <p className="mt-1 text-muted-foreground">{response.message}</p>
          </div>
        )}

        {data && (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_240px]">
            <div className="min-w-0">
              <Filters
                data={data}
                explicitWindow={params.w}
                explicitSources={parseSources(params.s)}
                onWindow={setWindow}
                onSources={setSources}
              />
              <p className="mt-3 text-xs text-muted-foreground">
                Searched Google for <span className="font-medium text-foreground">“{data.query}”</span>
                {data.query !== data.request && ' (rewritten from your request)'} ·{' '}
                {data.items.length} results in {clusters.length} groups ·{' '}
                {data.timing.intentMs + data.timing.searchMs + data.timing.rerankMs} ms
              </p>
              {data.errors.length > 0 && (
                <p className="mt-2 text-xs text-destructive">
                  {data.errors.map((e) => `${e.source}: ${e.message}`).join(' · ')}
                </p>
              )}
              <Results clusters={clusters} request={data.request} weights={weights} />
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
