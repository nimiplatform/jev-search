import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Results, type ResultsStatus, type SearchFailure } from '@/components/results';
import { clusterInOrder, type Cluster, type RankedItem } from '@/lib/rank';
import { EMPTY_PLACEMENT, place } from '@/lib/stable-order';

function item(partial: Partial<RankedItem> & { id: string }): RankedItem {
  return {
    source: 'google', title: `Title ${partial.id}`, url: `https://example.com/${partial.id}`, snippet: 'Some content',
    ageHours: null, relevance: 0.9, ranked: true, freshness: 0.5, position: 1, engines: ['google'], ...partial,
  };
}

function render(clusters: Cluster[], status: ResultsStatus = 'done', failure: SearchFailure = null): string {
  return renderToStaticMarkup(createElement(Results, { clusters, status, failure }));
}

function renderResult(publication: Pick<RankedItem, 'publishedDate' | 'ageHours'>): string {
  return render([{ lead: item({ id: 'test', ...publication }), others: [] }]);
}

describe('result publication labels', () => {
  it('renders a day-only date as a calendar date with matching time semantics', () => {
    const html = renderResult({ publishedDate: '2026-09-18', ageHours: 12 });
    expect(html).toContain('<time dateTime="2026-09-18">2026-09-18</time>');
    expect(html).not.toContain('12h ago');
  });

  it('renders a timestamp as relative age while retaining the absolute time', () => {
    expect(renderResult({ publishedDate: '2026-09-18T10:00:00Z', ageHours: 2 }))
      .toContain('<time dateTime="2026-09-18T10:00:00Z">2h ago</time>');
  });

  it('omits the time label when unknown and supports snippet fallback ages', () => {
    expect(renderResult({ ageHours: null })).not.toContain('<time');
    expect(renderResult({ ageHours: 3 })).toContain('<time>3h ago</time>');
  });
});

describe('relevance on each row', () => {
  const unscored = item({
    id: 'unscored', relevance: null, ranked: false,
    unscoredReason: 'Timed out: the 30 s search budget ran out (BUDGET_EXCEEDED)',
  });

  it('shows the judged percentage', () => {
    expect(render([{ lead: item({ id: 'a', relevance: 0.84 }), others: [] }])).toContain('84% on topic');
  });

  it('says why a row was not judged, without a percentage', () => {
    const html = render([{ lead: unscored, others: [] }]);
    expect(html).toContain('Relevance not judged: Timed out: the 30 s search budget ran out (BUDGET_EXCEEDED)');
    expect(html).not.toContain('% on topic');
  });

  it('lists unjudged rows after judged on-topic rows and outside the off-topic fold', () => {
    const onTopic = item({ id: 'on', relevance: 0.9 });
    const offTopic = item({ id: 'off', relevance: 0.1 });
    // Display order as the page builds it: judged rows by score, unjudged rows after.
    const placement = place(EMPTY_PLACEMENT, [unscored, offTopic, onTopic], 'best', false);
    const byId = new Map([unscored, offTopic, onTopic].map((i) => [i.id, i]));
    const clusters = clusterInOrder(placement.order.map((id) => byId.get(id)!));
    const html = render(clusters);

    const on = html.indexOf('Title on');
    const notJudged = html.indexOf('Title unscored');
    const fold = html.indexOf('more that didn&#x27;t seem to match');
    expect(on).toBeGreaterThan(-1);
    expect(notJudged).toBeGreaterThan(on);
    expect(fold).toBeGreaterThan(notJudged);
    // The off-topic row is folded away; the unjudged row is not.
    expect(html).not.toContain('Title off');
    expect(html).toContain('Show 1 more');
  });

  it('still folds legitimately low scores', () => {
    const html = render([{ lead: item({ id: 'low', relevance: 0.05 }), others: [] }]);
    expect(html).toContain('Show 1 more');
    expect(html).not.toContain('Title low');
  });

  it('keeps the fold closed while results are still streaming', () => {
    const html = render([{ lead: item({ id: 'low', relevance: 0.05 }), others: [] }], 'streaming');
    expect(html).not.toContain('Show 1 more');
  });
});

describe('empty results', () => {
  it('does not present failed searches as zero results', () => {
    const html = render([], 'done', 'all');
    expect(html).toContain('Every search failed');
    expect(html).not.toContain('Nothing found');
  });

  it('distinguishes nothing found, a partial failure and a stopped search', () => {
    expect(render([], 'done')).toContain('Nothing found. Try a wider time range, or more sources.');
    expect(render([], 'done', 'some')).toContain('Nothing found in the sources that answered.');
    expect(render([], 'stopped')).toContain('Stopped before any results arrived.');
    expect(render([], 'streaming')).toBe('');
  });
});
