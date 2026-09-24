/**
 * The search, run in the desktop host (Node) instead of a Cloudflare Worker.
 *
 * Framework-free: no Electron or Nimi imports. The shell adapter registers
 * `ask`, `cancel`, `searchSettingsStatus` and `setSearch1ApiKey` under the
 * names in SEARCH_COMMANDS, forwards `emit` to the renderer on SEARCH_EVENT,
 * and calls `cancelAll` when the renderer session goes away.
 *
 * AI judgments go through the injected `decide` (Nimi text.decide). The
 * Search1API key stays in the host: it is read from `keyStore` for each
 * search and never returned, logged or put into an event.
 */
import { memoryCache, type ResultCache } from '../src/lib/cache';
import type { DecideFn } from '../src/lib/decide';
import { describeFailure } from '../src/lib/failure';
import { askStream, OVERALL_BUDGET_MS, type AskEvent } from '../src/lib/pipeline';
import {
  isTaskId,
  isTerminalEvent,
  type AskCommand,
  type CancelCommand,
  type CancelResult,
  type SearchSettingsStatus,
  type SetSearch1ApiKeyCommand,
  type StoppedEvent,
  type TaskEvent,
} from '../src/lib/search-protocol';
import { validateAskRequest } from '../src/lib/validate';

export interface SearchKeyStore {
  get(): Promise<string | undefined>;
  set(key: string): Promise<void>;
}

export interface SearchHostDeps {
  /**
   * Runs one typed decision: calls `services.ai.scenario.execute(spec, options)`
   * and returns its `{ output: { type, answers }, traceId }` as `{ type, answers, traceId }`.
   * Errors are passed through unchanged.
   */
  decide: DecideFn;
  /** Private storage for the Search1API key. */
  keyStore: SearchKeyStore;
  /** Engine response cache; defaults to the in-memory cache. */
  cache?: ResultCache;
  now?: () => Date;
}

export interface SearchHost {
  /**
   * Validates the command and runs the search, emitting that task's events
   * tagged with its taskId. Every accepted task emits exactly one terminal
   * event (`done`, `error` or `stopped`) and nothing after it; the promise
   * resolves once the terminal event has been emitted. Rejects without
   * emitting when the taskId is malformed or already running.
   */
  ask(command: AskCommand, emit: (event: TaskEvent) => void): Promise<void>;
  /** Stops a running task; it emits `stopped` at once and nothing else. */
  cancel(command: CancelCommand): CancelResult;
  searchSettingsStatus(): Promise<SearchSettingsStatus>;
  /** Stores the key privately. The result says only whether a key is configured. */
  setSearch1ApiKey(command: SetSearch1ApiKeyCommand): Promise<SearchSettingsStatus>;
  /** Stops every running task, for example when the renderer session is gone. */
  cancelAll(): { canceled: number };
}

const MAX_KEY_LENGTH = 512;

function field(command: unknown, name: string): unknown {
  return typeof command === 'object' && command !== null ? (command as Record<string, unknown>)[name] : undefined;
}

function readTaskId(command: unknown): string {
  const taskId = field(command, 'taskId');
  if (!isTaskId(taskId)) {
    throw new Error('taskId must be 1–128 letters, digits, dots, colons, underscores or hyphens');
  }
  return taskId;
}

export function createSearchHost(deps: SearchHostDeps): SearchHost {
  const cache = deps.cache ?? memoryCache();
  const running = new Map<string, AbortController>();

  const storedKey = async (): Promise<string | undefined> => {
    const key = await deps.keyStore.get();
    return typeof key === 'string' && key.trim() !== '' ? key.trim() : undefined;
  };

  return {
    async ask(command, emit) {
      const taskId = readTaskId(command);
      if (running.has(taskId)) throw new Error(`Search task ${taskId} is already running`);
      const controller = new AbortController();
      running.set(taskId, controller);

      let ended = false;
      const send = (event: AskEvent | StoppedEvent) => {
        if (ended) return;
        if (isTerminalEvent(event)) ended = true;
        try {
          emit({ ...event, taskId });
        } catch {
          // The renderer is gone: nothing can see this task any more.
          ended = true;
          controller.abort();
        }
      };
      // Cancelling ends the task for the renderer at once; the pipeline unwinds quietly behind it.
      const stopped = new Promise<'stopped'>((resolve) => {
        controller.signal.addEventListener(
          'abort',
          () => {
            send({ type: 'stopped' });
            resolve('stopped');
          },
          { once: true }
        );
      });

      const run = async () => {
        let request: ReturnType<typeof validateAskRequest>;
        try {
          request = validateAskRequest(command);
        } catch (error) {
          send({ type: 'error', code: 'INVALID_REQUEST', message: describeFailure(error).message });
          return;
        }
        const apiKey = await storedKey();
        if (controller.signal.aborted) return;
        const stream = askStream(
          { search1api: apiKey ? { apiKey } : undefined, decide: deps.decide, cache, now: deps.now },
          { request: request.q, window: request.w, sources: request.s },
          { signal: controller.signal, budgetMs: OVERALL_BUDGET_MS }
        );
        for await (const event of stream) send(event);
      };

      try {
        const outcome = await Promise.race([
          run().then(
            () => ({ failed: false as const }),
            (error: unknown) => ({ failed: true as const, error })
          ),
          stopped,
        ]);
        if (outcome !== 'stopped' && !controller.signal.aborted) {
          if (outcome.failed) {
            const failure = describeFailure(outcome.error);
            send({ type: 'error', code: failure.code, message: failure.message || 'The search failed' });
          } else if (!ended) {
            send({ type: 'error', code: 'INCOMPLETE', message: 'The search ended without a result' });
          }
        }
      } finally {
        if (running.get(taskId) === controller) running.delete(taskId);
      }
    },

    cancel(command) {
      const controller = running.get(readTaskId(command));
      if (!controller) return { canceled: false };
      controller.abort();
      return { canceled: true };
    },

    async searchSettingsStatus() {
      return { search1apiConfigured: (await storedKey()) !== undefined };
    },

    async setSearch1ApiKey(command) {
      const apiKey = field(command, 'apiKey');
      if (typeof apiKey !== 'string') throw new Error('apiKey must be a string');
      const key = apiKey.trim();
      // The message never repeats the key.
      if (key === '' || key.length > MAX_KEY_LENGTH || /[\s\u0000-\u001f\u007f]/.test(key)) {
        throw new Error(`The Search1API key must be 1–${MAX_KEY_LENGTH} characters without spaces or control characters`);
      }
      await deps.keyStore.set(key);
      return { search1apiConfigured: true };
    },

    cancelAll() {
      const controllers = [...running.values()];
      for (const controller of controllers) controller.abort();
      return { canceled: controllers.length };
    },
  };
}
