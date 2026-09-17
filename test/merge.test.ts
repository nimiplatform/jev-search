import { describe, expect, it } from 'vitest';
import { mergeItems } from '@/lib/merge';
import type { RankedItem } from '@/lib/rank';

function item(partial: Partial<RankedItem> & { id: string; url: string }): RankedItem {
  return { source: 'google', title: 't', snippet: '', ageHours: null, relevance: 0.5, ranked: true, freshness: 0.5, position: 1, engines: ['google'], ...partial };
}

describe('mergeItems', () => {
  it('folds the same URL from a second engine into one row', () => {
    const a = item({ id: 'a', url: 'https://x.com/p/1', relevance: 0.6, position: 3, engines: ['google'] });
    const b = item({ id: 'b', url: 'https://www.x.com/p/1/', relevance: 0.9, position: 1, engines: ['duckduckgo'], ageHours: 5, freshness: 0.9 });
    const c = item({ id: 'c', url: 'https://x.com/p/2', engines: ['duckduckgo'] });
    const out = mergeItems([a], [b, c]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: 'a', relevance: 0.9, position: 1, engines: ['google', 'duckduckgo'], ageHours: 5, freshness: 0.9 });
    expect(out[1]!.id).toBe('c');
  });
});
