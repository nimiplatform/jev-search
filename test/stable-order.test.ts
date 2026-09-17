import { describe, expect, it } from 'vitest';
import { clusterInOrder, type RankedItem } from '@/lib/rank';

function item(id: string, relevance: number): RankedItem {
  return { id, source: 'google', title: id, url: `https://e.com/${id}`, snippet: '', ageHours: null, relevance, freshness: 0.5, position: 1, engines: ['google'] };
}

describe('clusterInOrder', () => {
  it('keeps the given order instead of sorting', () => {
    const clusters = clusterInOrder([item('low', 0.1), item('high', 0.9)]);
    expect(clusters.map((c) => c.lead.id)).toEqual(['low', 'high']);
  });
});
