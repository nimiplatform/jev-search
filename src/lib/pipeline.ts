import { buildCandidates } from './candidates';
import { freshnessScore, parseAgeHours, stripAgePrefix } from './freshness';
import { fuseLanes, type RankedItem } from './rank';
import { search, type RawResult, type Search1ApiConfig } from './search1api';
import {
  DEFAULT_SOURCE_IDS,
  DEFAULT_WINDOW,
  GENERAL_ENGINES,
  RESTRICTED_SITES,
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
  errors: { source: SourceId; engine: string; message: string }[];
  timing: { intentMs: number; searchMs: number; rerankMs: number };
  tokens: number;
}

const SOURCE_PROB_THRESHOLD = 0.6;
const RESULTS_PER_LANE = 8;
const RESULTS_PER_SOURCE = 10;
/** Engines apply time filters loosely; drop anything provably older than this multiple of the window. */
const WINDOW_TOLERANCE = 1.5;

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

  const window = input.window ?? intent.window.choice ?? DEFAULT_WINDOW;

  let sources: SourceId[];
  if (input.sources && input.sources.length > 0) {
    sources = input.sources;
  } else {
    const wanted = SOURCE_IDS.filter(
      (id) => intent.sources[id] >= SOURCE_PROB_THRESHOLD
    );
    sources = wanted.length > 0 ? wanted : [...DEFAULT_SOURCE_IDS];
  }

  const query = candidates[intent.query.index] ?? candidates[0]!;
  const win = windowById(window);

  // 2. Fan out every lane of every source, then fuse lanes per source.
  const t1 = performance.now();
  const laneCalls = sources.flatMap((id) =>
    sourceById(id).lanes.map((lane) => ({ id, lane }))
  );
  const settled = await Promise.allSettled(
    laneCalls.map(({ lane }) =>
      search(
        deps.search1api,
        {
          query,
          service: lane.service,
          timeRange: lane.timeFilter === false ? undefined : win.timeRange,
          maxResults: RESULTS_PER_LANE,
          includeSites: lane.site ? [lane.site] : [],
          excludeSites: !lane.site && GENERAL_ENGINES.has(lane.service) ? RESTRICTED_SITES : [],
        },
        signal
      )
    )
  );
  const searchMs = Math.round(performance.now() - t1);

  const errors: SearchOutput['errors'] = [];
  const bySource = new Map<SourceId, { engine: string; results: RawResult[] }[]>();
  settled.forEach((result, i) => {
    const { id, lane } = laneCalls[i]!;
    if (result.status === 'rejected') {
      const message =
        result.reason instanceof Error ? result.reason.message : String(result.reason);
      errors.push({ source: id, engine: lane.service, message });
      return;
    }
    const lists = bySource.get(id) ?? [];
    lists.push({ engine: lane.service, results: result.value });
    bySource.set(id, lists);
  });

  const maxAge = win.hours * WINDOW_TOLERANCE;
  const items: RankedItem[] = [];
  for (const source of sources) {
    const fused = fuseLanes(bySource.get(source) ?? []).slice(0, RESULTS_PER_SOURCE);
    let position = 0;
    for (const { result: raw, engines } of fused) {
      const ageHours = parseAgeHours(raw.snippet, now.getTime());
      if (ageHours !== null && ageHours > maxAge) continue; // maxAge is Infinity for 'any'
      position += 1;
      items.push({
        id: `${source}:${position}`,
        source,
        title: raw.title,
        url: raw.link,
        snippet: stripAgePrefix(raw.snippet),
        ageHours,
        relevance: 0,
        freshness: freshnessScore(ageHours, win.hours),
        position,
        engines,
      });
    }
  }

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
