import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSearchHost } from '../host/search-host';
import { memoryCache } from '@/lib/cache';
import type { LaneEvent } from '@/lib/pipeline';
import { SEARCH_COMMANDS, type TaskEvent } from '@/lib/search-protocol';
import { fakeDecide, memoryKeyStore, stubSearch1Api, untilAborted, type SearchCall } from './support/fakes';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function rows(call: SearchCall) {
  const service = String(call.body.search_service);
  return [
    { title: `${service} one`, link: `https://${service}.example/1`, snippet: 'Bun' },
    { title: `${service} two`, link: `https://${service}.example/2`, snippet: 'Bun' },
  ];
}

function recorder() {
  const events: TaskEvent[] = [];
  return { events, emit: (event: TaskEvent) => events.push(event) };
}

describe('search host commands', () => {
  it('exposes the fixed command names', () => {
    const host = createSearchHost({ decide: fakeDecide().decide, keyStore: memoryKeyStore() });
    for (const name of Object.values(SEARCH_COMMANDS)) expect(typeof host[name]).toBe('function');
    expect(typeof host.cancelAll).toBe('function');
  });

  it('streams one task as events tagged with its id, ending with done', async () => {
    const calls = stubSearch1Api(rows);
    const keyStore = memoryKeyStore('s1-key');
    const host = createSearchHost({ decide: fakeDecide().decide, keyStore, cache: memoryCache() });
    const { events, emit } = recorder();
    await host.ask({ taskId: 'task-1', q: ' Bun ', w: 'any', s: ['google'] }, emit);

    expect(events.map((e) => e.type)).toEqual(['intent', 'found', 'lane', 'done']);
    expect(events.every((e) => e.taskId === 'task-1')).toBe(true);
    expect(events[0]).toMatchObject({ type: 'intent', request: 'Bun', window: 'any', sources: ['google'] });
    expect((events[2] as LaneEvent).items.every((i) => i.ranked)).toBe(true);
    expect(calls[0]!.headers.authorization).toBe('Bearer s1-key');
    expect(keyStore.get).toHaveBeenCalled();
  });

  it('reports invalid search parameters as the task error', async () => {
    const host = createSearchHost({ decide: fakeDecide().decide, keyStore: memoryKeyStore('k') });
    const { events, emit } = recorder();
    await host.ask({ taskId: 'task-1', q: '   ' }, emit);
    expect(events).toEqual([
      { type: 'error', taskId: 'task-1', code: 'INVALID_REQUEST', message: 'q must be a non-empty string up to 300 characters' },
    ]);
  });

  it('rejects a malformed or duplicate task id without emitting', async () => {
    stubSearch1Api((_call, init) => untilAborted<Response>(init?.signal ?? undefined));
    const host = createSearchHost({ decide: fakeDecide().decide, keyStore: memoryKeyStore('k') });
    const { events, emit } = recorder();
    await expect(host.ask({ taskId: '', q: 'Bun' }, emit)).rejects.toThrow(/taskId/);
    await expect(host.ask({ taskId: 'has spaces', q: 'Bun' }, emit)).rejects.toThrow(/taskId/);
    expect(events).toEqual([]);

    const first = host.ask({ taskId: 'task-1', q: 'Bun', s: ['google'] }, emit);
    await expect(host.ask({ taskId: 'task-1', q: 'Bun' }, emit)).rejects.toThrow(/already running/);
    host.cancel({ taskId: 'task-1' });
    await first;
  });

  it('when no key is configured, fails every lane with that reason and fetches nothing', async () => {
    const calls = stubSearch1Api(rows);
    const host = createSearchHost({ decide: fakeDecide().decide, keyStore: memoryKeyStore() });
    const { events, emit } = recorder();
    await host.ask({ taskId: 'task-1', q: 'Bun', s: ['google', 'reddit'] }, emit);
    const lanes = events.filter((e): e is LaneEvent & { taskId: string } => e.type === 'lane');
    expect(lanes).toHaveLength(3);
    expect(lanes.every((l) => l.error === 'Search1API key is not configured' && l.errorCode === 'SEARCH1API_NOT_CONFIGURED')).toBe(true);
    expect(events.at(-1)!.type).toBe('done');
    expect(calls).toEqual([]);
  });

  it('applies the 30 s budget', async () => {
    vi.useFakeTimers();
    stubSearch1Api(rows);
    const host = createSearchHost({
      decide: fakeDecide({ intent: () => new Promise(() => undefined) }).decide,
      keyStore: memoryKeyStore('k'),
    });
    const { events, emit } = recorder();
    const task = host.ask({ taskId: 'task-1', q: 'Bun' }, emit);
    await vi.advanceTimersByTimeAsync(30_000);
    await task;
    expect(events).toEqual([
      {
        type: 'error',
        taskId: 'task-1',
        code: 'BUDGET_EXCEEDED',
        message: 'Timed out reading the request: the 30 s search budget ran out.',
      },
    ]);
  });
});

describe('cancellation', () => {
  it('ends a cancelled task with stopped at once and drops everything after it', async () => {
    stubSearch1Api(rows);
    let release!: (value: number) => void;
    const signals: AbortSignal[] = [];
    const judge = fakeDecide({
      // Ignores cancellation and answers late, as a slow backend might.
      relevance: (_result, options) => {
        signals.push(options.signal!);
        return new Promise<number>((resolve) => {
          release = resolve;
        });
      },
    });
    const host = createSearchHost({ decide: judge.decide, keyStore: memoryKeyStore('k') });
    const { events, emit } = recorder();
    const task = host.ask({ taskId: 'task-1', q: 'Bun', w: 'any', s: ['google'] }, emit);
    await vi.waitFor(() => expect(events.map((e) => e.type)).toEqual(['intent', 'found']));

    expect(host.cancel({ taskId: 'task-1' })).toEqual({ canceled: true });
    await task;
    expect(events.map((e) => e.type)).toEqual(['intent', 'found', 'stopped']);
    expect(events.at(-1)).toEqual({ type: 'stopped', taskId: 'task-1' });
    expect(signals.length).toBeGreaterThan(0);
    expect(signals.every((s) => s.aborted)).toBe(true);

    release(0.9);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(events.map((e) => e.type)).toEqual(['intent', 'found', 'stopped']);
    expect(host.cancel({ taskId: 'task-1' })).toEqual({ canceled: false });
  });

  it('cancels every running task when the session goes away', async () => {
    stubSearch1Api((_call, init) => untilAborted<Response>(init?.signal ?? undefined));
    const host = createSearchHost({ decide: fakeDecide().decide, keyStore: memoryKeyStore('k') });
    const a = recorder();
    const b = recorder();
    const tasks = [host.ask({ taskId: 'a', q: 'Bun', s: ['google'] }, a.emit), host.ask({ taskId: 'b', q: 'Deno', s: ['reddit'] }, b.emit)];
    await vi.waitFor(() => expect(a.events.length + b.events.length).toBe(2));
    expect(host.cancelAll()).toEqual({ canceled: 2 });
    await Promise.all(tasks);
    expect(a.events.at(-1)).toEqual({ type: 'stopped', taskId: 'a' });
    expect(b.events.at(-1)).toEqual({ type: 'stopped', taskId: 'b' });
    expect(host.cancelAll()).toEqual({ canceled: 0 });
  });

  it('stops a task whose renderer has gone away', async () => {
    stubSearch1Api(rows);
    const signals: AbortSignal[] = [];
    const judge = fakeDecide({
      relevance: (_result, options) => {
        signals.push(options.signal!);
        return untilAborted<number>(options.signal);
      },
    });
    const host = createSearchHost({ decide: judge.decide, keyStore: memoryKeyStore('k') });
    let delivered = 0;
    await host.ask({ taskId: 'task-1', q: 'Bun', w: 'any', s: ['google'] }, (event) => {
      if (event.type === 'found') throw new Error('renderer gone');
      delivered += 1;
    });
    expect(delivered).toBe(1);
    expect(signals.every((s) => s.aborted)).toBe(true);
  });
});

describe('Search1API key custody', () => {
  it('stores the key privately and reports only whether one is configured', async () => {
    const keyStore = memoryKeyStore();
    const host = createSearchHost({ decide: fakeDecide().decide, keyStore });
    expect(await host.searchSettingsStatus()).toEqual({ search1apiConfigured: false });
    expect(await host.setSearch1ApiKey({ apiKey: '  s1-secret-key  ' })).toEqual({ search1apiConfigured: true });
    expect(keyStore.set).toHaveBeenCalledWith('s1-secret-key');
    expect(await host.searchSettingsStatus()).toEqual({ search1apiConfigured: true });
  });

  it.each(['', '   ', 'two words', 'x'.repeat(513), 42, undefined])('rejects %j without repeating it', async (apiKey) => {
    const keyStore = memoryKeyStore();
    const host = createSearchHost({ decide: fakeDecide().decide, keyStore });
    const failure = host.setSearch1ApiKey({ apiKey } as { apiKey: string });
    await expect(failure).rejects.toThrow(/Search1API key|apiKey/);
    await failure.catch((error: Error) => {
      if (typeof apiKey === 'string' && apiKey.trim()) expect(error.message).not.toContain(apiKey);
    });
    expect(keyStore.set).not.toHaveBeenCalled();
  });

  it('never lets the key into events or logs, even when Search1API echoes it', async () => {
    const key = 's1-very-secret-key';
    stubSearch1Api((call) =>
      call.body.search_service === 'reddit'
        ? new Response(`invalid key ${key} for this plan`, { status: 401 })
        : rows(call)
    );
    const logs = [vi.spyOn(console, 'log'), vi.spyOn(console, 'warn'), vi.spyOn(console, 'error'), vi.spyOn(console, 'info')];
    const host = createSearchHost({ decide: fakeDecide().decide, keyStore: memoryKeyStore() });
    await host.setSearch1ApiKey({ apiKey: key });
    const { events, emit } = recorder();
    await host.ask({ taskId: 'task-1', q: 'Bun', w: 'any', s: ['reddit'] }, emit);

    const failed = events.find((e): e is LaneEvent & { taskId: string } => e.type === 'lane' && e.engine === 'reddit')!;
    expect(failed.error).toBe('invalid key [redacted] for this plan');
    expect(JSON.stringify(events)).not.toContain(key);
    expect(JSON.stringify(await host.searchSettingsStatus())).not.toContain(key);
    for (const log of logs) {
      for (const args of log.mock.calls) expect(JSON.stringify(args)).not.toContain(key);
    }
  });
});
