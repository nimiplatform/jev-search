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

export interface LaneError {
  source: SourceId;
  engine: string;
  message: string;
}

export interface IntentEvent {
  type: 'intent';
  request: string;
  /** Keyword query actually sent to the engines. */
  query: string;
  /** Name-or-title query sent to catalogue engines such as IMDb. */
  entityQuery: string;
  candidates: string[];
  window: WindowId;
  sources: SourceId[];
  inferred: {
    window: Intent['window'];
    sources: Intent['sources'];
    query: Intent['query'];
    entity: Intent['entity'];
  };
  intentMs: number;
}

export interface SourceEvent {
  type: 'source';
  source: SourceId;
  items: RankedItem[];
  errors: LaneError[];
  ms: number;
}

export interface DoneEvent {
  type: 'done';
  totalMs: number;
  tokens: number;
}

export type AskEvent = IntentEvent | SourceEvent | DoneEvent;

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

/**
 * The whole search as a stream of events: first what the judge understood
 * (so the UI can show chips immediately), then each source as soon as its
 * engines have answered and its results are scored, then a summary.
 */
export async function* askStream(
  deps: PipelineDeps,
  input: SearchInput,
  signal?: AbortSignal
): AsyncGenerator<AskEvent> {
  const started = performance.now();
  const now = deps.now ? deps.now() : new Date();
  const request = input.request.trim();
  const candidates = buildCandidates(request);

  // 1. Understand the request.
  const intent = await inferIntent(deps.typesafe, { request, candidates, now }, signal);
  const intentMs = Math.round(performance.now() - started);

  const window = input.window ?? intent.window.choice ?? DEFAULT_WINDOW;
  let sources: SourceId[];
  if (input.sources && input.sources.length > 0) {
    sources = input.sources;
  } else {
    const wanted = SOURCE_IDS.filter((id) => intent.sources[id] >= SOURCE_PROB_THRESHOLD);
    sources = wanted.length > 0 ? wanted : [...DEFAULT_SOURCE_IDS];
  }
  const query = candidates[intent.query.index] ?? candidates[0]!;
  const entityQuery = candidates[intent.entity.index] ?? query;
  const win = windowById(window);
  const maxAge = win.hours * WINDOW_TOLERANCE;
  let tokens = intent.usage.input_tokens;

  yield {
    type: 'intent',
    request,
    query,
    entityQuery,
    candidates,
    window,
    sources,
    inferred: { window: intent.window, sources: intent.sources, query: intent.query, entity: intent.entity },
    intentMs,
  };

  // 2. Every source runs its lanes, fuses them and gets scored independently.
  const runSource = async (source: SourceId): Promise<SourceEvent> => {
    const t0 = performance.now();
    const errors: LaneError[] = [];
    const lanes = sourceById(source).lanes;
    const settled = await Promise.allSettled(
      lanes.map((lane) =>
        search(
          deps.search1api,
          {
            query: lane.entityQuery ? entityQuery : query,
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
    const lists: { engine: string; results: RawResult[] }[] = [];
    settled.forEach((result, i) => {
      const lane = lanes[i]!;
      if (result.status === 'rejected') {
        const message =
          result.reason instanceof Error ? result.reason.message : String(result.reason);
        errors.push({ source, engine: lane.service, message });
      } else {
        lists.push({ engine: lane.service, results: result.value });
      }
    });

    const items: RankedItem[] = [];
    let position = 0;
    for (const { result: raw, engines } of fuseLanes(lists).slice(0, RESULTS_PER_SOURCE)) {
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

    // 3. Judge relevance of this source's results against the original request.
    if (items.length > 0) {
      try {
        const scored = await rerank(
          deps.typesafe,
          request,
          items.map((it) => ({ id: it.id, source: it.source, title: it.title, snippet: it.snippet })),
          signal
        );
        tokens += scored.usage.input_tokens;
        for (const item of items) item.relevance = scored.relevance[item.id] ?? 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push({ source, engine: 'typesafe', message });
      }
    }

    return { type: 'source', source, items, errors, ms: Math.round(performance.now() - t0) };
  };

  const inFlight = new Map<SourceId, Promise<{ source: SourceId; event: SourceEvent }>>();
  for (const source of sources) {
    inFlight.set(source, runSource(source).then((event) => ({ source, event })));
  }
  while (inFlight.size > 0) {
    const { source, event } = await Promise.race(inFlight.values());
    inFlight.delete(source);
    yield event;
  }

  yield { type: 'done', totalMs: Math.round(performance.now() - started), tokens };
}

// ---------------------------------------------------------------------------
// Non-streaming convenience for tests and scripts.
// ---------------------------------------------------------------------------

export interface SearchOutput extends Omit<IntentEvent, 'type'> {
  items: RankedItem[];
  errors: LaneError[];
  totalMs: number;
  tokens: number;
}

export async function runSearch(
  deps: PipelineDeps,
  input: SearchInput,
  signal?: AbortSignal
): Promise<SearchOutput> {
  let intent: IntentEvent | undefined;
  const items: RankedItem[] = [];
  const errors: LaneError[] = [];
  let totalMs = 0;
  let tokens = 0;
  for await (const event of askStream(deps, input, signal)) {
    if (event.type === 'intent') intent = event;
    else if (event.type === 'source') {
      items.push(...event.items);
      errors.push(...event.errors);
    } else {
      totalMs = event.totalMs;
      tokens = event.tokens;
    }
  }
  if (!intent) throw new Error('stream ended without intent');
  const { type: _type, ...rest } = intent;
  // Keep source order stable for callers that index by position.
  const order = new Map(intent.sources.map((s, i) => [s, i]));
  items.sort((a, b) => (order.get(a.source) ?? 0) - (order.get(b.source) ?? 0) || a.position - b.position);
  return { ...rest, items, errors, totalMs, tokens };
}
