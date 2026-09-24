import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSearchHost } from '../host/search-host';
import { applyTaskEvent, createAskSession, IDLE, type AskState } from '@/lib/ask-session';
import type { SearchTransport } from '@/lib/host-transport';
import type { RankedItem } from '@/lib/rank';
import type { AskCommand, TaskEvent } from '@/lib/search-protocol';
import { SOURCE_IDS, type SourceId } from '@/lib/sources';
import { fakeDecide, inProcessTransport, memoryKeyStore, stubSearch1Api, untilAborted, type SearchCall } from './support/fakes';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A transport the test drives by hand: every ask stays open until the test ends it. */
function scriptedTransport() {
  const tasks: Array<{ params: AskCommand; onEvent: (event: TaskEvent) => void; signal: AbortSignal; finish: () => void }> = [];
  const transport: SearchTransport = {
    ask: (params, onEvent, signal) =>
      new Promise<void>((resolve) => {
        tasks.push({ params, onEvent, signal, finish: resolve });
        signal.addEventListener('abort', () => resolve(), { once: true });
      }),
    status: async () => ({ search1apiConfigured: true }),
    setKey: async () => ({ search1apiConfigured: true }),
  };
  return { transport, tasks };
}

function ids() {
  let n = 0;
  return () => `task-${++n}`;
}

const intent = (taskId: string): TaskEvent => ({
  type: 'intent',
  taskId,
  request: 'Bun',
  query: 'Bun',
  entityQuery: 'Bun',
  candidates: ['Bun'],
  window: 'any',
  sources: ['google'],
  inferred: {
    window: { choice: 'any', probability: 0.9 },
    sources: Object.fromEntries(SOURCE_IDS.map((id) => [id, 0.1])) as Record<SourceId, number>,
    query: null,
    entity: null,
  },
  intentMs: 5,
});

function row(id: string, relevance: number | null): RankedItem {
  return {
    id, source: 'google', title: id, url: `https://e.com/${id}`, snippet: '', ageHours: null,
    relevance, ranked: relevance !== null, freshness: 0.5, position: 1, engines: ['google'],
  };
}

const lane = (taskId: string, items: RankedItem[]): TaskEvent => ({
  type: 'lane', taskId, source: 'google', engine: 'google', items, stale: 0, searchMs: 3, scoreMs: 4,
});

describe('applyTaskEvent', () => {
  it('ignores events for another task and events after the task ended', () => {
    const running: AskState = { ...IDLE, phase: 'understanding', taskId: 'task-2' };
    expect(applyTaskEvent(running, intent('task-1'))).toBe(running);
    const done = applyTaskEvent(applyTaskEvent(running, intent('task-2')), { type: 'done', taskId: 'task-2', totalMs: 9, timedOut: false });
    expect(done.phase).toBe('done');
    expect(applyTaskEvent(done, lane('task-2', [row('late', 0.9)]))).toBe(done);
  });
});

describe('ask session', () => {
  it('runs a task through to done', () => {
    const { transport, tasks } = scriptedTransport();
    const states: AskState[] = [];
    const session = createAskSession(transport, (s) => states.push(s), ids());
    session.start({ q: 'Bun', w: 'any' });
    expect(tasks[0]!.params).toEqual({ taskId: 'task-1', q: 'Bun', w: 'any' });
    expect(session.state).toMatchObject({ phase: 'understanding', taskId: 'task-1' });

    tasks[0]!.onEvent(intent('task-1'));
    expect(session.state.phase).toBe('searching');
    tasks[0]!.onEvent(lane('task-1', [row('a', 0.8)]));
    tasks[0]!.onEvent({ type: 'done', taskId: 'task-1', totalMs: 1200, timedOut: false });
    expect(session.state).toMatchObject({ phase: 'done', totalMs: 1200, timedOut: false });
    expect(session.state.items.map((i) => i.id)).toEqual(['a']);
    expect(states.at(-1)).toBe(session.state);
  });

  it('never applies late events from a replaced task, even with the same parameters', () => {
    const { transport, tasks } = scriptedTransport();
    const session = createAskSession(transport, () => undefined, ids());
    session.start({ q: 'Bun' });
    tasks[0]!.onEvent(intent('task-1'));
    tasks[0]!.onEvent(lane('task-1', [row('old', 0.9)]));

    // "Search again": a new task for identical parameters.
    session.start({ q: 'Bun' });
    expect(tasks).toHaveLength(2);
    expect(tasks[0]!.signal.aborted).toBe(true);
    expect(tasks[1]!.params.taskId).toBe('task-2');
    expect(session.state).toMatchObject({ phase: 'understanding', taskId: 'task-2', items: [] });

    tasks[0]!.onEvent(lane('task-1', [row('late', 0.9)]));
    tasks[0]!.onEvent({ type: 'done', taskId: 'task-1', totalMs: 1, timedOut: false });
    expect(session.state).toMatchObject({ phase: 'understanding', taskId: 'task-2', items: [] });

    tasks[1]!.onEvent(intent('task-2'));
    tasks[1]!.onEvent(lane('task-2', [row('new', 0.7)]));
    expect(session.state.items.map((i) => i.id)).toEqual(['new']);
  });

  it('stops a running task, keeps what arrived, and ignores what comes after', () => {
    const { transport, tasks } = scriptedTransport();
    const session = createAskSession(transport, () => undefined, ids());
    session.start({ q: 'Bun' });
    tasks[0]!.onEvent(intent('task-1'));
    tasks[0]!.onEvent(lane('task-1', [row('kept', 0.8)]));

    session.stop();
    expect(tasks[0]!.signal.aborted).toBe(true);
    expect(session.state.phase).toBe('stopped');
    expect(session.state.items.map((i) => i.id)).toEqual(['kept']);

    tasks[0]!.onEvent(lane('task-1', [row('late', 0.9)]));
    tasks[0]!.onEvent({ type: 'done', taskId: 'task-1', totalMs: 1, timedOut: false });
    expect(session.state.phase).toBe('stopped');
    expect(session.state.items.map((i) => i.id)).toEqual(['kept']);
  });

  it('says so when there is no host to search with', () => {
    const session = createAskSession(null, () => undefined, ids());
    session.start({ q: 'Bun' });
    expect(session.state).toMatchObject({
      phase: 'error',
      error: { code: 'HOST_UNAVAILABLE', message: 'The search host is not connected.' },
    });
  });

  it('reports a transport failure, and a task that ends without a result', async () => {
    const failing: SearchTransport = {
      ask: async () => {
        throw Object.assign(new Error('bridge closed'), { code: 'BRIDGE_CLOSED' });
      },
      status: async () => ({ search1apiConfigured: false }),
      setKey: async () => ({ search1apiConfigured: false }),
    };
    const session = createAskSession(failing, () => undefined, ids());
    session.start({ q: 'Bun' });
    await vi.waitFor(() => expect(session.state.error).toEqual({ code: 'BRIDGE_CLOSED', message: 'bridge closed' }));

    const { transport, tasks } = scriptedTransport();
    const quiet = createAskSession(transport, () => undefined, ids());
    quiet.start({ q: 'Bun' });
    tasks[0]!.finish();
    await vi.waitFor(() => expect(quiet.state.error?.code).toBe('HOST_TASK_INCOMPLETE'));
  });

  it('reports nothing once disposed', () => {
    const { transport, tasks } = scriptedTransport();
    const onChange = vi.fn();
    const session = createAskSession(transport, onChange, ids());
    session.start({ q: 'Bun' });
    onChange.mockClear();
    session.dispose();
    expect(tasks[0]!.signal.aborted).toBe(true);
    tasks[0]!.onEvent(intent('task-1'));
    session.start({ q: 'Deno' });
    expect(onChange).not.toHaveBeenCalled();
    expect(tasks).toHaveLength(1);
  });

  it('goes back to idle without a request', () => {
    const { transport, tasks } = scriptedTransport();
    const session = createAskSession(transport, () => undefined, ids());
    session.start({ q: '  ' });
    expect(session.state).toBe(IDLE);
    expect(tasks).toHaveLength(0);
  });
});

describe('session, transport and host together', () => {
  function rows(call: SearchCall) {
    const service = String(call.body.search_service);
    return [{ title: `${service} result`, link: `https://${service}.example/1`, snippet: 'Bun' }];
  }

  it('runs a whole search through the host', async () => {
    stubSearch1Api(rows);
    const host = createSearchHost({ decide: fakeDecide().decide, keyStore: memoryKeyStore('k') });
    const session = createAskSession(inProcessTransport(host), () => undefined);
    session.start({ q: 'Bun', w: 'any', s: ['google', 'reddit'] });
    await vi.waitFor(() => expect(session.state.phase).toBe('done'));
    expect(session.state.intent?.sources).toEqual(['google', 'reddit']);
    expect(Object.keys(session.state.lanes).sort()).toEqual(['google/google', 'reddit/google', 'reddit/reddit']);
    expect(session.state.items.every((i) => i.ranked)).toBe(true);
  });

  it('stops a search in the host and keeps finished rows', async () => {
    // Google answers, Reddit's engines never do.
    stubSearch1Api((call, init) => (call.body.search_service === 'google' && !(call.body.include_sites as string[]).length ? rows(call) : untilAborted<Response>(init?.signal ?? undefined)));
    const host = createSearchHost({ decide: fakeDecide().decide, keyStore: memoryKeyStore('k') });
    const cancel = vi.spyOn(host, 'cancel');
    const session = createAskSession(inProcessTransport(host), () => undefined);
    session.start({ q: 'Bun', w: 'any', s: ['google', 'reddit'] });
    await vi.waitFor(() => expect(session.state.lanes['google/google']).toBeDefined());

    session.stop();
    expect(session.state.phase).toBe('stopped');
    expect(cancel).toHaveBeenCalledWith({ taskId: session.state.taskId });
    expect(session.state.items.map((i) => i.url)).toEqual(['https://google.example/1']);
    expect(session.state.lanes['reddit/reddit']).toBeUndefined();
    // The host has let go of the task.
    await vi.waitFor(() => expect(host.cancelAll()).toEqual({ canceled: 0 }));
  });
});
