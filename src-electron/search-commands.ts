/**
 * The App's own Host commands, registered with Kit's `appCommandHandlers` under
 * the fixed SEARCH_COMMANDS names. Each payload must have exactly its declared
 * fields. `ask` streams every task event to the asking page on SEARCH_EVENT and
 * resolves after the task's terminal event. A task whose page is destroyed,
 * crashes or loads another document is cancelled.
 */
import type { NimiElectronCommandHandler, NimiElectronCommandHandlerInput } from '@nimiplatform/kit/shell/electron/main';
import type { SearchHost } from '../host/search-host';
import { SEARCH_COMMANDS, SEARCH_EVENT, type AskCommand } from '../src/lib/search-protocol';

export type SearchCommandName = (typeof SEARCH_COMMANDS)[keyof typeof SEARCH_COMMANDS];

export const PAYLOAD_INVALID = 'SEARCH_COMMAND_PAYLOAD_INVALID';
export const COMMAND_REJECTED = 'SEARCH_COMMAND_REJECTED';
export const EVENTS_UNAVAILABLE = 'SEARCH_EVENTS_UNAVAILABLE';

/** A command refused by this App's Host, with a reason code the page can show. */
export class SearchCommandError extends Error {
  readonly code = 'invalid-payload';
  readonly reasonCode: string;
  constructor(reasonCode: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SearchCommandError';
    this.reasonCode = reasonCode;
  }
}

export function createSearchCommandHandlers(host: SearchHost): Record<SearchCommandName, NimiElectronCommandHandler> {
  return {
    [SEARCH_COMMANDS.ask]: async ({ payload, sendEvent, event }) => {
      const command = readAskCommand(payload);
      if (!sendEvent) throw new SearchCommandError(EVENTS_UNAVAILABLE, 'The page cannot receive search events.');
      const unwatch = watchPage(event?.sender, () => {
        try {
          host.cancel({ taskId: command.taskId });
        } catch {
          // Nothing is running under a malformed id; ask rejects it below.
        }
      });
      try {
        await host.ask(command, (taskEvent) => sendEvent(SEARCH_EVENT, taskEvent));
      } catch (error) {
        throw labeled(error);
      } finally {
        unwatch();
      }
      return null;
    },

    [SEARCH_COMMANDS.cancel]: async ({ payload }) => {
      const record = exactFields(payload, SEARCH_COMMANDS.cancel, ['taskId']);
      try {
        return host.cancel({ taskId: text(record, 'taskId', SEARCH_COMMANDS.cancel) });
      } catch (error) {
        throw labeled(error);
      }
    },

    [SEARCH_COMMANDS.searchSettingsStatus]: async ({ payload }) => {
      exactFields(payload, SEARCH_COMMANDS.searchSettingsStatus, []);
      try {
        return await host.searchSettingsStatus();
      } catch (error) {
        throw labeled(error);
      }
    },

    [SEARCH_COMMANDS.setSearch1ApiKey]: async ({ payload }) => {
      const record = exactFields(payload, SEARCH_COMMANDS.setSearch1ApiKey, ['apiKey']);
      const apiKey = text(record, 'apiKey', SEARCH_COMMANDS.setSearch1ApiKey);
      try {
        return await host.setSearch1ApiKey({ apiKey });
      } catch (error) {
        throw labeled(error);
      }
    },
  };
}

function readAskCommand(payload: unknown): AskCommand {
  const name = SEARCH_COMMANDS.ask;
  const record = exactFields(payload, name, ['taskId', 'q'], ['w', 's']);
  const command: AskCommand = { taskId: text(record, 'taskId', name), q: text(record, 'q', name) };
  if (record.w !== undefined) command.w = text(record, 'w', name) as AskCommand['w'];
  if (record.s !== undefined) {
    if (!Array.isArray(record.s) || !record.s.every((entry) => typeof entry === 'string')) {
      throw new SearchCommandError(PAYLOAD_INVALID, `${name} payload field s must be a list of source ids.`);
    }
    // The host bounds the list and keeps only supported sources.
    command.s = [...record.s] as AskCommand['s'];
  }
  return command;
}

function exactFields(
  payload: unknown,
  command: string,
  required: readonly string[],
  optional: readonly string[] = []
): Record<string, unknown> {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new SearchCommandError(PAYLOAD_INVALID, `${command} payload must be an object.`);
  }
  const record = payload as Record<string, unknown>;
  const allowed = new Set([...required, ...optional]);
  for (const field of Object.keys(record)) {
    if (!allowed.has(field)) {
      // Name the field only when it looks like one; the message never repeats values.
      const shown = /^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(field) ? ` ${field}` : '';
      throw new SearchCommandError(PAYLOAD_INVALID, `${command} payload has an unsupported field${shown}.`);
    }
  }
  for (const field of required) {
    if (!Object.hasOwn(record, field)) {
      throw new SearchCommandError(PAYLOAD_INVALID, `${command} payload is missing ${field}.`);
    }
  }
  return record;
}

function text(record: Record<string, unknown>, field: string, command: string): string {
  const value = record[field];
  if (typeof value !== 'string') {
    throw new SearchCommandError(PAYLOAD_INVALID, `${command} payload field ${field} must be a string.`);
  }
  return value;
}

/**
 * Host errors without a reason code would otherwise reach the page labelled as
 * a Runtime stream failure; give them this App's own code and keep the message.
 */
function labeled(error: unknown): unknown {
  if (typeof error === 'object' && error !== null) {
    const fields = error as { reasonCode?: unknown; code?: unknown };
    if (typeof fields.reasonCode === 'string' || typeof fields.code === 'string') return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  return new SearchCommandError(COMMAND_REJECTED, message, { cause: error });
}

type PageSender = NonNullable<NimiElectronCommandHandlerInput['event']['sender']>;

/** Calls `onGone` when the page is destroyed, its renderer dies, or it starts loading another document. */
function watchPage(sender: PageSender | undefined, onGone: () => void): () => void {
  if (!sender?.on || !sender.removeListener) return () => undefined;
  const gone = () => onGone();
  const navigation = (details: unknown) => {
    // In-page (hash) navigation keeps the page; a reload or another document replaces it.
    const fields = typeof details === 'object' && details !== null ? (details as Record<string, unknown>) : {};
    if (fields.isMainFrame === true && fields.isSameDocument === false) onGone();
  };
  sender.on('destroyed', gone);
  sender.on('render-process-gone', gone);
  sender.on('did-start-navigation', navigation);
  return () => {
    sender.removeListener?.('destroyed', gone);
    sender.removeListener?.('render-process-gone', gone);
    sender.removeListener?.('did-start-navigation', navigation);
  };
}
