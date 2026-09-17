import { describe, expect, it, vi } from 'vitest';
import { cacheKey, cachedSearch, cacheTtl, memoryCache } from '@/lib/cache';

describe('cachedSearch', () => {
  it('runs once, then serves the same params from the cache with a window-based ttl', async () => {
    const cache = memoryCache();
    const run = vi.fn(async () => [{ title: 't', link: 'https://a.com', snippet: 's' }]);
    const params = { query: 'Bun 1.3', service: 'google', timeRange: 'week' as const };
    const first = await cachedSearch(cache, params, run);
    const second = await cachedSearch(cache, { ...params, query: ' bun 1.3 ' }, run);
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(cacheTtl(params)).toBe(3600);
    expect(cacheKey(params)).not.toBe(cacheKey({ ...params, timeRange: 'day' }));
  });
  it('does not cache empty results', async () => {
    const cache = memoryCache();
    const run = vi.fn(async () => []);
    await cachedSearch(cache, { query: 'x', timeRange: undefined }, run);
    await cachedSearch(cache, { query: 'x', timeRange: undefined }, run);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
