import { createServerFn } from '@tanstack/react-start';
import { getRequestHeader, setResponseHeader } from '@tanstack/react-start/server';
import { runSearch, type SearchOutput } from '@/lib/pipeline';
import { isSourceId, isWindowId, type SourceId, type WindowId } from '@/lib/sources';
import { getEnv } from './env.server';

export interface SearchRequest {
  q: string;
  w?: WindowId;
  s?: SourceId[];
}

export type SearchResponse =
  | { ok: true; data: SearchOutput }
  | { ok: false; error: 'rate_limited' | 'bad_request' | 'upstream'; message: string };

function validateSearchRequest(input: unknown): SearchRequest {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Invalid input');
  }
  const { q, w, s } = input as Record<string, unknown>;
  if (typeof q !== 'string' || q.trim().length === 0 || q.length > 300) {
    throw new Error('q must be a non-empty string up to 300 characters');
  }
  const out: SearchRequest = { q: q.trim() };
  if (typeof w === 'string' && isWindowId(w)) out.w = w;
  if (Array.isArray(s)) {
    const ids = s.filter((v): v is SourceId => typeof v === 'string' && isSourceId(v));
    if (ids.length > 0) out.s = ids;
  }
  return out;
}

function clientKey(): string {
  return (
    getRequestHeader('cf-connecting-ip') ??
    getRequestHeader('x-forwarded-for')?.split(',')[0]?.trim() ??
    'anonymous'
  );
}

export const searchFn = createServerFn({ method: 'POST' })
  .validator(validateSearchRequest)
  .handler(async ({ data }): Promise<SearchResponse> => {
    setResponseHeader('Cache-Control', 'private, no-store');
    let env: ReturnType<typeof getEnv>;
    try {
      env = getEnv();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Missing configuration';
      return { ok: false, error: 'upstream', message };
    }

    if (env.SEARCH_RATE_LIMIT) {
      const { success } = await env.SEARCH_RATE_LIMIT.limit({ key: clientKey() });
      if (!success) {
        return {
          ok: false,
          error: 'rate_limited',
          message: 'Too many searches from this address. Try again in a minute.',
        };
      }
    }

    try {
      const result = await runSearch(
        {
          search1api: {
            apiKey: env.SEARCH1API_API_KEY,
            baseUrl: env.SEARCH1API_BASE_URL,
          },
          typesafe: { apiKey: env.TYPESAFE_API_KEY, model: env.TYPESAFE_MODEL },
        },
        { request: data.q, window: data.w, sources: data.s },
        AbortSignal.timeout(25_000)
      );

      env.FEEDBACK?.writeDataPoint({
        indexes: ['search'],
        blobs: [
          'search',
          result.request,
          result.query,
          result.window,
          result.sources.join(','),
          data.w ? 'user' : 'inferred',
          data.s ? 'user' : 'inferred',
        ],
        doubles: [
          result.items.length,
          result.timing.intentMs,
          result.timing.searchMs,
          result.timing.rerankMs,
          result.tokens,
        ],
      });

      return { ok: true, data: result };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Search failed';
      console.error('[search] failed', message);
      return { ok: false, error: 'upstream', message };
    }
  });

export interface FeedbackEvent {
  kind: 'click' | 'useful' | 'irrelevant';
  request: string;
  url: string;
  source: string;
  relevance: number;
  rank: number;
}

function validateFeedback(input: unknown): FeedbackEvent {
  if (typeof input !== 'object' || input === null) throw new Error('Invalid input');
  const e = input as Record<string, unknown>;
  const kind = e.kind;
  if (kind !== 'click' && kind !== 'useful' && kind !== 'irrelevant') {
    throw new Error('Invalid kind');
  }
  return {
    kind,
    request: String(e.request ?? '').slice(0, 300),
    url: String(e.url ?? '').slice(0, 500),
    source: String(e.source ?? '').slice(0, 20),
    relevance: Number(e.relevance) || 0,
    rank: Number(e.rank) || 0,
  };
}

export const feedbackFn = createServerFn({ method: 'POST' })
  .validator(validateFeedback)
  .handler(async ({ data }) => {
    let env: ReturnType<typeof getEnv>;
    try {
      env = getEnv();
    } catch {
      return { ok: false as const };
    }
    env.FEEDBACK?.writeDataPoint({
      indexes: [data.kind],
      blobs: [data.kind, data.request, data.url, data.source],
      doubles: [data.relevance, data.rank],
    });
    return { ok: true as const };
  });
