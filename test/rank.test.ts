import { describe, expect, it } from 'vitest';
import { DEFAULT_WEIGHTS, canonicalUrl, clusterItems, compositeScore, titleKey, type RankedItem } from '@/lib/rank';

function item(partial: Partial<RankedItem> & { id: string }): RankedItem {
  return {
    source: 'web',
    title: 'Title',
    url: `https://example.com/${partial.id}`,
    snippet: '',
    ageHours: null,
    relevance: 0.5,
    freshness: 0.5,
    position: 1,
    ...partial,
  };
}

describe('titleKey', () => {
  it('drops site suffixes', () => {
    expect(titleKey('Should I move away from Bun? - Reddit')).toBe(titleKey('Should I move away from Bun?'));
    expect(titleKey('Bear 2.10: Hello SiriAI : r/bearapp - Reddit')).toBe('bear 2 10 hello siriai');
  });
});

describe('canonicalUrl', () => {
  it('normalizes host, trailing slash and query', () => {
    expect(canonicalUrl('https://www.reddit.com/r/bun/comments/1/x/?utm=1#top')).toBe(
      'reddit.com/r/bun/comments/1/x'
    );
    expect(canonicalUrl('https://twitter.com/a/status/1')).toBe('x.com/a/status/1');
  });
});

describe('clusterItems', () => {
  it('orders by composite and groups duplicates', () => {
    const a = item({ id: 'a', relevance: 0.9, title: 'Bun 1.3 released' });
    const b = item({ id: 'b', relevance: 0.2, title: 'Hair bun tutorial' });
    const c = item({ id: 'c', relevance: 0.8, title: 'Bun 1.3 released - Reddit', url: 'https://reddit.com/x' });
    const clusters = clusterItems([b, a, c], DEFAULT_WEIGHTS);
    expect(clusters.map((cl) => cl.lead.id)).toEqual(['a', 'b']);
    expect(clusters[0]!.others.map((o) => o.id)).toEqual(['c']);
    expect(compositeScore(a, DEFAULT_WEIGHTS)).toBeGreaterThan(compositeScore(b, DEFAULT_WEIGHTS));
  });
});
