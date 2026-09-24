/**
 * The page's transport over the Kit renderer bridge, first against a scripted
 * bridge, then wired through an in-process stand-in for Electron IPC to the
 * real Host command handlers and search host.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NimiElectronCommandHandlerInput } from '@nimiplatform/kit/shell/electron/main';
import { createSearchHost } from '../host/search-host';
import { createSearchCommandHandlers } from '../src-electron/search-commands';
import { createAskSession, type AskState } from '@/lib/ask-session';
import { SEARCH_COMMANDS, SEARCH_EVENT, type TaskEvent } from '@/lib/search-protocol';
import { createShellSearchTransport, ShellTransportError, type ShellBridge } from '@/lib/shell-transport';
import { fakeDecide, memoryKeyStore, stubSearch1Api, untilAborted, type SearchCall } from './support/fakes';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const stopped = (taskId: string): TaskEvent => ({ type: 'stopped', taskId });
const done = (taskId: string): TaskEvent => ({ type: 'done', taskId, totalMs: 5, timedOut: false });

/** A bridge whose `ask` the test answers by hand. */
function scriptedBridge() {
  const listeners = new Set<(event: { payload: unknown }) => void>();
  const invocations: Array<{ command: string; payload: unknown; resolve: (value?: unknown) => void; reject: (error: unknown) => void }> = [];
  const unsubscribed = vi.fn();
  const bridge: ShellBridge = {
    invoke: vi.fn(
      (command: string, payload?: unknown) =>
        new Promise<unknown>((resolve, reject) => {
          invocations.push({ command, payload, resolve, reject });
          if (command === SEARCH_COMMANDS.cancel) resolve({ canceled: true });
        })
    ),
    listen: vi.fn(async (eventName: string, handler: (event: { payload: unknown }) => void) => {
      expect(eventName).toBe(SEARCH_EVENT);
      listeners.add(handler);
      return () => {
        listeners.delete(handler);
        unsubscribed();
      };
    }),
  };
  return {
    bridge,
    invocations,
    unsubscribed,
    listeners,
    emit: (payload: unknown) => [...listeners].forEach((listener) => listener({ payload })),
  };
}

describe('shell transport', () => {
  it('delivers only its own task events in order and ends with the terminal one', async () => {
    const shell = scriptedBridge();
    const transport = createShellSearchTransport(shell.bridge);
    const received: TaskEvent[] = [];
    const task = transport.ask({ taskId: 'task-2', q: 'Bun' }, (event) => received.push(event), new AbortController().signal);
    await vi.waitFor(() => expect(shell.invocations).toHaveLength(1));
    expect(shell.invocations[0]).toMatchObject({ command: SEARCH_COMMANDS.ask, payload: { taskId: 'task-2', q: 'Bun' } });

    shell.emit(stopped('task-1'));
    shell.emit({ type: 'found', taskId: 'task-2', source: 'google', engine: 'google', items: [] });
    shell.emit('not an event');
    shell.emit(done('task-2'));
    shell.emit(stopped('task-2'));
    await task;

    expect(received.map((event) => event.type)).toEqual(['found', 'done']);
    expect(shell.unsubscribed).toHaveBeenCalledTimes(1);
    expect(shell.listeners.size).toBe(0);
  });

  it('waits briefly for the terminal event when the command answers first, then gives up', async () => {
    vi.useFakeTimers();
    const shell = scriptedBridge();
    const transport = createShellSearchTransport(shell.bridge, { terminalGraceMs: 500 });
    const received: TaskEvent[] = [];
    let settled = false;
    const task = transport
      .ask({ taskId: 'task-1', q: 'Bun' }, (event) => received.push(event), new AbortController().signal)
      .then(() => {
        settled = true;
      });
    await vi.waitFor(() => expect(shell.invocations).toHaveLength(1));
    shell.invocations[0]!.resolve(null);
    await vi.advanceTimersByTimeAsync(100);
    expect(settled).toBe(false);
    shell.emit(done('task-1'));
    await task;
    expect(received.map((event) => event.type)).toEqual(['done']);

    const silent = transport.ask({ taskId: 'task-2', q: 'Bun' }, (event) => received.push(event), new AbortController().signal);
    await vi.waitFor(() => expect(shell.invocations).toHaveLength(2));
    shell.invocations[1]!.resolve(null);
    await vi.advanceTimersByTimeAsync(500);
    await silent;
    expect(received.map((event) => event.type)).toEqual(['done']);
  });

  it('sends cancel on abort and stops delivering at once', async () => {
    const shell = scriptedBridge();
    const transport = createShellSearchTransport(shell.bridge);
    const received: TaskEvent[] = [];
    const controller = new AbortController();
    const task = transport.ask({ taskId: 'task-1', q: 'Bun' }, (event) => received.push(event), controller.signal);
    await vi.waitFor(() => expect(shell.invocations).toHaveLength(1));
    controller.abort();
    await task;
    expect(shell.invocations.map((call) => call.command)).toEqual([SEARCH_COMMANDS.ask, SEARCH_COMMANDS.cancel]);
    expect(shell.invocations[1]!.payload).toEqual({ taskId: 'task-1' });
    shell.emit(stopped('task-1'));
    expect(received).toEqual([]);
    expect(shell.listeners.size).toBe(0);
  });

  it('does not ask when already aborted', async () => {
    const shell = scriptedBridge();
    const controller = new AbortController();
    controller.abort();
    await createShellSearchTransport(shell.bridge).ask({ taskId: 'task-1', q: 'Bun' }, () => undefined, controller.signal);
    expect(shell.bridge.invoke).not.toHaveBeenCalled();
    expect(shell.bridge.listen).not.toHaveBeenCalled();
  });

  it('rejects with the bridge failure when the host refuses the command', async () => {
    const shell = scriptedBridge();
    const task = createShellSearchTransport(shell.bridge).ask({ taskId: 'task-1', q: 'Bun' }, () => undefined, new AbortController().signal);
    await vi.waitFor(() => expect(shell.invocations).toHaveLength(1));
    const failure = Object.assign(new Error('Standard shell host invoke is not available'), {
      reasonCode: 'renderer-standard-shell-host-unavailable',
    });
    shell.invocations[0]!.reject(failure);
    await expect(task).rejects.toBe(failure);
    expect(shell.listeners.size).toBe(0);
  });

  it('reads the settings status strictly and never sends the key back', async () => {
    const bridge: ShellBridge = {
      invoke: vi.fn(async (command: string) =>
        command === SEARCH_COMMANDS.searchSettingsStatus ? { search1apiConfigured: false } : { search1apiConfigured: true }
      ),
      listen: vi.fn(),
    };
    const transport = createShellSearchTransport(bridge);
    expect(await transport.status()).toEqual({ search1apiConfigured: false });
    expect(await transport.setKey('s1-key')).toEqual({ search1apiConfigured: true });
    expect(bridge.invoke).toHaveBeenCalledWith(SEARCH_COMMANDS.searchSettingsStatus, {});
    expect(bridge.invoke).toHaveBeenCalledWith(SEARCH_COMMANDS.setSearch1ApiKey, { apiKey: 's1-key' });

    for (const answer of [null, {}, { search1apiConfigured: 'yes' }, { search1apiConfigured: true, apiKey: 's1-key' }]) {
      const strict = createShellSearchTransport({ invoke: async () => answer, listen: vi.fn() });
      await expect(strict.status()).rejects.toBeInstanceOf(ShellTransportError);
    }
  });
});

/**
 * Electron IPC reduced to what Kit does for App commands: `invoke` runs the
 * registered handler with `sendEvent`, which delivers to the page's listeners.
 */
function inProcessIpc(handlers: ReturnType<typeof createSearchCommandHandlers>) {
  const listeners = new Map<string, Set<(event: { payload: unknown }) => void>>();
  const answered: Array<{ command: string; payload: unknown; result: unknown }> = [];
  const sendEvent = (eventName: string, payload: unknown) => {
    // Electron delivers a structured clone.
    const copy = structuredClone(payload);
    listeners.get(eventName)?.forEach((listener) => listener({ payload: copy }));
  };
  const bridge: ShellBridge = {
    async invoke(command, payload = {}) {
      const handler = handlers[command as keyof typeof handlers];
      if (!handler) throw Object.assign(new Error(`Unsupported command: ${command}`), { reasonCode: 'unsupported-electron-shell-command' });
      const input = { command, payload: structuredClone(payload), event: {}, sendEvent } as unknown as NimiElectronCommandHandlerInput;
      const result = structuredClone(await handler(input));
      answered.push({ command, payload, result });
      return result;
    },
    async listen(eventName, handler) {
      if (!listeners.has(eventName)) listeners.set(eventName, new Set());
      listeners.get(eventName)!.add(handler);
      return () => listeners.get(eventName)?.delete(handler);
    },
  };
  return { bridge, answered };
}

function rows(call: SearchCall) {
  const service = String(call.body.search_service);
  return [
    { title: `${service} one`, link: `https://${service}.example/1`, snippet: 'Bun' },
    { title: `${service} two`, link: `https://${service}.example/2`, snippet: 'Bun' },
  ];
}

describe('page to Host through the command bridge', () => {
  it('runs a search from the page session to done', async () => {
    stubSearch1Api(rows);
    const host = createSearchHost({ decide: fakeDecide().decide, keyStore: memoryKeyStore('k') });
    const ipc = inProcessIpc(createSearchCommandHandlers(host));
    const states: AskState[] = [];
    const session = createAskSession(createShellSearchTransport(ipc.bridge), (state) => states.push(state));
    session.start({ q: 'Bun', w: 'any', s: ['google'] });
    await vi.waitFor(() => expect(session.state.phase).toBe('done'));
    expect(session.state.error).toBeNull();
    expect(session.state.items.length).toBe(2);
    expect(session.state.items.every((item) => item.ranked)).toBe(true);
    expect(states.map((state) => state.phase)).toContain('searching');
    expect(ipc.answered.map((call) => call.command)).toEqual([SEARCH_COMMANDS.ask]);
  });

  it('stops a running search from the page and keeps what arrived', async () => {
    stubSearch1Api((_call, init) => untilAborted<Response>(init?.signal ?? undefined));
    const host = createSearchHost({ decide: fakeDecide().decide, keyStore: memoryKeyStore('k') });
    const ipc = inProcessIpc(createSearchCommandHandlers(host));
    const session = createAskSession(createShellSearchTransport(ipc.bridge), () => undefined, () => 'task-1');
    session.start({ q: 'Bun', s: ['google'] });
    await vi.waitFor(() => expect(session.state.phase).toBe('searching'));
    session.stop();
    expect(session.state.phase).toBe('stopped');
    expect(session.state.intent).not.toBeNull();
    await vi.waitFor(() =>
      expect(ipc.answered).toContainEqual({ command: SEARCH_COMMANDS.cancel, payload: { taskId: 'task-1' }, result: { canceled: true } })
    );
    await vi.waitFor(() => expect(ipc.answered.map((call) => call.command)).toContain(SEARCH_COMMANDS.ask));
    expect(host.cancelAll()).toEqual({ canceled: 0 });
  });

  it('saves the key and reports only the status', async () => {
    const keyStore = memoryKeyStore();
    const host = createSearchHost({ decide: fakeDecide().decide, keyStore });
    const transport = createShellSearchTransport(inProcessIpc(createSearchCommandHandlers(host)).bridge);
    expect(await transport.status()).toEqual({ search1apiConfigured: false });
    expect(await transport.setKey('s1-key')).toEqual({ search1apiConfigured: true });
    expect(await transport.status()).toEqual({ search1apiConfigured: true });
    expect(keyStore.set).toHaveBeenCalledWith('s1-key');
  });

  it('shows a host refusal as the search error', async () => {
    const host = createSearchHost({ decide: fakeDecide().decide, keyStore: memoryKeyStore('k') });
    const transport = createShellSearchTransport(inProcessIpc(createSearchCommandHandlers(host)).bridge);
    const session = createAskSession(transport, () => undefined, () => 'not a valid id');
    session.start({ q: 'Bun' });
    await vi.waitFor(() => expect(session.state.phase).toBe('error'));
    expect(session.state.error).toMatchObject({ code: 'SEARCH_COMMAND_REJECTED', message: expect.stringMatching(/taskId/) });
  });
});
