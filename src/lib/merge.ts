import { canonicalUrl, type RankedItem } from './rank';

/**
 * A judged relevance beats a missing one, and the higher of two judgments
 * wins. Only when neither row was judged does the merged row stay unjudged,
 * keeping a reason for it.
 */
function mergedRelevance(a: RankedItem, b: RankedItem): Pick<RankedItem, 'relevance' | 'ranked' | 'unscoredReason'> {
  const judged = [a, b].flatMap((item) => (item.ranked && item.relevance !== null ? [item.relevance] : []));
  if (judged.length > 0) return { relevance: Math.max(...judged), ranked: true };
  const reason = a.unscoredReason ?? b.unscoredReason;
  return { relevance: null, ranked: false, ...(reason ? { unscoredReason: reason } : {}) };
}

/**
 * Results now arrive one engine at a time. The same URL from a second
 * engine is folded into the row we already have: engines are unioned (the
 * agreement bonus in ranking comes from that), the higher judged relevance
 * wins, and the better rank is kept. Used by the client as lanes stream in
 * and by runSearch for tests.
 */
export function mergeItems(existing: RankedItem[], incoming: RankedItem[]): RankedItem[] {
  const byUrl = new Map<string, RankedItem>();
  const out: RankedItem[] = [];
  for (const item of existing) {
    byUrl.set(canonicalUrl(item.url), item);
    out.push(item);
  }
  for (const item of incoming) {
    const key = canonicalUrl(item.url);
    const found = byUrl.get(key);
    if (!found) {
      byUrl.set(key, item);
      out.push(item);
      continue;
    }
    // Keep the date, age and score from the same source. A structured API
    // date wins over a snippet estimate regardless of lane arrival order.
    const publication = (!found.publishedDate && item.publishedDate) || found.ageHours === null
      ? item : found;
    const { unscoredReason: _previousReason, ...rest } = found;
    const merged: RankedItem = {
      ...rest,
      engines: [...new Set([...found.engines, ...item.engines])],
      ...mergedRelevance(found, item),
      position: Math.min(found.position, item.position),
      publishedDate: publication.publishedDate,
      ageHours: publication.ageHours,
      freshness: publication.freshness,
      snippet: found.snippet.length >= item.snippet.length ? found.snippet : item.snippet,
    };
    byUrl.set(key, merged);
    out[out.indexOf(found)] = merged;
  }
  return out;
}
