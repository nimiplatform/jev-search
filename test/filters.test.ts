import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Filters } from '@/components/filters';
import type { AskState } from '@/lib/ask-session';
import type { IntentEvent, LaneEvent } from '@/lib/pipeline';
import type { RankedItem } from '@/lib/rank';
import { SOURCE_IDS, type SourceId } from '@/lib/sources';

function intent(sources: SourceId[]): IntentEvent {
  return {
    type: 'intent', request: 'TypeSafe Jev news in the past 24 hours',
    query: 'TypeSafe Jev', entityQuery: 'TypeSafe Jev', candidates: ['TypeSafe Jev'],
    window: '24h', sources, intentMs: 100,
    inferred: {
      window: { choice: '24h', probability: 0.9 },
      sources: Object.fromEntries(SOURCE_IDS.map((id) => [id, sources.includes(id) ? 0.9 : 0.1])) as Record<SourceId, number>,
      query: null, entity: null,
    },
  };
}

function lane(source: SourceId, engine: string, items: RankedItem[], error?: string): LaneEvent {
  return { type: 'lane', source, engine, items, stale: 0, searchMs: 100, scoreMs: 0, ...(error ? { error } : {}) };
}

function row(source: SourceId, id: string): RankedItem {
  return { id, source, title: id, url: `https://e.com/${id}`, snippet: '', ageHours: null, relevance: 0.9, ranked: true, freshness: 0.5, position: 1, engines: ['google'] };
}

function render(state: Partial<AskState> & Pick<AskState, 'intent'>): string {
  const full: AskState = {
    phase: 'done', taskId: 'task-1', items: [], found: {}, lanes: {}, totalMs: 15_000, timedOut: false, error: null, ...state,
  };
  return renderToStaticMarkup(createElement(Filters, {
    state: full, explicitWindow: undefined, explicitSources: undefined,
    onWindow: () => undefined, onSources: () => undefined,
    onReset: () => undefined,
  }));
}

function renderGoogle(error?: string) {
  return render({
    intent: intent(['google']),
    found: { 'google/google': 0 },
    lanes: { 'google/google': lane('google', 'google', [], error) },
  });
}

describe('source result counts', () => {
  it('does not present a timed-out source as zero results', () => {
    const html = renderGoogle('The operation was aborted due to timeout');
    expect(html).toContain('Google: search failed');
    expect(html).not.toContain('>0</span>');
  });

  it('still displays zero for a successful search with no results', () => {
    const html = renderGoogle();
    expect(html).not.toContain('Google: search failed');
    expect(html).toContain('>0</span>');
  });

  it('marks a source where one engine failed even though another answered', () => {
    const html = render({
      intent: intent(['reddit']),
      items: [row('reddit', 'a'), row('reddit', 'b')],
      found: { 'reddit/google': 0, 'reddit/reddit': 2 },
      lanes: {
        'reddit/google': lane('reddit', 'google', [], 'upstream broke'),
        'reddit/reddit': lane('reddit', 'reddit', [row('reddit', 'a'), row('reddit', 'b')]),
      },
    });
    expect(html).toContain('Reddit, 2 results; 1 of 2 searches failed');
    expect(html).not.toContain('Reddit: search failed');
  });

  it('does not show a count for a source the user stopped before it finished', () => {
    const html = render({
      phase: 'stopped',
      intent: intent(['google', 'reddit']),
      items: [row('google', 'a')],
      found: { 'google/google': 1, 'reddit/google': 3 },
      lanes: { 'google/google': lane('google', 'google', [row('google', 'a')]) },
    });
    expect(html).toContain('Google, 1 results');
    expect(html).toContain('Reddit: stopped before it finished');
    expect(html).not.toContain('Reddit, ');
  });
});
