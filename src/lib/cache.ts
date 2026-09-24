import type { RawResult, SearchParams } from './search1api';

/** A small key-value store with expiry; `memoryCache` is the app's own. */
export interface ResultCache {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

/** How long a lane's rows stay fresh, by how recent the user wants them. */
const TTL_SECONDS: Record<string, number> = {
  day: 10 * 60,
  week: 60 * 60,
  month: 2 * 60 * 60,
  any: 6 * 60 * 60,
};

export function cacheKey(params: SearchParams): string {
  return [
    'v2', // v1 discarded published_date before caching results.
    params.service ?? 'google',
    params.query.trim().toLowerCase(),
    params.timeRange ?? 'any',
    (params.includeSites ?? []).join(','),
    (params.excludeSites ?? []).join(','),
    params.maxResults ?? 8,
  ].join('|');
}

export function cacheTtl(params: SearchParams): number {
  return TTL_SECONDS[params.timeRange ?? 'any'] ?? TTL_SECONDS.any!;
}

export async function cachedSearch(
  cache: ResultCache | undefined,
  params: SearchParams,
  run: () => Promise<RawResult[]>
): Promise<{ results: RawResult[]; cached: boolean }> {
  if (!cache) return { results: await run(), cached: false };
  const key = cacheKey(params);
  try {
    const hit = await cache.get(key);
    if (hit) return { results: JSON.parse(hit) as RawResult[], cached: true };
  } catch {
    // A broken cache must never break a search.
  }
  const results = await run();
  if (results.length > 0) {
    await cache.put(key, JSON.stringify(results), { expirationTtl: cacheTtl(params) }).catch(() => undefined);
  }
  return { results, cached: false };
}

export const MEMORY_CACHE_ENTRIES = 500;

/**
 * The app-owned cache, kept in the desktop host's memory for the life of the
 * process. Entries expire after their `expirationTtl`; past `maxEntries` the
 * oldest write is dropped first.
 */
export function memoryCache(
  options: { maxEntries?: number; now?: () => number } = {}
): ResultCache & { readonly size: number } {
  const maxEntries = options.maxEntries ?? MEMORY_CACHE_ENTRIES;
  const now = options.now ?? (() => Date.now());
  const map = new Map<string, { value: string; expiresAt: number }>();
  return {
    get: async (key) => {
      const entry = map.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= now()) {
        map.delete(key);
        return null;
      }
      return entry.value;
    },
    put: async (key, value, putOptions) => {
      const ttl = putOptions?.expirationTtl;
      map.delete(key); // Re-insert so eviction order follows the latest write.
      map.set(key, { value, expiresAt: ttl === undefined ? Number.POSITIVE_INFINITY : now() + ttl * 1000 });
      while (map.size > maxEntries) {
        const oldest = map.keys().next();
        if (oldest.done) break;
        map.delete(oldest.value);
      }
    },
    get size() {
      return map.size;
    },
  };
}
