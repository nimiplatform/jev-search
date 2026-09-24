import { cachedSearch, type ResultCache } from './cache';
import { buildCandidates } from './candidates';
import { inferIntent, judgeRelevance, type DecideFn, type Intent } from './decide';
import { describeFailure, failureKind, shortMessage } from './failure';
import { freshnessScore, isPublicationStale, resolvePublication, stripAgePrefix } from './freshness';
import { mergeItems } from './merge';
import type { RankedItem } from './rank';
import { search, Search1ApiNotConfiguredError, type RawResult, type Search1ApiConfig, type SearchParams } from './search1api';
import {
  DEFAULT_SOURCE_IDS,
  SOURCE_IDS,
  sourceById,
  windowById,
  type Lane,
  type SourceId,
  type WindowId,
} from './sources';

export interface SearchInput {
  request: string;
  /** Explicit user choice; undefined lets the intent judgment decide. */
  window?: WindowId;
  /** Explicit user choice; undefined lets the intent judgment decide. */
  sources?: SourceId[];
}

export interface LaneError {
  source: SourceId;
  engine: string;
  message: string;
  code: string;
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
  /** What the intent judgment answered, with its probabilities; explicit choices above override it. */
  inferred: {
    window: Intent['window'];
    sources: Intent['sources'];
    query: Intent['query'];
    entity: Intent['entity'];
  };
  intentMs: number;
}

/** An engine has answered; the UI shows its count while its rows are judged. */
export interface FoundEvent {
  type: 'found';
  source: SourceId;
  engine: string;
  items: RankedItem[];
  searchMs: number;
}

export interface LaneEvent {
  type: 'lane';
  source: SourceId;
  engine: string;
  /**
   * This engine's rows, each either judged (`ranked`) or carrying the
   * `unscoredReason` its judgment failed with. Empty when the search failed.
   */
  items: RankedItem[];
  /** Rows the engine returned but which were provably older than the window. */
  stale: number;
  /** Engine round trip. */
  searchMs: number;
  /** Time spent judging this lane's rows. */
  scoreMs: number;
  /** Why the engine search failed. */
  error?: string;
  errorCode?: string;
}

export interface DoneEvent {
  type: 'done';
  totalMs: number;
  /** The overall budget cut a search or a judgment short. */
  timedOut: boolean;
}

/** The request could not be interpreted, so nothing was searched. Ends the stream. */
export interface AskErrorEvent {
  type: 'error';
  code: string;
  message: string;
}

export type AskEvent = IntentEvent | FoundEvent | LaneEvent | DoneEvent | AskErrorEvent;

const SOURCE_PROB_THRESHOLD = 0.6;
const RESULTS_PER_LANE = 8;
/** Engines apply time filters loosely; drop anything provably older than this multiple of the window. */
const WINDOW_TOLERANCE = 1.5;
/** One search, from reading the request to the last judgment, fits in this budget. */
export const OVERALL_BUDGET_MS = 30_000;
/** Relevance judgments in flight at once for one lane. */
export const JUDGMENTS_PER_LANE = 4;

export interface PipelineDeps {
  /** Absent when no Search1API key is configured; every lane then fails with that reason. */
  search1api?: Search1ApiConfig;
  /** Runs one typed decision (the Nimi text.decide capability). */
  decide: DecideFn;
  /** Engine responses are cached by query, engine and window. */
  cache?: ResultCache;
  now?: () => Date;
}

export interface AskOptions {
  /** Cancels the whole search: the user stopped it, or a newer search replaced it. */
  signal?: AbortSignal;
  /** Overall budget; defaults to OVERALL_BUDGET_MS. */
  budgetMs?: number;
}

function seconds(ms: number): string {
  return `${Math.round(ms / 100) / 10} s`;
}

export class BudgetExceededError extends Error {
  readonly code = 'BUDGET_EXCEEDED';
  constructor(budgetMs: number) {
    super(`The ${seconds(budgetMs)} search budget ran out`);
    this.name = 'TimeoutError';
  }
}

/** The failed intent judgment, as the stream reports it. */
export class SearchFailedError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'SearchFailedError';
    this.code = code;
  }
}

interface Budget {
  /** Aborts when the budget runs out. */
  signal: AbortSignal;
  /** Whole milliseconds left, never negative: the timeout for the next call. */
  remaining(): number;
  expired(): boolean;
  dispose(): void;
}

function startBudget(ms: number): Budget {
  const controller = new AbortController();
  const endsAt = performance.now() + ms;
  const timer = setTimeout(() => controller.abort(new BudgetExceededError(ms)), ms);
  return {
    signal: controller.signal,
    remaining: () => Math.max(0, Math.floor(endsAt - performance.now())),
    expired: () => controller.signal.aborted || performance.now() >= endsAt,
    dispose: () => clearTimeout(timer),
  };
}

/**
 * Settles with `promise`, or rejects with the abort reason as soon as `signal`
 * aborts. Callees are asked to stop through their own signal and timeout; this
 * makes sure the pipeline never waits past its budget even when one does not.
 */
function unlessAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) {
    promise.catch(() => undefined);
    return Promise.reject(signal.reason);
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}

/** Runs `run` over `items`, at most `limit` at a time. `run` must not reject. */
async function forEachLimited<T>(items: T[], limit: number, run: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next]!;
      next += 1;
      await run(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

/**
 * The whole search as a stream of events: first what the intent judgment
 * understood (so the UI can show chips immediately), then every engine lane
 * as soon as it has answered and its rows are judged, then a summary. Lanes
 * of one source are not waited on together: the client folds them by URL.
 *
 * Every decision call gets the time left in the overall budget as its
 * timeout, and the stream never waits past that budget. A failed intent
 * judgment ends the stream with an `error` event; a failed relevance
 * judgment leaves that row unjudged with its reason. Cancelling `signal`
 * makes the stream throw the abort reason.
 */
export async function* askStream(
  deps: PipelineDeps,
  input: SearchInput,
  options: AskOptions = {}
): AsyncGenerator<AskEvent> {
  const caller = options.signal;
  caller?.throwIfAborted();
  const started = performance.now();
  const budgetMs = options.budgetMs ?? OVERALL_BUDGET_MS;
  const budget = startBudget(budgetMs);
  // Work this search starts stops when the caller cancels or the stream ends.
  const ended = new AbortController();
  const canceled = caller ? AbortSignal.any([caller, ended.signal]) : ended.signal;
  // Engine calls and every wait also stop when the budget runs out.
  const bounded = AbortSignal.any([canceled, budget.signal]);
  let budgetHit = false;
  const throwIfCanceled = () => caller?.throwIfAborted();

  try {
    const now = deps.now ? deps.now() : new Date();
    const request = input.request.trim();
    const candidates = buildCandidates(request);

    const searchEngine = (params: SearchParams) => {
      const config = deps.search1api;
      if (!config) return Promise.reject(new Search1ApiNotConfiguredError());
      return cachedSearch(deps.cache, params, () => search(config, params, bounded));
    };

    // 0. Speculate: Google with the words as typed, fired alongside the intent
    //    judgment. Reused when that judgment keeps those words and wants no
    //    time window, which is most factual questions; otherwise it is dropped.
    //    An explicit time window rules the reuse out, so no paid call is made.
    //    Its outcome, failure included, is what the google lane reports:
    //    a failed speculation is not sent again.
    const speculative: SearchParams = { query: candidates[0]!, service: 'google', maxResults: RESULTS_PER_LANE };
    const speculativePromise =
      !deps.search1api ||
      (input.sources && !input.sources.includes('google')) ||
      (input.window !== undefined && input.window !== 'any')
        ? null
        : searchEngine(speculative).then(
            (value) => ({ ok: true as const, value }),
            (error: unknown) => ({ ok: false as const, error })
          );

    // 1. Understand the request. Explicit choices never stand in for a failed judgment.
    let intent: Intent;
    try {
      intent = await unlessAborted(
        inferIntent(deps.decide, { request, candidates, now }, { signal: canceled, timeoutMs: budget.remaining() }),
        bounded
      );
    } catch (error) {
      throwIfCanceled();
      const failure = describeFailure(error);
      const kind = failureKind(failure);
      let message: string;
      // The decision's timeout is the time left in the budget, so its timeout is the budget's.
      if (budget.expired() || kind === 'timeout') message = `Timed out reading the request: the ${seconds(budgetMs)} search budget ran out.`;
      else if (kind === 'canceled') message = 'Reading the request was canceled.';
      else message = `Could not interpret the request: ${failure.message || 'the decision failed'}`;
      yield { type: 'error', code: failure.code, message };
      return;
    }
    const intentMs = Math.round(performance.now() - started);

    const window = input.window ?? intent.window.choice;
    let sources: SourceId[];
    if (input.sources && input.sources.length > 0) {
      // Direct callers can bypass validation; never start a lane twice.
      sources = [...new Set(input.sources)];
    } else {
      // Business policy on a valid answer: the sources the request clearly wants, else the open web.
      const wanted = SOURCE_IDS.filter((id) => intent.sources[id] >= SOURCE_PROB_THRESHOLD);
      sources = wanted.length > 0 ? wanted : [...DEFAULT_SOURCE_IDS];
    }
    // With one candidate nothing was asked: the request itself is the query.
    const query = intent.query ? candidates[intent.query.index]! : candidates[0]!;
    const entityQuery = intent.entity ? candidates[intent.entity.index]! : query;
    const win = windowById(window);
    const maxAge = win.hours * WINDOW_TOLERANCE;

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
    throwIfCanceled();

    // 2. Every lane searches, filters by age, and has each row judged on its
    //    own. The 'found' event goes out between the two steps so the page can
    //    count the rows before they are judged.
    const found: FoundEvent[] = [];
    let wake: (() => void) | null = null;
    const announce = (event: FoundEvent) => {
      found.push(event);
      wake?.();
    };

    const judge = async (item: RankedItem): Promise<void> => {
      const timeoutMs = budget.remaining();
      if (canceled.aborted) {
        item.unscoredReason = 'Canceled before it was judged (CANCELED)';
        return;
      }
      if (timeoutMs <= 0) {
        budgetHit = true;
        item.unscoredReason = `Timed out: the ${seconds(budgetMs)} search budget ran out (BUDGET_EXCEEDED)`;
        return;
      }
      try {
        const relevance = await unlessAborted(
          judgeRelevance(
            deps.decide,
            request,
            { source: item.source, title: item.title, snippet: item.snippet },
            { signal: canceled, timeoutMs }
          ),
          bounded
        );
        item.relevance = relevance;
        item.ranked = true;
      } catch (error) {
        const failure = describeFailure(error);
        const kind = failureKind(failure);
        if (canceled.aborted || kind === 'canceled') {
          item.unscoredReason = `Canceled before it was judged (${failure.code})`;
        } else if (budget.expired() || kind === 'timeout') {
          // The decision's timeout is the time left in the budget.
          budgetHit = true;
          item.unscoredReason = `Timed out: the ${seconds(budgetMs)} search budget ran out (${failure.code})`;
        } else {
          item.unscoredReason = `${failure.message ? shortMessage(failure.message, 120) : 'The judgment failed'} (${failure.code})`;
        }
      }
    };

    const runLane = async (source: SourceId, lane: Lane): Promise<LaneEvent> => {
      const t0 = performance.now();
      const params: SearchParams = {
        query: lane.entityQuery ? entityQuery : query,
        service: lane.service,
        timeRange: lane.timeFilter === false ? undefined : win.timeRange,
        maxResults: RESULTS_PER_LANE,
        includeSites: lane.site ? [lane.site] : [],
      };
      const sameAsSpeculative =
        speculativePromise !== null &&
        params.service === speculative.service &&
        params.query === speculative.query &&
        params.timeRange === undefined &&
        params.includeSites!.length === 0;
      let raw: RawResult[];
      try {
        if (sameAsSpeculative) {
          const outcome = await unlessAborted(speculativePromise!, bounded);
          if (!outcome.ok) throw outcome.error;
          raw = outcome.value.results;
        } else {
          raw = (await unlessAborted(searchEngine(params), bounded)).results;
        }
      } catch (error) {
        let message: string;
        let errorCode: string;
        if (budget.expired() && !canceled.aborted) {
          budgetHit = true;
          message = `Timed out: the ${seconds(budgetMs)} search budget ran out`;
          errorCode = 'BUDGET_EXCEEDED';
        } else {
          const failure = describeFailure(error);
          message = failure.message || 'The search failed';
          errorCode = failure.code;
        }
        return {
          type: 'lane',
          source,
          engine: lane.service,
          items: [],
          stale: 0,
          searchMs: Math.round(performance.now() - t0),
          scoreMs: 0,
          error: message,
          errorCode,
        };
      }
      const searchMs = Math.round(performance.now() - t0);

      const items: RankedItem[] = [];
      let stale = 0;
      raw.forEach((row, index) => {
        const publication = resolvePublication(row.published_date, row.snippet, now.getTime());
        const { ageHours } = publication;
        if (isPublicationStale(publication, maxAge)) {
          stale += 1; // maxAge is Infinity for 'any'
          return;
        }
        items.push({
          id: `${source}:${lane.service}:${index + 1}`,
          source,
          title: row.title,
          url: row.link,
          snippet: stripAgePrefix(row.snippet),
          ...publication,
          relevance: null,
          ranked: false,
          freshness: freshnessScore(ageHours, win.hours),
          position: index + 1,
          engines: [lane.service],
        });
      });
      if (items.length > 0) {
        announce({ type: 'found', source, engine: lane.service, items: items.map((it) => ({ ...it })), searchMs });
      }

      // 3. Judge each row against the original request, a few at a time.
      const t1 = performance.now();
      await forEachLimited(items, JUDGMENTS_PER_LANE, judge);
      return {
        type: 'lane',
        source,
        engine: lane.service,
        items,
        stale,
        searchMs,
        scoreMs: Math.round(performance.now() - t1),
      };
    };

    const inFlight = new Map<string, Promise<{ key: string; event: LaneEvent }>>();
    for (const source of sources) {
      for (const lane of sourceById(source).lanes) {
        const key = `${source}/${lane.service}`;
        inFlight.set(key, runLane(source, lane).then((event) => ({ key, event })));
      }
    }
    while (inFlight.size > 0) {
      // Wake on whichever comes first: an engine answering, or a lane fully judged.
      const wakeup = new Promise<void>((resolve) => {
        wake = resolve;
      });
      const next = await Promise.race([Promise.race(inFlight.values()), wakeup]);
      wake = null;
      throwIfCanceled();
      while (found.length > 0) yield found.shift()!;
      if (next) {
        inFlight.delete(next.key);
        yield next.event;
      }
    }

    yield { type: 'done', totalMs: Math.round(performance.now() - started), timedOut: budgetHit };
  } finally {
    budget.dispose();
    ended.abort();
  }
}

// ---------------------------------------------------------------------------
// Non-streaming convenience for tests and scripts.
// ---------------------------------------------------------------------------

export interface SearchOutput extends Omit<IntentEvent, 'type'> {
  /** Lanes folded by URL, in source order then engine rank. */
  items: RankedItem[];
  lanes: LaneEvent[];
  errors: LaneError[];
  totalMs: number;
  timedOut: boolean;
}

export async function runSearch(deps: PipelineDeps, input: SearchInput, options?: AskOptions): Promise<SearchOutput> {
  let intent: IntentEvent | undefined;
  let items: RankedItem[] = [];
  const lanes: LaneEvent[] = [];
  const errors: LaneError[] = [];
  let totalMs = 0;
  let timedOut = false;
  for await (const event of askStream(deps, input, options)) {
    if (event.type === 'intent') intent = event;
    else if (event.type === 'found') continue;
    else if (event.type === 'lane') {
      lanes.push(event);
      items = mergeItems(items, event.items);
      if (event.error) {
        errors.push({ source: event.source, engine: event.engine, message: event.error, code: event.errorCode ?? '' });
      }
    } else if (event.type === 'error') throw new SearchFailedError(event.code, event.message);
    else {
      totalMs = event.totalMs;
      timedOut = event.timedOut;
    }
  }
  if (!intent) throw new Error('stream ended without intent');
  const { type: _type, ...rest } = intent;
  const order = new Map(intent.sources.map((s, i) => [s, i]));
  items.sort((a, b) => (order.get(a.source) ?? 0) - (order.get(b.source) ?? 0) || a.position - b.position);
  return { ...rest, items, lanes, errors, totalMs, timedOut };
}
