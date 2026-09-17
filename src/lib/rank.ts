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
  /** Engine rank within its source, 1-based. */
  position: number;
}

export interface Weights {
  relevance: number;
  freshness: number;
  position: number;
}

export const DEFAULT_WEIGHTS: Weights = {
  relevance: 0.6,
  freshness: 0.3,
  position: 0.1,
};

/** Reciprocal-rank style prior: engine rank 1 → 1.0, rank 10 → ~0.55. */
export function positionScore(position: number): number {
  return 6 / (5 + position);
}

export function compositeScore(item: RankedItem, weights: Weights): number {
  const total = weights.relevance + weights.freshness + weights.position || 1;
  return (
    (item.relevance * weights.relevance +
      item.freshness * weights.freshness +
      positionScore(item.position) * weights.position) /
    total
  );
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

export function canonicalUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    u.search = '';
    let host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (host === 'twitter.com') host = 'x.com';
    const path = u.pathname.replace(/\/+$/, '').toLowerCase();
    return `${host}${path}`;
  } catch {
    return url;
  }
}

/**
 * Group near-duplicates (same URL or same normalized title) so one story does
 * not occupy five slots. Ordering is by the lead's composite score.
 */
export function clusterItems(items: RankedItem[], weights: Weights): Cluster[] {
  const scored = items
    .map((item) => ({ item, score: compositeScore(item, weights) }))
    .sort((a, b) => b.score - a.score);

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
