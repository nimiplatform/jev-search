import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { askStream, runSearch, type AskEvent, type LaneEvent } from '@/lib/pipeline';
import { answerIntent, fakeDecide, stubSearch1Api, untilAborted, type SearchCall } from './support/fakes';

const S1 = { apiKey: 's1' };

function rows(call: SearchCall) {
  return [
    { title: `${String(call.body.search_service)} one`, link: `https://${String(call.body.search_service)}.example/1`, snippet: 'Bun' },
    { title: `${String(call.body.search_service)} two`, link: `https://${String(call.body.search_service)}.example/2`, snippet: 'Bun' },
  ];
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function consume(stream: AsyncGenerator<AskEvent>) {
  const events: AskEvent[] = [];
  const finished = (async () => {
    for await (const event of stream) events.push(event);
  })();
  return { events, finished };
}

describe('the 30 s search budget', () => {
  it('gives the intent judgment the whole budget as its timeout', async () => {
    stubSearch1Api(rows);
    const judge = fakeDecide();
    await runSearch({ search1api: S1, decide: judge.decide }, { request: 'Bun', sources: ['google'], window: 'any' });
    expect(judge.intentCalls()[0]!.options.timeoutMs).toBe(30_000);
  });

  it('gives each relevance judgment the time left in the budget', async () => {
    stubSearch1Api(rows);
    const judge = fakeDecide({
      intent: async (spec) => {
        await new Promise((resolve) => setTimeout(resolve, 5_000));
        return answerIntent(spec);
      },
    });
    const run = runSearch({ search1api: S1, decide: judge.decide }, { request: 'Bun', sources: ['google'], window: 'any' });
    await vi.advanceTimersByTimeAsync(5_000);
    const out = await run;
    expect(judge.relevanceCalls().map((c) => c.options.timeoutMs)).toEqual([25_000, 25_000]);
    expect(out.items.every((i) => i.ranked)).toBe(true);
  });

  it('stops waiting for judgments when the budget runs out and leaves those rows unjudged', async () => {
    stubSearch1Api(rows);
    // Ignores both its signal and its timeout: the pipeline still stops at 30 s.
    const judge = fakeDecide({ relevance: () => new Promise<number>(() => undefined) });
    const { events, finished } = consume(
      askStream({ search1api: S1, decide: judge.decide }, { request: 'Bun', sources: ['google'], window: 'any' })
    );
    await vi.advanceTimersByTimeAsync(29_999);
    expect(events.map((e) => e.type)).toEqual(['intent', 'found']);

    await vi.advanceTimersByTimeAsync(1);
    await finished;
    const lane = events.find((e): e is LaneEvent => e.type === 'lane')!;
    expect(lane.error).toBeUndefined();
    expect(lane.items).toHaveLength(2);
    for (const item of lane.items) {
      expect(item).toMatchObject({
        ranked: false,
        relevance: null,
        unscoredReason: 'Timed out: the 30 s search budget ran out (BUDGET_EXCEEDED)',
      });
    }
    expect(events.at(-1)).toEqual({ type: 'done', totalMs: 30_000, timedOut: true });
    // Each judgment was given the time left, and is told to stop once the search is over.
    for (const call of judge.relevanceCalls()) {
      expect(call.options.timeoutMs).toBe(30_000);
      expect(call.options.signal?.aborted).toBe(true);
    }
  });

  it('ends with an error when reading the request outlives the budget', async () => {
    const calls = stubSearch1Api(rows);
    const judge = fakeDecide({ intent: () => new Promise(() => undefined) });
    const { events, finished } = consume(askStream({ search1api: S1, decide: judge.decide }, { request: 'Bun news' }));
    await vi.advanceTimersByTimeAsync(30_000);
    await finished;
    expect(events).toEqual([
      { type: 'error', code: 'BUDGET_EXCEEDED', message: 'Timed out reading the request: the 30 s search budget ran out.' },
    ]);
    expect(judge.relevanceCalls()).toHaveLength(0);
    // The speculative Google call is the only search, and it is cancelled with the stream.
    expect(calls).toHaveLength(1);
  });

  it('fails a stalled engine at its 15 s deadline while the other lanes finish', async () => {
    // Node's native AbortSignal timer does not use the fake clock.
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException('The operation was aborted due to timeout', 'TimeoutError')), ms);
      return controller.signal;
    });
    stubSearch1Api((call, init) => (call.body.search_service === 'duckduckgo' ? untilAborted<Response>(init?.signal ?? undefined) : rows(call)));
    const { events, finished } = consume(
      askStream({ search1api: S1, decide: fakeDecide().decide }, { request: 'Bun', sources: ['google', 'duckduckgo'], window: 'any' })
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(events.map((e) => e.type)).toEqual(['intent', 'found', 'lane']);

    await vi.advanceTimersByTimeAsync(15_000);
    await finished;
    const failed = events.find((e): e is LaneEvent => e.type === 'lane' && e.engine === 'duckduckgo')!;
    expect(failed).toMatchObject({
      items: [],
      error: 'The operation was aborted due to timeout',
      errorCode: 'TimeoutError',
      searchMs: 15_000,
    });
    expect(events.at(-1)).toEqual({ type: 'done', totalMs: 15_000, timedOut: false });
  });

  it('cuts an engine short at the end of the budget', async () => {
    stubSearch1Api((call, init) => (call.body.search_service === 'google' ? untilAborted<Response>(init?.signal ?? undefined) : rows(call)));
    const judge = fakeDecide({
      intent: async (spec) => {
        await new Promise((resolve) => setTimeout(resolve, 20_000));
        return answerIntent(spec);
      },
    });
    const { events, finished } = consume(
      askStream({ search1api: S1, decide: judge.decide }, { request: 'Bun', sources: ['google'], window: '7d' })
    );
    // The engine's own 15 s deadline would end at 35 s; the budget ends first.
    await vi.advanceTimersByTimeAsync(30_000);
    await finished;
    expect(events.find((e) => e.type === 'lane')).toMatchObject({
      error: 'Timed out: the 30 s search budget ran out',
      errorCode: 'BUDGET_EXCEEDED',
    });
    expect(events.at(-1)).toMatchObject({ type: 'done', timedOut: true });
  });
});
