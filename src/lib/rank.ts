import type { SourceId } from './sources';

export interface RankedItem {
  id: string;
  source: SourceId;
  title: string;
  url: string;
  snippet: string;
  /** Hours since publication, when the snippet carried a date. */
  ageHours: number | null;
  /** Judge's probability that the item is about what the user asked. */
  relevance: number;
  /** 0..1, newer is higher, relative to the chosen window. */
  freshness: number;
  /** Rank within its source after merging that source's lanes, 1-based. */
  position: number;
  /** Engines that returned this URL. */
  engines: string[];
}

export interface Weights {
  relevance: number;
  freshness: number;
  position: number;
}

/** Best match: what the judge thinks first, then recency, then the engines' own order. */
export const DEFAULT_WEIGHTS: Weights = {
  relevance: 0.6,
  freshness: 0.3,
  position: 0.1,
};

/** Newest: only offered when a time window is set; still refuses off-topic rows first. */
export const NEWEST_WEIGHTS: Weights = {
  relevance: 0.35,
  freshness: 0.6,
  position: 0.05,
};

/**
 * Reciprocal-rank style prior: rank 1 → 0.83, rank 10 → 0.33, plus 0.15 for
 * every extra engine that also returned the URL (agreement is evidence).
 */
export function positionScore(position: number, engines = 1): number {
  return Math.min(1, 5 / (5 + position) + 0.15 * Math.max(0, engines - 1));
}

export function compositeScore(item: RankedItem, weights: Weights): number {
  const total = weights.relevance + weights.freshness + weights.position || 1;
  return (
    (item.relevance * weights.relevance +
      item.freshness * weights.freshness +
      positionScore(item.position, item.engines.length) * weights.position) /
    total
  );
}

/**
 * Reciprocal rank fusion of several engines' lists for one source. Same URL
 * from two engines becomes one row that remembers both engines.
 */
export function fuseLanes<T extends { link: string }>(
  lists: { engine: string; results: T[] }[],
  k = 60
): { result: T; engines: string[]; score: number }[] {
  const merged = new Map<string, { result: T; engines: string[]; score: number }>();
  for (const { engine, results } of lists) {
    results.forEach((result, index) => {
      const key = canonicalUrl(result.link);
      const row = merged.get(key);
      if (row) {
        row.score += 1 / (k + index + 1);
        if (!row.engines.includes(engine)) row.engines.push(engine);
      } else {
        merged.set(key, { result, engines: [engine], score: 1 / (k + index + 1) });
      }
    });
  }
  return [...merged.values()].sort((a, b) => b.score - a.score);
}

export interface Cluster {
  lead: RankedItem;
  others: RankedItem[];
  score: number;
}

const TITLE_NOISE = [
  /\s*[-|–—:]\s*(reddit|hacker news|github|x)\s*$/i,
  /\s*:\s*r\/[\w]+\s*(-\s*reddit)?\s*$/i,
  /\s*·\s*github\s*$/i,
  /\s*\/\s*x\s*$/i,
  /\s*on x:\s*/i,
];

export function titleKey(title: string): string {
  let t = title.toLowerCase();
  for (const re of TITLE_NOISE) t = t.replace(re, '');
  return t
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .slice(0, 8)
    .join(' ');
}

const TRACKING_PARAM = /^(utm_|ref$|ref_|fbclid|gclid|igshid|share_id|rdt|si$|feature$|lang$|s$|t$)/i;

/** Host + path + the query params that identify content (YouTube's `v`), minus tracking noise. */
export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    let host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'twitter.com') host = 'x.com';
    const path = u.pathname.replace(/\/+$/, '').toLowerCase();
    const params = [...u.searchParams.entries()]
      .filter(([k]) => !TRACKING_PARAM.test(k))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    return `${host}${path}${params ? `?${params}` : ''}`;
  } catch {
    return url;
  }
}

/**
 * Group near-duplicates (same URL or same normalized title) so one story does
 * not occupy five slots. Ordering is by the lead's composite score.
 */
export function clusterItems(items: RankedItem[], weights: Weights): Cluster[] {
  const sorted = [...items].sort(
    (a, b) => compositeScore(b, weights) - compositeScore(a, weights)
  );
  return clusterInOrder(sorted, weights);
}

/**
 * Same grouping, but the lead order is the order given. Used while results
 * stream in so rows the reader has already seen do not move.
 */
export function clusterInOrder(items: RankedItem[], weights: Weights): Cluster[] {
  const scored = items.map((item) => ({ item, score: compositeScore(item, weights) }));

  const byUrl = new Map<string, Cluster>();
  const byTitle = new Map<string, Cluster>();
  const clusters: Cluster[] = [];

  for (const { item, score } of scored) {
    const urlKey = canonicalUrl(item.url);
    const tKey = titleKey(item.title);
    const existing = byUrl.get(urlKey) ?? (tKey ? byTitle.get(tKey) : undefined);
    if (existing) {
      existing.others.push(item);
      continue;
    }
    const cluster: Cluster = { lead: item, others: [], score };
    clusters.push(cluster);
    byUrl.set(urlKey, cluster);
    if (tKey) byTitle.set(tKey, cluster);
  }
  return clusters;
}
