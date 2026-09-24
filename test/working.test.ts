import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SourceNotices } from '@/components/notices';
import { Working } from '@/components/working';
import type { AskState } from '@/lib/ask-session';
import type { IntentEvent, LaneEvent } from '@/lib/pipeline';
import { sourceProgress } from '@/lib/progress';
import type { RankedItem } from '@/lib/rank';
import { SOURCE_IDS, type SourceId } from '@/lib/sources';

function intent(sources: SourceId[]): IntentEvent {
  return {
    type: 'intent', request: 'Bun', query: 'Bun', entityQuery: 'Bun', candidates: ['Bun'],
    window: 'any', sources, intentMs: 100,
    inferred: {
      window: { choice: 'any', probability: 0.9 },
      sources: Object.fromEntries(SOURCE_IDS.map((id) => [id, 0.1])) as Record<SourceId, number>,
      query: null, entity: null,
    },
  };
}

function row(source: SourceId, id: string, relevance: number | null, unscoredReason?: string): RankedItem {
  return {
    id, source, title: id, url: `https://e.com/${id}`, snippet: '', ageHours: null,
    relevance, ranked: relevance !== null, freshness: 0.5, position: 1, engines: ['google'],
    ...(unscoredReason ? { unscoredReason } : {}),
  };
}

function lane(source: SourceId, engine: string, items: RankedItem[], error?: { message: string; code: string }): LaneEvent {
  return {
    type: 'lane', source, engine, items, stale: 0, searchMs: 100, scoreMs: 50,
    ...(error ? { error: error.message, errorCode: error.code } : {}),
  };
}

function state(partial: Partial<AskState>): AskState {
  return {
    phase: 'searching', taskId: 'task-1', intent: null, items: [], found: {}, lanes: {},
    totalMs: null, timedOut: false, error: null, ...partial,
  };
}

const render = (s: AskState) => renderToStaticMarkup(createElement(Working, { state: s }));

describe('search progress', () => {
  it('shows a stopped search as stopped and partial, with unfinished sources not complete', () => {
    const google = [row('google', 'a', 0.9), row('google', 'b', 0.1)];
    const s = state({
      phase: 'stopped',
      intent: intent(['google', 'reddit']),
      items: google,
      found: { 'google/google': 2, 'reddit/reddit': 4 },
      lanes: { 'google/google': lane('google', 'google', google) },
    });
    const html = render(s);
    expect(html).toContain('Stopped · partial results · 6 found · 1 answer you');
    expect(html).toContain('Google · 1 of 2 answer you');
    expect(html).toContain('Reddit · stopped before it finished (4 found so far)');
    expect(html).not.toContain('Reddit · 0 of');
    expect(html).toContain('Stopped · results so far are kept');
    expect(sourceProgress(s).map((p) => [p.id, p.status])).toEqual([['google', 'done'], ['reddit', 'unfinished']]);
  });

  it('marks a source with one failed engine as partial and counts rows that were not judged', () => {
    const rows = [row('reddit', 'a', 0.9), row('reddit', 'b', null, 'Provider unavailable (AI_PROVIDER_UNAVAILABLE)')];
    const s = state({
      phase: 'done',
      totalMs: 2_000,
      intent: intent(['reddit']),
      items: rows,
      found: { 'reddit/google': 0, 'reddit/reddit': 2 },
      lanes: {
        'reddit/google': lane('reddit', 'google', [], { message: 'upstream broke', code: 'SEARCH1API_HTTP_502' }),
        'reddit/reddit': lane('reddit', 'reddit', rows),
      },
    });
    const html = render(s);
    expect(html).toContain('Reddit · 1 of 2 answer you, 1 not judged · 1 of 2 searches failed');
    expect(html).toContain('1 answer you, 1 not judged');

    const notices = renderToStaticMarkup(createElement(SourceNotices, { progress: sourceProgress(s) }));
    expect(notices).toContain('Reddit answered in part');
    expect(notices).toContain('Google (reddit.com): upstream broke');
    expect(notices).toContain('Results from its other search are shown.');
  });

  it('says a source failed outright instead of reporting nothing there', () => {
    const s = state({
      phase: 'done',
      totalMs: 15_000,
      intent: intent(['google']),
      found: { 'google/google': 0 },
      lanes: { 'google/google': lane('google', 'google', [], { message: 'The operation was aborted due to timeout', code: 'TimeoutError' }) },
    });
    const html = render(s);
    expect(html).toContain('Asked Google · every search failed');
    expect(html).not.toContain('0 found');
    expect(html).toContain('Google didn&#x27;t answer');
    expect(html).not.toContain('nothing there');
    const notices = renderToStaticMarkup(createElement(SourceNotices, { progress: sourceProgress(s) }));
    expect(notices).toContain('Google didn&#x27;t answer');
    expect(notices).toContain('Google: The operation was aborted due to timeout');
  });

  it('gathers a missing Search1API key into one notice', () => {
    const notConfigured = { message: 'Search1API key is not configured', code: 'SEARCH1API_NOT_CONFIGURED' };
    const s = state({
      phase: 'done',
      intent: intent(['google', 'reddit']),
      found: { 'google/google': 0, 'reddit/google': 0, 'reddit/reddit': 0 },
      lanes: {
        'google/google': lane('google', 'google', [], notConfigured),
        'reddit/google': lane('reddit', 'google', [], notConfigured),
        'reddit/reddit': lane('reddit', 'reddit', [], notConfigured),
      },
    });
    const notices = renderToStaticMarkup(createElement(SourceNotices, { progress: sourceProgress(s) }));
    expect(notices.match(/Search1API key is not configured/g)).toHaveLength(1);
    expect(notices).not.toContain('answered in part');
  });

  it('reports a budget that ran out', () => {
    const s = state({ phase: 'done', totalMs: 30_000, timedOut: true, intent: intent(['google']), lanes: { 'google/google': lane('google', 'google', []) }, found: { 'google/google': 0 } });
    expect(render(s)).toContain('Done in 30.0s · the search budget ran out before everything finished');
  });

  it('shows nothing extra while all is well', () => {
    const s = state({ intent: intent(['google']) });
    expect(render(s)).toContain('Asking Google…');
    expect(renderToStaticMarkup(createElement(SourceNotices, { progress: sourceProgress(s) }))).toBe('');
  });
});
