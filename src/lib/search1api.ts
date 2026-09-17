export interface Search1ApiConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface SearchParams {
  query: string;
  timeRange: 'day' | 'week' | 'month';
  includeSites?: string[];
  excludeSites?: string[];
  maxResults?: number;
}

export interface RawResult {
  title: string;
  link: string;
  snippet: string;
}

export class Search1ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'Search1ApiError';
    this.status = status;
  }
}

/**
 * One POST /search against Search1API's Google path. Source restriction is
 * done with `include_sites` / `exclude_sites`, recency with `time_range`.
 */
export async function search(
  config: Search1ApiConfig,
  params: SearchParams,
  signal?: AbortSignal
): Promise<RawResult[]> {
  const base = (config.baseUrl ?? 'https://api.search1api.com').replace(/\/$/, '');
  const response = await fetch(`${base}/search`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: params.query,
      search_service: 'google',
      time_range: params.timeRange,
      max_results: params.maxResults ?? 8,
      include_sites: params.includeSites ?? [],
      exclude_sites: params.excludeSites ?? [],
    }),
    signal,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Search1ApiError(response.status, text.slice(0, 300) || response.statusText);
  }
  const body = (await response.json()) as { results?: unknown };
  const results = Array.isArray(body.results) ? body.results : [];
  return results
    .filter(
      (r): r is RawResult =>
        typeof r === 'object' &&
        r !== null &&
        typeof (r as RawResult).link === 'string' &&
        typeof (r as RawResult).title === 'string'
    )
    .map((r) => ({ title: r.title, link: r.link, snippet: r.snippet ?? '' }));
}
