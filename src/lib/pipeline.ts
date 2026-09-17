import { buildCandidates } from './candidates';
import { freshnessScore, parseAgeHours, stripAgePrefix } from './freshness';
import type { RankedItem } from './rank';
import { search, type Search1ApiConfig } from './search1api';
import {
  DEFAULT_WINDOW,
  SOURCES,
  SOURCE_IDS,
  sourceById,
  windowById,
  type SourceId,
  type WindowId,
} from './sources';
import { inferIntent, rerank, type Intent, type TypeSafeConfig } from './typesafe';

export interface SearchInput {
  request: string;
  /** Explicit user choice; undefined lets the judge decide. */
  window?: WindowId;
  /** Explicit user choice; undefined lets the judge decide. */
  sources?: SourceId[];
}

export interface SearchOutput {
  request: string;
  /** Keyword query actually sent to the engine. */
  query: string;
  candidates: string[];
  window: WindowId;
  sources: SourceId[];
  inferred: {
    window: Intent['window'];
    sources: Intent['sources'];
    query: Intent['query'];
  };
  items: RankedItem[];
  errors: { source: SourceId; message: string }[];
  timing: { intentMs: number; searchMs: number; rerankMs: number };
  tokens: number;
}

const SOURCE_PROB_THRESHOLD = 0.6;
const RESULTS_PER_SOURCE = 8;

export interface PipelineDeps {
  search1api: Search1ApiConfig;
  typesafe: TypeSafeConfig;
  now?: () => Date;
}

export async function runSearch(
  deps: PipelineDeps,
  input: SearchInput,
  signal?: AbortSignal
): Promise<SearchOutput> {
  const now = deps.now ? deps.now() : new Date();
  const request = input.request.trim();
  const candidates = buildCandidates(request);

  // 1. Understand the request.
  const t0 = performance.now();
  const intent = await inferIntent(
    deps.typesafe,
    { request, candidates, now },
    signal
  );
  const intentMs = Math.round(performance.now() - t0);

  const window =
    input.window ??
    (intent.window.choice === 'unspecified' ? DEFAULT_WINDOW : intent.window.choice);

  let sources: SourceId[];
  if (input.sources && input.sources.length > 0) {
    sources = input.sources;
  } else {
    const wanted = SOURCE_IDS.filter(
      (id) => intent.sources[id] >= SOURCE_PROB_THRESHOLD
    );
    sources = wanted.length > 0 ? wanted : [...SOURCE_IDS];
  }

  const query = candidates[intent.query.index] ?? candidates[0]!;
  const win = windowById(window);

  // 2. Fan out one engine call per source.
  const t1 = performance.now();
  const restrictedSites = SOURCES.flatMap((s) => (s.site ? [s.site] : []));
  const settled = await Promise.allSettled(
    sources.map((id) => {
      const source = sourceById(id);
      return search(
        deps.search1api,
        {
          query,
          timeRange: win.timeRange,
          includeSites: source.site ? [source.site] : [],
          excludeSites: source.site ? [] : restrictedSites,
          maxResults: RESULTS_PER_SOURCE,
        },
        signal
      );
    })
  );
  const searchMs = Math.round(performance.now() - t1);

  const errors: SearchOutput['errors'] = [];
  const items: RankedItem[] = [];
  settled.forEach((result, i) => {
    const source = sources[i]!;
    if (result.status === 'rejected') {
      const message =
        result.reason instanceof Error ? result.reason.message : String(result.reason);
      errors.push({ source, message });
      return;
    }
    result.value.forEach((raw, index) => {
      const ageHours = parseAgeHours(raw.snippet, now.getTime());
      items.push({
        id: `${source}:${index + 1}`,
        source,
        title: raw.title,
        url: raw.link,
        snippet: stripAgePrefix(raw.snippet),
        ageHours,
        relevance: 0,
        freshness: freshnessScore(ageHours, win.hours),
        position: index + 1,
      });
    });
  });

  // 3. Judge relevance of every result against the original request.
  const t2 = performance.now();
  const { relevance, usage } = await rerank(
    deps.typesafe,
    request,
    items.map((it) => ({
      id: it.id,
      source: it.source,
      title: it.title,
      snippet: it.snippet,
    })),
    signal
  );
  const rerankMs = Math.round(performance.now() - t2);
  for (const item of items) item.relevance = relevance[item.id] ?? 0;

  return {
    request,
    query,
    candidates,
    window,
    sources,
    inferred: {
      window: intent.window,
      sources: intent.sources,
      query: intent.query,
    },
    items,
    errors,
    timing: { intentMs, searchMs, rerankMs },
    tokens: intent.usage.input_tokens + usage.input_tokens,
  };
}
