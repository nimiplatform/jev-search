import type { SourceId } from './sources';

export interface RankedItem {
  id: string;
  source: SourceId;
  title: string;
  url: string;
  snippet: string;
  /** Normalized API date, retaining its original precision. */
  publishedDate?: string;
  /** Hours since publication; day-only dates use a UTC midnight estimate. */
  ageHours: number | null;
  /**
   * Judged probability that the item is about what the user asked. Null until
   * judged, and it stays null when the judgment failed: never a stand-in 0.
   */
  relevance: number | null;
  /** True once relevance has been judged. */
  ranked: boolean;
  /** Why relevance could not be judged (failure, timeout or cancellation), with its reason code. */
  unscoredReason?: string;
  /** 0..1, newer is higher, relative to the chosen window. */
  freshness: number;
  /** Rank within its source after merging that source's lanes, 1-based. */
  position: number;
  /** Engines that returned this URL. */
  engines: string[];
}

/** Below this the judgment says "not about what you asked"; such rows are folded away, not deleted. */
export const OFF_TOPIC = 0.3;

export type RelevanceGroup = 'on-topic' | 'off-topic' | 'unscored';

/** Where a row belongs: judged on topic, judged off topic, or not judged (pending or failed). */
export function relevanceGroup(item: RankedItem): RelevanceGroup {
  if (!item.ranked || item.relevance === null) return 'unscored';
  return item.relevance >= OFF_TOPIC ? 'on-topic' : 'off-topic';
}

export type SortMode = 'best' | 'newest';

/**
 * Ordering is exactly what the row shows. Best match: the judged on-topic
 * percentage, ties broken by how many engines agreed, then engine rank.
 * Newest: known age first, ties by on-topic; unknown age goes last.
 * Rows without a judgment come after every judged row.
 */
export function compareItems(a: RankedItem, b: RankedItem, mode: SortMode): number {
  if (a.ranked !== b.ranked) return a.ranked ? -1 : 1; // unjudged rows wait at the bottom
  if (mode === 'newest') {
    const aa = a.ageHours ?? Number.POSITIVE_INFINITY;
    const bb = b.ageHours ?? Number.POSITIVE_INFINITY;
    if (aa !== bb) return aa - bb;
  }
  const ra = a.relevance === null ? -1 : Math.round(a.relevance * 100);
  const rb = b.relevance === null ? -1 : Math.round(b.relevance * 100);
  if (ra !== rb) return rb - ra;
  if (a.engines.length !== b.engines.length) return b.engines.length - a.engines.length;
  return a.position - b.position;
}


export interface Cluster {
  lead: RankedItem;
  others: RankedItem[];
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
export function clusterItems(items: RankedItem[], mode: SortMode = 'best'): Cluster[] {
  return clusterInOrder([...items].sort((a, b) => compareItems(a, b, mode)));
}

/**
 * Same grouping, but the lead order is the order given. Used while results
 * stream in so rows the reader has already seen do not move.
 */
export function clusterInOrder(items: RankedItem[]): Cluster[] {
  const byUrl = new Map<string, Cluster>();
  const byTitle = new Map<string, Cluster>();
  const clusters: Cluster[] = [];

  for (const item of items) {
    const urlKey = canonicalUrl(item.url);
    const tKey = titleKey(item.title);
    const existing = byUrl.get(urlKey) ?? (tKey ? byTitle.get(tKey) : undefined);
    if (existing) {
      existing.others.push(item);
      continue;
    }
    const cluster: Cluster = { lead: item, others: [] };
    clusters.push(cluster);
    byUrl.set(urlKey, cluster);
    if (tKey) byTitle.set(tKey, cluster);
  }
  return clusters;
}
