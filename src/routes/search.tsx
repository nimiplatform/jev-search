import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { Filters } from '@/components/filters';
import { ProgressBar } from '@/components/progress';
import { Status } from '@/components/status';
import { Results, offTopicCount } from '@/components/results';
import { SearchBox } from '@/components/search-box';
import { Weights } from '@/components/weights';
import { Wordmark } from '@/components/wordmark';
import { DEFAULT_WEIGHTS, clusterInOrder } from '@/lib/rank';
import { isSourceId, isWindowId, type SourceId, type WindowId } from '@/lib/sources';
import { useAsk, type AskState } from '@/lib/use-ask';
import { useStableOrder } from '@/lib/use-stable-order';

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

function Header({ q, state }: { q: string; state: AskState }) {
  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
      <div className="relative mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
        <Wordmark size="sm" />
        <div className="flex-1 max-w-2xl">
          <SearchBox initial={q} compact key={q} />
        </div>
        <ProgressBar state={state} />
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

  const ordered = useStableOrder(state.items, weights);
  const clusters = useMemo(() => clusterInOrder(ordered, weights), [ordered, weights]);

  const setWindow = (w: WindowId | undefined) =>
    navigate({ search: (prev) => ({ ...prev, w }) });
  const setSources = (ids: SourceId[] | undefined) =>
    navigate({ search: (prev) => ({ ...prev, s: ids?.join(',') }) });

  return (
    <>
      <Header q={params.q} state={state} />
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
              <Filters
                state={state}
                explicitWindow={params.w}
                explicitSources={explicitSources}
                onWindow={setWindow}
                onSources={setSources}
              />
              <div className="relative mt-4">
                <Status state={state} hiddenOffTopic={offTopicCount(clusters)} />
              </div>
              <Results clusters={clusters} request={params.q} weights={weights} streaming={state.phase !== 'done'} />
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
