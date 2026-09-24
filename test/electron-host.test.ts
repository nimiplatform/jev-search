/**
 * The Electron Host's adapters, without Electron: the Nimi text.decide
 * function, the sealed Search1API key store and the App commands registered
 * with Kit. Nimi, Kit and Search1API are replaced by fakes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NimiElectronCommandHandlerInput } from '@nimiplatform/kit/shell/electron/main';
import type { NimiLocalAppScenarioExecuteResult } from '@nimiplatform/sdk/app';
import { createSearchHost } from '../host/search-host';
import { createNimiDecide, type ScenarioExecute } from '../src-electron/nimi-decide';
import {
  COMMAND_REJECTED,
  EVENTS_UNAVAILABLE,
  PAYLOAD_INVALID,
  createSearchCommandHandlers,
} from '../src-electron/search-commands';
import {
  KEY_ENCRYPTION_UNAVAILABLE,
  KEY_UNREADABLE,
  SEARCH1API_KEY_DOCUMENT,
  createSearch1ApiKeyStore,
  type KeyEncryption,
} from '../src-electron/search1api-key-store';
import { DecisionAnswerError, inferIntent, judgeRelevance } from '@/lib/decide';
import { SEARCH_COMMANDS, SEARCH_EVENT, type TaskEvent } from '@/lib/search-protocol';
import { answerIntent, fakeDecide, memoryKeyStore, stubSearch1Api, untilAborted, type SearchCall } from './support/fakes';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function rows(call: SearchCall) {
  const service = String(call.body.search_service);
  return [{ title: `${service} one`, link: `https://${service}.example/1`, snippet: 'Bun' }];
}

describe('Nimi text.decide adapter', () => {
  it('sends the spec and call options unchanged and flattens the SDK result', async () => {
    const execute = vi.fn<ScenarioExecute>(async () => ({
      output: { type: 'text-decide', answers: [{ questionId: 'relevant', kind: 'boolean', trueProbability: 0.8 }] },
      traceId: 'trace-1',
    }));
    const decide = createNimiDecide(execute);
    const controller = new AbortController();
    const probability = await judgeRelevance(
      decide,
      'Bun',
      { source: 'Google', title: 'Bun 1.2', snippet: 'A JavaScript runtime' },
      { signal: controller.signal, timeoutMs: 1234 }
    );
    expect(probability).toBe(0.8);
    const [spec, options] = execute.mock.calls[0]!;
    expect(spec).toMatchObject({ type: 'text-decide', questions: [{ id: 'relevant', kind: 'boolean' }] });
    expect(options).toEqual({ signal: controller.signal, timeoutMs: 1234 });
  });

  it('keeps every choice probability as returned', async () => {
    const execute = vi.fn<ScenarioExecute>(async (spec) => {
      const answered = answerIntent(spec as Parameters<typeof answerIntent>[0], { window: { choice: '7d', probability: 0.7 } }, 'trace-intent');
      return { output: { type: 'text-decide', answers: answered.answers }, traceId: answered.traceId };
    });
    const intent = await inferIntent(createNimiDecide(execute), { request: 'Bun this week', candidates: ['Bun'], now: new Date('2026-09-24') }, {});
    expect(intent.window).toEqual({ choice: '7d', probability: 0.7 });
    expect(intent.traceId).toBe('trace-intent');
  });

  it.each([
    { reasonCode: 'OPERATION_ABORTED' },
    { reasonCode: 'OPERATION_TIMEOUT' },
    { reasonCode: 'SDK_LOCAL_APP_INPUT_INVALID' },
    { reasonCode: 'AI_INPUT_LIMIT_EXCEEDED' },
    { reasonCode: 'AI_LOCAL_CONFIGURATION_NOT_CONFIGURED' },
  ])('passes the $reasonCode failure through unchanged', async ({ reasonCode }) => {
    const failure = Object.assign(new Error(`failed: ${reasonCode}`), { reasonCode, code: reasonCode });
    const decide = createNimiDecide(async () => {
      throw failure;
    });
    await expect(decide({ type: 'text-decide', state: { text: 'x' }, questions: [] }, {})).rejects.toBe(failure);
  });

  it('refuses a result that is not a text decision', async () => {
    const decide = createNimiDecide(
      async () =>
        ({ output: { type: 'text-embed', vectors: [], spaceId: 's' }, traceId: 't' }) as NimiLocalAppScenarioExecuteResult
    );
    await expect(decide({ type: 'text-decide', state: { text: 'x' }, questions: [] }, {})).rejects.toBeInstanceOf(
      DecisionAnswerError
    );
  });
});

/** Seals by reversing and prefixing, so the stored bytes never equal the key. */
function fakeEncryption(available = true) {
  const encryption: KeyEncryption = {
    isEncryptionAvailable: vi.fn(() => available),
    encryptString: vi.fn((plainText: string) => new TextEncoder().encode(`sealed:${[...plainText].reverse().join('')}`)),
    decryptString: vi.fn((encrypted: Uint8Array) => {
      const text = new TextDecoder().decode(encrypted);
      if (!text.startsWith('sealed:')) throw new Error('Error while decrypting the ciphertext');
      return [...text.slice('sealed:'.length)].reverse().join('');
    }),
  };
  return encryption;
}

function notFound() {
  return Object.assign(new Error('not-found'), { reasonCode: 'not-found', retryable: false });
}

function fakeStorage(initial?: unknown) {
  const documents = new Map<string, unknown>(initial === undefined ? [] : [[SEARCH1API_KEY_DOCUMENT, initial]]);
  return {
    documents,
    readJson: vi.fn(async (relativePath: string) => {
      if (!documents.has(relativePath)) throw notFound();
      return { value: documents.get(relativePath), sizeBytes: 1 };
    }),
    writeJson: vi.fn(async (relativePath: string, value: unknown) => {
      documents.set(relativePath, value);
      return { value, sizeBytes: 1 };
    }),
  };
}

describe('Search1API key store', () => {
  const key = 's1-live-secret-key';

  it('keeps only the OS-sealed key, base64 encoded, in the App storage document', async () => {
    const storage = fakeStorage();
    const store = createSearch1ApiKeyStore({ storage, encryption: fakeEncryption() });
    expect(await store.get()).toBeUndefined();

    await store.set(key);
    expect(storage.writeJson).toHaveBeenCalledTimes(1);
    const document = storage.documents.get(SEARCH1API_KEY_DOCUMENT) as Record<string, string>;
    expect(Object.keys(document).sort()).toEqual(['ciphertext', 'encryption', 'format']);
    expect(document.encryption).toBe('electron-safe-storage');
    expect(atob(document.ciphertext!)).toBe(`sealed:${[...key].reverse().join('')}`);
    expect(JSON.stringify(document)).not.toContain(key);

    expect(await store.get()).toBe(key);
  });

  it('refuses to save without OS encryption and writes nothing', async () => {
    const storage = fakeStorage();
    const store = createSearch1ApiKeyStore({ storage, encryption: fakeEncryption(false) });
    await expect(store.set(key)).rejects.toMatchObject({ reasonCode: KEY_ENCRYPTION_UNAVAILABLE });
    expect(storage.writeJson).not.toHaveBeenCalled();
  });

  it('cannot read a saved key without OS encryption', async () => {
    const saved = fakeStorage();
    await createSearch1ApiKeyStore({ storage: saved, encryption: fakeEncryption() }).set(key);
    const store = createSearch1ApiKeyStore({ storage: saved, encryption: fakeEncryption(false) });
    await expect(store.get()).rejects.toMatchObject({ reasonCode: KEY_ENCRYPTION_UNAVAILABLE });
  });

  it.each([
    ['a different shape', { key }],
    ['an extra field', { format: 'jev-search.search1api-key/v1', encryption: 'electron-safe-storage', ciphertext: 'c2VhbGVk', key }],
    ['another format', { format: 'v0', encryption: 'electron-safe-storage', ciphertext: 'c2VhbGVk' }],
    ['a ciphertext that is not base64', { format: 'jev-search.search1api-key/v1', encryption: 'electron-safe-storage', ciphertext: 'not base64!' }],
    ['bytes the OS cannot open', { format: 'jev-search.search1api-key/v1', encryption: 'electron-safe-storage', ciphertext: btoa('plain') }],
  ])('reports %s as unreadable instead of as no key', async (_label, document) => {
    const store = createSearch1ApiKeyStore({ storage: fakeStorage(document), encryption: fakeEncryption() });
    const failure = store.get();
    await expect(failure).rejects.toMatchObject({ reasonCode: KEY_UNREADABLE });
    await failure.catch((error: Error) => expect(error.message).not.toContain(key));
  });

  it('passes other storage failures through', async () => {
    const failure = Object.assign(new Error('session-invalid'), { reasonCode: 'session-invalid' });
    const store = createSearch1ApiKeyStore({
      storage: { readJson: async () => Promise.reject(failure), writeJson: async () => undefined },
      encryption: fakeEncryption(),
    });
    await expect(store.get()).rejects.toBe(failure);
  });

  it('serves the search host: the key reaches Search1API and never the page', async () => {
    const calls = stubSearch1Api(rows);
    const storage = fakeStorage();
    const host = createSearchHost({
      decide: fakeDecide().decide,
      keyStore: createSearch1ApiKeyStore({ storage, encryption: fakeEncryption() }),
    });
    expect(await host.searchSettingsStatus()).toEqual({ search1apiConfigured: false });
    expect(await host.setSearch1ApiKey({ apiKey: ` ${key} ` })).toEqual({ search1apiConfigured: true });
    expect(await host.searchSettingsStatus()).toEqual({ search1apiConfigured: true });
    const events: TaskEvent[] = [];
    await host.ask({ taskId: 'task-1', q: 'Bun', w: 'any', s: ['google'] }, (event) => events.push(event));
    expect(events.at(-1)!.type).toBe('done');
    expect(calls[0]!.headers.authorization).toBe(`Bearer ${key}`);
    expect(JSON.stringify(events)).not.toContain(key);
  });
});

type Listener = (...args: unknown[]) => void;

/** The parts of Electron's WebContents the command handlers watch. */
function fakeSender() {
  const listeners = new Map<string, Set<Listener>>();
  const sender = {
    on: vi.fn((name: string, listener: Listener) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name)!.add(listener);
      return sender;
    }),
    removeListener: vi.fn((name: string, listener: Listener) => {
      listeners.get(name)?.delete(listener);
      return sender;
    }),
  };
  return {
    sender,
    emit: (name: string, ...args: unknown[]) => listeners.get(name)?.forEach((listener) => listener(...args)),
    count: () => [...listeners.values()].reduce((total, set) => total + set.size, 0),
  };
}

function commandInput(
  payload: Record<string, unknown>,
  extra: { sendEvent?: (eventName: string, payload: unknown) => void; sender?: object } = {}
) {
  return {
    command: 'test',
    payload,
    event: { sender: extra.sender },
    sendEvent: extra.sendEvent,
  } as unknown as NimiElectronCommandHandlerInput;
}

function sentEvents() {
  const sent: Array<{ name: string; event: TaskEvent }> = [];
  return { sent, sendEvent: (name: string, event: unknown) => sent.push({ name, event: event as TaskEvent }) };
}

describe('App commands registered with Kit', () => {
  it('registers exactly the fixed command names', () => {
    const handlers = createSearchCommandHandlers(createSearchHost({ decide: fakeDecide().decide, keyStore: memoryKeyStore() }));
    expect(Object.keys(handlers).sort()).toEqual(Object.values(SEARCH_COMMANDS).sort());
  });

  it('streams every task event on the search event channel and resolves after the terminal one', async () => {
    stubSearch1Api(rows);
    const handlers = createSearchCommandHandlers(createSearchHost({ decide: fakeDecide().decide, keyStore: memoryKeyStore('k') }));
    const { sent, sendEvent } = sentEvents();
    const page = fakeSender();
    const result = await handlers.ask(commandInput({ taskId: 'task-1', q: 'Bun', w: 'any', s: ['google'] }, { sendEvent, sender: page.sender }));
    expect(result).toBeNull();
    expect(sent.every((entry) => entry.name === SEARCH_EVENT && entry.event.taskId === 'task-1')).toBe(true);
    expect(sent.map((entry) => entry.event.type)).toEqual(['intent', 'found', 'lane', 'done']);
    expect(page.count()).toBe(0);
  });

  it.each([
    [{ taskId: 'task-1', q: 'Bun', extra: true }, /unsupported field extra/],
    [{ taskId: 'task-1' }, /missing q/],
    [{ taskId: 1, q: 'Bun' }, /taskId must be a string/],
    [{ taskId: 'task-1', q: 'Bun', w: 7 }, /w must be a string/],
    [{ taskId: 'task-1', q: 'Bun', s: 'google' }, /s must be a list/],
  ])('rejects the ask payload %j before searching', async (payload, message) => {
    const calls = stubSearch1Api(rows);
    const decide = fakeDecide();
    const handlers = createSearchCommandHandlers(createSearchHost({ decide: decide.decide, keyStore: memoryKeyStore('k') }));
    const { sent, sendEvent } = sentEvents();
    const failure = handlers.ask(commandInput(payload, { sendEvent }));
    await expect(failure).rejects.toMatchObject({ reasonCode: PAYLOAD_INVALID, code: 'invalid-payload' });
    await expect(failure).rejects.toThrow(message);
    expect(sent).toEqual([]);
    expect(decide.calls).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('refuses to start a task whose events cannot reach the page', async () => {
    const handlers = createSearchCommandHandlers(createSearchHost({ decide: fakeDecide().decide, keyStore: memoryKeyStore('k') }));
    await expect(handlers.ask(commandInput({ taskId: 'task-1', q: 'Bun' }))).rejects.toMatchObject({ reasonCode: EVENTS_UNAVAILABLE });
  });

  it('gives host refusals this App reason code and keeps their message', async () => {
    const handlers = createSearchCommandHandlers(createSearchHost({ decide: fakeDecide().decide, keyStore: memoryKeyStore('k') }));
    const { sendEvent } = sentEvents();
    await expect(handlers.ask(commandInput({ taskId: 'has spaces', q: 'Bun' }, { sendEvent }))).rejects.toMatchObject({
      reasonCode: COMMAND_REJECTED,
      message: expect.stringMatching(/taskId/),
    });
    await expect(handlers.cancel(commandInput({ taskId: '' }))).rejects.toMatchObject({ reasonCode: COMMAND_REJECTED });
  });

  it('cancels a running task: it ends with stopped', async () => {
    stubSearch1Api((_call, init) => untilAborted<Response>(init?.signal ?? undefined));
    const handlers = createSearchCommandHandlers(createSearchHost({ decide: fakeDecide().decide, keyStore: memoryKeyStore('k') }));
    const { sent, sendEvent } = sentEvents();
    const task = handlers.ask(commandInput({ taskId: 'task-1', q: 'Bun', s: ['google'] }, { sendEvent }));
    await vi.waitFor(() => expect(sent.map((entry) => entry.event.type)).toEqual(['intent']));
    expect(await handlers.cancel(commandInput({ taskId: 'task-1' }))).toEqual({ canceled: true });
    await task;
    expect(sent.at(-1)!.event).toEqual({ type: 'stopped', taskId: 'task-1' });
    await expect(handlers.cancel(commandInput({ taskId: 'task-1', q: 'x' }))).rejects.toMatchObject({ reasonCode: PAYLOAD_INVALID });
  });

  it.each([
    ['destroyed', []],
    ['render-process-gone', [{}, { reason: 'crashed' }]],
    ['did-start-navigation', [{ isMainFrame: true, isSameDocument: false, url: 'http://127.0.0.1:1531/' }]],
  ])('stops a task when its page is replaced (%s)', async (name, args) => {
    stubSearch1Api((_call, init) => untilAborted<Response>(init?.signal ?? undefined));
    const handlers = createSearchCommandHandlers(createSearchHost({ decide: fakeDecide().decide, keyStore: memoryKeyStore('k') }));
    const { sent, sendEvent } = sentEvents();
    const page = fakeSender();
    const task = handlers.ask(commandInput({ taskId: 'task-1', q: 'Bun', s: ['google'] }, { sendEvent, sender: page.sender }));
    await vi.waitFor(() => expect(sent.length).toBe(1));
    page.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true, url: 'http://127.0.0.1:1531/#/search?q=Bun' });
    expect(sent.at(-1)!.event.type).toBe('intent');
    page.emit(name, ...args);
    await task;
    expect(sent.at(-1)!.event).toEqual({ type: 'stopped', taskId: 'task-1' });
    expect(page.count()).toBe(0);
  });

  it('reports settings with an empty payload only', async () => {
    const handlers = createSearchCommandHandlers(createSearchHost({ decide: fakeDecide().decide, keyStore: memoryKeyStore() }));
    expect(await handlers.searchSettingsStatus(commandInput({}))).toEqual({ search1apiConfigured: false });
    await expect(handlers.searchSettingsStatus(commandInput({ apiKey: 'x' }))).rejects.toMatchObject({ reasonCode: PAYLOAD_INVALID });
  });

  it('saves the key through the host and answers only whether one is configured', async () => {
    const keyStore = memoryKeyStore();
    const handlers = createSearchCommandHandlers(createSearchHost({ decide: fakeDecide().decide, keyStore }));
    const key = 's1-live-secret-key';
    expect(await handlers.setSearch1ApiKey(commandInput({ apiKey: key }))).toEqual({ search1apiConfigured: true });
    expect(keyStore.set).toHaveBeenCalledWith(key);

    for (const payload of [{ apiKey: 42 }, { apiKey: key, save: true }, {}]) {
      await expect(handlers.setSearch1ApiKey(commandInput(payload))).rejects.toMatchObject({ reasonCode: PAYLOAD_INVALID });
    }
    const invalid = Promise.resolve(handlers.setSearch1ApiKey(commandInput({ apiKey: 'two words' })));
    await expect(invalid).rejects.toMatchObject({ reasonCode: COMMAND_REJECTED });
    await invalid.catch((error: Error) => expect(error.message).not.toContain('two words'));
  });

  it('passes key custody failures through with their own reason code', async () => {
    const handlers = createSearchCommandHandlers(
      createSearchHost({
        decide: fakeDecide().decide,
        keyStore: createSearch1ApiKeyStore({ storage: fakeStorage(), encryption: fakeEncryption(false) }),
      })
    );
    await expect(handlers.setSearch1ApiKey(commandInput({ apiKey: 's1-key' }))).rejects.toMatchObject({
      reasonCode: KEY_ENCRYPTION_UNAVAILABLE,
    });
  });
});
