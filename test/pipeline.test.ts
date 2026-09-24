import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryCache } from '@/lib/cache';
import { askStream, runSearch, SearchFailedError, type AskEvent, type LaneEvent } from '@/lib/pipeline';
import { compareItems } from '@/lib/rank';
import { fakeDecide, relevanceResult, stubSearch1Api, type SearchCall } from './support/fakes';

const S1 = { apiKey: 's1' };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Reddit and a hair bun: the second shares a word with the request and nothing else. */
function bunRows(call: SearchCall) {
  if (call.body.search_service === 'reddit') {
    return [
      { title: 'Old thread', link: 'https://www.reddit.com/r/bun/old', snippet: 'Oct 10, 2025 · stale' },
      { title: 'Should I move away from Bun? - Reddit', link: 'https://reddit.com/r/bun/1/', snippet: '3 days ago ... runtime' },
    ];
  }
  return [
    { title: 'Should I move away from Bun? - Reddit', link: 'https://www.reddit.com/r/bun/1', snippet: '3 days ago ... runtime' },
    { title: 'Hair up in a bun : r/hair - Reddit', link: 'https://www.reddit.com/r/hair/2', snippet: '1 day ago ... hair' },
  ];
}

const onTopicUnlessHair = (result: { title: string }) => (result.title.startsWith('Hair') ? 0.05 : 0.95);

async function collect(stream: AsyncGenerator<AskEvent>): Promise<AskEvent[]> {
  const events: AskEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

describe('runSearch', () => {
  it('searches each lane once and judges each row once even when a caller repeats sources', async () => {
    const judge = fakeDecide();
    const calls = stubSearch1Api(() => [{ title: 'Bun discussion', link: 'https://reddit.com/r/bun/1', snippet: 'Bun runtime' }]);
    const out = await runSearch(
      { search1api: S1, decide: judge.decide, now: () => new Date('2026-09-18T18:30:00Z') },
      { request: 'Bun', sources: ['reddit', 'reddit', 'reddit'], window: 'any' }
    );

    expect(calls.map((c) => c.body.search_service).sort()).toEqual(['google', 'reddit']);
    // One intent judgment, then one relevance judgment per row of each lane.
    expect(judge.intentCalls()).toHaveLength(1);
    expect(judge.relevanceCalls()).toHaveLength(2);
    expect(out.sources).toEqual(['reddit']);
    expect(out.lanes).toHaveLength(2);
    expect(out.items).toHaveLength(1);
    expect(out.items[0]).toMatchObject({ relevance: 0.9, ranked: true });
    expect(out).not.toHaveProperty('tokens');
    expect(out).not.toHaveProperty('judge');
  });

  it('carries API dates through filtering, judging and Newest sorting', async () => {
    stubSearch1Api(() => [
      { title: 'Old', link: 'https://a.com/old', snippet: '1 hour ago ... misleading', published_date: '2025-01-01' },
      { title: 'Day only', link: 'https://a.com/day', snippet: 'plain', published_date: '2026-09-17' },
      { title: 'Recent', link: 'https://a.com/recent', snippet: '3 days ago ... misleading', published_date: '2026-09-18T17:30:00Z' },
      { title: 'Unknown', link: 'https://a.com/unknown', snippet: 'plain', published_date: null },
    ]);
    const out = await runSearch(
      { search1api: S1, decide: fakeDecide().decide, now: () => new Date('2026-09-18T18:30:00Z') },
      { request: 'Bun', sources: ['google'], window: '24h' }
    );
    expect(out.lanes[0]!.stale).toBe(1);
    expect(out.items).toHaveLength(3);
    expect(out.items.find((i) => i.title === 'Day only')).toMatchObject({ publishedDate: '2026-09-17', ageHours: 42.5 });
    const recent = out.items.find((i) => i.title === 'Recent')!;
    expect(recent).toMatchObject({ publishedDate: '2026-09-18T17:30:00Z', ageHours: 1 });
    expect(recent.freshness).toBeCloseTo(23 / 24);
    expect([...out.items].sort((a, b) => compareItems(a, b, 'newest')).map((i) => i.title))
      .toEqual(['Recent', 'Day only', 'Unknown']);
  });

  it('recomputes age from the cached absolute publication time', async () => {
    const calls = stubSearch1Api(() => [
      { title: 'Recent', link: 'https://a.com', snippet: '1 hour ago ... text', published_date: '2026-09-18T17:00:00Z' },
    ]);
    let now = new Date('2026-09-18T18:00:00Z');
    const deps = { search1api: S1, decide: fakeDecide().decide, cache: memoryCache(), now: () => now };
    const input = { request: 'Bun', sources: ['google' as const], window: 'any' as const };
    expect((await runSearch(deps, input)).items[0]!.ageHours).toBe(1);
    now = new Date('2026-09-18T18:30:00Z');
    expect((await runSearch(deps, input)).items[0]!.ageHours).toBe(1.5);
    expect(calls).toHaveLength(1);
  });

  it('infers window and sources, picks the stripped query, and judges each result', async () => {
    const calls = stubSearch1Api(bunRows);
    const judge = fakeDecide({
      intent: {
        window: { choice: '7d', probability: 0.8 },
        sources: { reddit: 0.9 },
        query: { choice: 'c1', probability: 0.8 },
        entity: { choice: 'c0', probability: 0.9 },
      },
      relevance: onTopicUnlessHair,
    });
    const out = await runSearch(
      { search1api: S1, decide: judge.decide, now: () => new Date('2026-09-17T00:00:00Z') },
      { request: 'what are people saying about Bun 1.3 this week' }
    );

    expect(out.window).toBe('7d');
    expect(out.sources).toEqual(['reddit']);
    expect(out.query).toBe('Bun 1.3');
    expect(out.inferred.window).toEqual({ choice: '7d', probability: 0.8 });
    expect(out.inferred.sources.reddit).toBe(0.9);
    expect(out.inferred.query).toEqual({ index: 1, probability: 0.8 });

    const searchCalls = calls.filter((c) => c.body.query === 'Bun 1.3' && c.body.time_range === 'week');
    expect(searchCalls.map((c) => c.body.search_service).sort()).toEqual(['google', 'reddit']);
    expect(searchCalls.find((c) => c.body.search_service === 'reddit')!.body).toMatchObject({ include_sites: [], exclude_sites: [] });
    expect(searchCalls.find((c) => c.body.search_service === 'google')!.body).toMatchObject({
      query: 'Bun 1.3',
      time_range: 'week',
      include_sites: ['reddit.com'],
    });

    // Lanes folded by URL: the shared URL is one row with both engines; the
    // stale reddit row (Oct 2025) is outside the window and dropped.
    expect(out.items).toHaveLength(2);
    expect(out.items[0]).toMatchObject({ relevance: 0.95, ranked: true, ageHours: 72, snippet: 'runtime' });
    expect(out.items[0]!.engines.sort()).toEqual(['google', 'reddit']);
    expect(out.items[1]).toMatchObject({ relevance: 0.05, ranked: true, ageHours: 24, engines: ['google'] });
    expect(out.lanes.find((l) => l.engine === 'reddit')).toMatchObject({ stale: 1 });
    // Each result is judged in its own request: three rows, three judgments.
    expect(judge.relevanceCalls().map((c) => (c.spec.state as { json: { result: { title: string } } }).json.result.title).sort())
      .toEqual(['Hair up in a bun : r/hair - Reddit', 'Should I move away from Bun? - Reddit', 'Should I move away from Bun? - Reddit']);
    expect(judge.relevanceCalls()[0]!.spec.state).toMatchObject({
      json: { request: 'what are people saying about Bun 1.3 this week', result: { source: 'reddit' } },
    });
  });

  it('respects explicit window and sources', async () => {
    const calls = stubSearch1Api(bunRows);
    const out = await runSearch(
      { search1api: S1, decide: fakeDecide().decide },
      { request: 'Bun 1.3', window: '24h', sources: ['google', 'duckduckgo', 'github'] }
    );
    expect(out.window).toBe('24h');
    expect(out.sources).toEqual(['google', 'duckduckgo', 'github']);
    // 4 lanes; the explicit 24h window rules out reusing a speculative google call, so none is made.
    expect(calls).toHaveLength(4);
    const web = calls.filter((c) => ['google', 'duckduckgo'].includes(String(c.body.search_service)) && (c.body.include_sites as string[]).length === 0 && 'time_range' in c.body);
    const gh = calls.filter((c) => (c.body.include_sites as string[])[0] === 'github.com' || c.body.search_service === 'github');
    expect(web.map((c) => c.body.search_service).sort()).toEqual(['duckduckgo', 'google']);
    expect(web[0]!.body).toMatchObject({ time_range: 'day', exclude_sites: [] });
    expect(gh.map((c) => c.body.search_service).sort()).toEqual(['github', 'google']);
  });

  it('searches Hacker News through Google site and the native news endpoint only', async () => {
    const calls = stubSearch1Api(() => [{ title: 'SQLite discussion', link: 'https://news.ycombinator.com/item?id=1', snippet: 'SQLite' }]);
    const out = await runSearch(
      { search1api: S1, decide: fakeDecide().decide },
      { request: 'SQLite', sources: ['hackernews'], window: '30d' }
    );
    expect(calls).toHaveLength(2);
    expect(calls.find((c) => c.url.endsWith('/news'))!.body).toMatchObject({
      search_service: 'hackernews', time_range: 'month', include_sites: [], exclude_sites: [],
    });
    expect(calls.find((c) => c.url.endsWith('/search'))!.body).toMatchObject({
      search_service: 'google', include_sites: ['news.ycombinator.com'],
    });
    expect(out.sources).toEqual(['hackernews']);
    expect(out.items[0]!.engines.sort()).toEqual(['google', 'hackernews']);
  });

  it('uses the vertical engine for vertical sources', async () => {
    const calls = stubSearch1Api(bunRows);
    await runSearch({ search1api: S1, decide: fakeDecide().decide }, { request: 'LLM agents', sources: ['arxiv'] });
    const arxiv = calls.filter((c) => c.body.search_service === 'arxiv');
    expect(arxiv[0]!.body).toMatchObject({ search_service: 'arxiv', include_sites: [], exclude_sites: [] });
  });

  it('sends no time filter for Any time, and never to engines that reject it', async () => {
    let calls = stubSearch1Api(bunRows);
    const out = await runSearch(
      { search1api: S1, decide: fakeDecide().decide },
      { request: 'Oppenheimer', window: 'any', sources: ['google', 'imdb'] }
    );
    expect(calls.every((c) => !('time_range' in c.body))).toBe(true);
    // Any time + words unchanged: the speculative google call is the google lane.
    expect(calls.filter((c) => c.body.search_service === 'google')).toHaveLength(1);
    // Any time: the stale row is kept and freshness is flat.
    expect(out.items.every((i) => i.freshness === 0.5)).toBe(true);

    calls = stubSearch1Api(bunRows);
    await runSearch(
      { search1api: S1, decide: fakeDecide().decide },
      { request: 'Oppenheimer', window: '7d', sources: ['google', 'imdb'] }
    );
    expect(calls.filter((c) => c.body.search_service === 'imdb').every((c) => !('time_range' in c.body))).toBe(true);
    // The google lane carries the window; the speculative call (no window) is dropped.
    expect(calls.filter((c) => c.body.search_service === 'google' && 'time_range' in c.body).map((c) => c.body.time_range)).toEqual(['week']);
  });

  it('keeps going when one source fails', async () => {
    stubSearch1Api((call) =>
      (call.body.include_sites as string[])[0] === 'github.com' || call.body.search_service === 'github'
        ? new Response('upstream broke', { status: 502 })
        : bunRows(call)
    );
    const judge = fakeDecide({ intent: { window: { choice: '7d', probability: 0.8 } } });
    const out = await runSearch({ search1api: S1, decide: judge.decide }, { request: 'Bun 1.3', sources: ['reddit', 'github'] });
    expect(out.errors.map((e) => e.engine).sort()).toEqual(['github', 'google']);
    expect(out.errors.every((e) => e.source === 'github' && e.message === 'upstream broke' && e.code === 'SEARCH1API_HTTP_502')).toBe(true);
    expect(out.totalMs).toBeGreaterThanOrEqual(0);
    expect(out.timedOut).toBe(false);
    expect(out.items.map((i) => i.source)).toEqual(['reddit', 'reddit']);
  });

  it('keeps the rows of a source whose other engine failed', async () => {
    stubSearch1Api((call) => {
      if ((call.body.include_sites as string[])[0] === 'github.com') return new Response('upstream broke', { status: 502 });
      if (call.body.search_service === 'github') {
        return [{ title: 'oven-sh/bun', link: 'https://github.com/oven-sh/bun', snippet: 'Bun runtime' }];
      }
      return bunRows(call);
    });
    const out = await runSearch({ search1api: S1, decide: fakeDecide().decide }, { request: 'Bun 1.3', sources: ['reddit', 'github'] });
    expect(out.errors).toEqual([{ source: 'github', engine: 'google', message: 'upstream broke', code: 'SEARCH1API_HTTP_502' }]);
    expect(out.items.find((i) => i.source === 'github')).toMatchObject({ url: 'https://github.com/oven-sh/bun', ranked: true });
  });
});

describe('relevance judgments', () => {
  it('leaves a row unjudged with its reason when its judgment fails, never scoring it 0', async () => {
    stubSearch1Api(bunRows);
    const judge = fakeDecide({
      relevance: (result) => {
        if (result.title.startsWith('Hair')) {
          throw Object.assign(new Error('Provider unavailable'), { reasonCode: 'AI_PROVIDER_UNAVAILABLE' });
        }
        return 0.95;
      },
    });
    const out = await runSearch({ search1api: S1, decide: judge.decide }, { request: 'Bun', sources: ['google'], window: 'any' });
    const hair = out.items.find((i) => i.title.startsWith('Hair'))!;
    expect(hair).toMatchObject({ ranked: false, relevance: null, unscoredReason: 'Provider unavailable (AI_PROVIDER_UNAVAILABLE)' });
    expect(out.items.find((i) => i.title.startsWith('Should'))).toMatchObject({ ranked: true, relevance: 0.95 });
    expect(out.items.find((i) => i.title.startsWith('Should'))).not.toHaveProperty('unscoredReason');
    // A judgment failure is not a search failure.
    expect(out.errors).toEqual([]);
  });

  it.each([
    [
      'an SDK timeout',
      { name: 'NimiError', code: 'OPERATION_TIMEOUT', message: 'Operation timed out' },
      'Timed out: the 30 s search budget ran out (OPERATION_TIMEOUT)',
      true,
    ],
    [
      'an SDK abort',
      { name: 'NimiError', code: 'OPERATION_ABORTED', message: 'Operation aborted' },
      'Canceled before it was judged (OPERATION_ABORTED)',
      false,
    ],
    [
      'input the SDK refused',
      { name: 'NimiError', code: 'SDK_LOCAL_APP_INPUT_INVALID', message: 'questions[0].id is too long' },
      'questions[0].id is too long (SDK_LOCAL_APP_INPUT_INVALID)',
      false,
    ],
    [
      'a runtime failure, by its reason code',
      { name: 'NimiError', code: 'RUNTIME_ERROR', reasonCode: 'AI_OUTPUT_INVALID', message: 'Model output did not match the spec' },
      'Model output did not match the spec (AI_OUTPUT_INVALID)',
      false,
    ],
  ])('reports %s as the row reason', async (_name, thrown, reason, timedOut) => {
    stubSearch1Api(bunRows);
    const judge = fakeDecide({
      relevanceResult: async () => {
        throw Object.assign(new Error(thrown.message), thrown);
      },
    });
    const out = await runSearch({ search1api: S1, decide: judge.decide }, { request: 'Bun', sources: ['google'], window: 'any' });
    expect(out.items.map((i) => [i.ranked, i.relevance, i.unscoredReason])).toEqual([
      [false, null, reason],
      [false, null, reason],
    ]);
    expect(out.timedOut).toBe(timedOut);
  });

  it('treats an answer that does not fit the question as a failed judgment', async () => {
    stubSearch1Api(bunRows);
    const judge = fakeDecide({
      relevanceResult: async () => ({ type: 'text-decide', answers: [], traceId: 't' }),
    });
    const out = await runSearch({ search1api: S1, decide: judge.decide }, { request: 'Bun', sources: ['google'], window: 'any' });
    expect(out.items).toHaveLength(2);
    for (const item of out.items) {
      expect(item.ranked).toBe(false);
      expect(item.relevance).toBeNull();
      expect(item.unscoredReason).toBe('No answer for question relevant (DECISION_ANSWER_INVALID)');
    }
  });

  it('judges at most four rows of a lane at a time', async () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({ title: `Row ${i}`, link: `https://a.com/${i}`, snippet: 'Bun' }));
    stubSearch1Api(() => rows);
    let active = 0;
    let peak = 0;
    const judge = fakeDecide({
      relevance: async () => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return 0.8;
      },
    });
    const out = await runSearch({ search1api: S1, decide: judge.decide }, { request: 'Bun', sources: ['google'], window: 'any' });
    expect(judge.relevanceCalls()).toHaveLength(8);
    expect(peak).toBe(4);
    expect(out.items.every((i) => i.ranked)).toBe(true);
  });

  it('announces the rows unjudged before their judgments arrive', async () => {
    stubSearch1Api(bunRows);
    const events = await collect(
      askStream({ search1api: S1, decide: fakeDecide({ relevance: onTopicUnlessHair }).decide }, { request: 'Bun', sources: ['google'], window: 'any' })
    );
    expect(events.map((e) => e.type)).toEqual(['intent', 'found', 'lane', 'done']);
    const found = events[1] as Extract<AskEvent, { type: 'found' }>;
    expect(found.items.every((i) => i.ranked === false && i.relevance === null && !('unscoredReason' in i))).toBe(true);
    const lane = events[2] as LaneEvent;
    expect(lane.items.map((i) => i.relevance)).toEqual([0.95, 0.05]);
    expect(events[3]).toEqual({ type: 'done', totalMs: expect.any(Number), timedOut: false });
    expect(events[0]).not.toHaveProperty('judge');
  });
});

describe('failures are reported, not papered over', () => {
  it('fails every lane with a clear reason when Search1API is not configured', async () => {
    const calls = stubSearch1Api(bunRows);
    const judge = fakeDecide();
    const out = await runSearch({ decide: judge.decide }, { request: 'Bun 1.3' });
    expect(calls).toEqual([]);
    expect(judge.intentCalls()).toHaveLength(1);
    expect(judge.relevanceCalls()).toHaveLength(0);
    expect(out.items).toEqual([]);
    expect(out.errors.length).toBe(out.sources.length);
    expect(out.errors.every((e) => e.message === 'Search1API key is not configured' && e.code === 'SEARCH1API_NOT_CONFIGURED')).toBe(true);
  });

  it('ends with an error event when the intent judgment fails, searching nothing further', async () => {
    const calls = stubSearch1Api(bunRows);
    const judge = fakeDecide({
      intent: async () => {
        throw Object.assign(new Error('Local AI is not configured'), { reasonCode: 'AI_LOCAL_CONFIGURATION_NOT_CONFIGURED' });
      },
    });
    const events = await collect(askStream({ search1api: S1, decide: judge.decide }, { request: 'Bun 1.3 news' }));
    expect(events).toEqual([
      { type: 'error', code: 'AI_LOCAL_CONFIGURATION_NOT_CONFIGURED', message: 'Could not interpret the request: Local AI is not configured' },
    ]);
    // Only the speculative Google call went out; no lane was started.
    expect(calls.map((c) => c.body)).toEqual([expect.objectContaining({ search_service: 'google', query: 'Bun 1.3 news' })]);
    expect(judge.relevanceCalls()).toHaveLength(0);
  });

  it('reports an SDK timeout while reading the request as running out of time', async () => {
    stubSearch1Api(bunRows);
    const judge = fakeDecide({
      intent: async () => {
        throw Object.assign(new Error('Operation timed out'), { name: 'NimiError', code: 'OPERATION_TIMEOUT' });
      },
    });
    const events = await collect(askStream({ search1api: S1, decide: judge.decide }, { request: 'Bun' }));
    expect(events).toEqual([
      { type: 'error', code: 'OPERATION_TIMEOUT', message: 'Timed out reading the request: the 30 s search budget ran out.' },
    ]);
  });

  it('does not stand explicit choices in for a failed intent judgment', async () => {
    stubSearch1Api(bunRows);
    const judge = fakeDecide({ intent: async () => ({ type: 'text-decide', answers: [], traceId: 't' }) });
    const failure = runSearch({ search1api: S1, decide: judge.decide }, { request: 'Bun', window: '7d', sources: ['reddit'] });
    await expect(failure).rejects.toBeInstanceOf(SearchFailedError);
    await expect(failure).rejects.toMatchObject({
      code: 'DECISION_ANSWER_INVALID',
      message: 'Could not interpret the request: No answer for question window',
    });
    expect(judge.relevanceCalls()).toHaveLength(0);
  });

  it('uses the request itself as the query when there is only one candidate', async () => {
    const calls = stubSearch1Api(bunRows);
    const judge = fakeDecide();
    const out = await runSearch({ search1api: S1, decide: judge.decide }, { request: 'Bun', sources: ['duckduckgo'], window: 'any' });
    expect(judge.intentCalls()[0]!.spec.questions.map((q) => q.id)).not.toContain('query');
    expect(out.query).toBe('Bun');
    expect(out.inferred.query).toBeNull();
    expect(calls.find((c) => c.body.search_service === 'duckduckgo')!.body.query).toBe('Bun');
  });

  it('throws when the caller cancels, and cancels the decisions in flight', async () => {
    stubSearch1Api(bunRows);
    const controller = new AbortController();
    const signals: AbortSignal[] = [];
    const judge = fakeDecide({
      intent: async (_spec, options) => {
        signals.push(options.signal!);
        controller.abort(new DOMException('Stopped', 'AbortError'));
        return new Promise(() => undefined);
      },
    });
    await expect(runSearch({ search1api: S1, decide: judge.decide }, { request: 'Bun' }, { signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(signals[0]!.aborted).toBe(true);
  });

  it('keeps a judged 0 as a real answer', async () => {
    stubSearch1Api(bunRows);
    const judge = fakeDecide({ relevanceResult: async () => relevanceResult(0) });
    const out = await runSearch({ search1api: S1, decide: judge.decide }, { request: 'Bun', sources: ['google'], window: 'any' });
    // 0 is a real answer here, so the rows are judged, off topic.
    expect(out.items.every((i) => i.ranked && i.relevance === 0)).toBe(true);
  });
});
