/**
 * SearchTransport over the Kit renderer bridge of the Desktop-supervised
 * Electron Host: commands go out with `invoke(command, payload)` and task
 * events come back on SEARCH_EVENT through `listenShell`. The bridge functions
 * are passed in, so this module has no Kit import and tests can drive it.
 */
import type { SearchTransport } from './host-transport';
import {
  SEARCH_COMMANDS,
  SEARCH_EVENT,
  isTerminalEvent,
  type SearchSettingsStatus,
  type TaskEvent,
} from './search-protocol';

/** `invoke` and `listenShell` from `@nimiplatform/kit/shell/renderer/bridge`. */
export interface ShellBridge {
  invoke(command: string, payload?: unknown): Promise<unknown>;
  /** Resolves to the unsubscribe function once the listener is registered. */
  listen(eventName: string, handler: (event: { payload: unknown }) => void): Promise<() => void>;
}

/**
 * The host sends a task's terminal event before its `ask` command resolves.
 * If the resolution arrives first, the event gets this long to follow; after
 * that the task ends without one, which the page reports as incomplete.
 */
export const TERMINAL_EVENT_GRACE_MS = 2_000;

export class ShellTransportError extends Error {
  readonly reasonCode: string;
  constructor(reasonCode: string, message: string) {
    super(message);
    this.name = 'ShellTransportError';
    this.reasonCode = reasonCode;
  }
}

export function createShellSearchTransport(
  bridge: ShellBridge,
  options: { terminalGraceMs?: number } = {}
): SearchTransport {
  const graceMs = options.terminalGraceMs ?? TERMINAL_EVENT_GRACE_MS;

  return {
    async ask(params, onEvent, signal) {
      if (signal.aborted) return;
      let ended = false;
      let markEnded: () => void = () => undefined;
      const terminal = new Promise<void>((resolve) => {
        markEnded = resolve;
      });
      // Listen before asking so no event of this task can be missed.
      const unsubscribe = await bridge.listen(SEARCH_EVENT, ({ payload }) => {
        if (ended || signal.aborted || !isEventOfTask(payload, params.taskId)) return;
        if (isTerminalEvent(payload)) ended = true;
        onEvent(payload);
        if (ended) markEnded();
      });
      let graceTimer: ReturnType<typeof setTimeout> | undefined;
      const cancel = () => {
        // Stopping keeps what has arrived; a failed cancel leaves nothing more to show.
        bridge.invoke(SEARCH_COMMANDS.cancel, { taskId: params.taskId }).catch(() => undefined);
      };
      try {
        if (signal.aborted) return;
        const aborted = new Promise<'aborted'>((resolve) => {
          signal.addEventListener('abort', () => resolve('aborted'), { once: true });
        });
        signal.addEventListener('abort', cancel, { once: true });
        const outcome = await Promise.race([
          terminal.then(() => 'ended' as const),
          bridge.invoke(SEARCH_COMMANDS.ask, params).then(() => 'answered' as const),
          aborted,
        ]);
        if (outcome === 'answered' && !ended) {
          const grace = new Promise<void>((resolve) => {
            graceTimer = setTimeout(resolve, graceMs);
          });
          await Promise.race([terminal, grace, aborted]);
        }
      } finally {
        if (graceTimer !== undefined) clearTimeout(graceTimer);
        signal.removeEventListener('abort', cancel);
        unsubscribe();
      }
    },

    async status() {
      return readSettingsStatus(await bridge.invoke(SEARCH_COMMANDS.searchSettingsStatus, {}));
    },

    async setKey(apiKey) {
      return readSettingsStatus(await bridge.invoke(SEARCH_COMMANDS.setSearch1ApiKey, { apiKey }));
    },
  };
}

function isEventOfTask(payload: unknown, taskId: string): payload is TaskEvent {
  if (typeof payload !== 'object' || payload === null) return false;
  const fields = payload as { taskId?: unknown; type?: unknown };
  return fields.taskId === taskId && typeof fields.type === 'string';
}

function readSettingsStatus(value: unknown): SearchSettingsStatus {
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    const fields = value as Record<string, unknown>;
    if (Object.keys(fields).length === 1 && typeof fields.search1apiConfigured === 'boolean') {
      return { search1apiConfigured: fields.search1apiConfigured };
    }
  }
  throw new ShellTransportError('SEARCH_SETTINGS_STATUS_INVALID', 'The search host returned an unexpected settings status.');
}
