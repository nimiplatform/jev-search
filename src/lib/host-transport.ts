/**
 * How the renderer reaches the search host. The desktop shell provides the
 * implementation over its bridge (`invoke(command, payload)` for the
 * SEARCH_COMMANDS, a listener on SEARCH_EVENT for task events); tests use an
 * in-process fake. The renderer never talks to Search1API or to the decision
 * capability directly.
 */
import type { AskCommand, SearchSettingsStatus, TaskEvent } from './search-protocol';

export type { AskCommand, SearchSettingsStatus, TaskEvent } from './search-protocol';

export interface SearchTransport {
  /**
   * Runs one search task. `onEvent` receives that task's events only, in
   * order, ending with exactly one terminal event (`done`, `error` or
   * `stopped`); the promise resolves after the terminal event has been
   * delivered. Aborting `signal` sends the cancel command for the task and
   * resolves without waiting for more events. Rejects when the host cannot
   * be reached or refuses the command.
   */
  ask(params: AskCommand, onEvent: (event: TaskEvent) => void, signal: AbortSignal): Promise<void>;
  /** Whether the host has a Search1API key. Never returns the key. */
  status(): Promise<SearchSettingsStatus>;
  /** Hands the key to the host once; the host stores it privately and reports only the status. */
  setKey(apiKey: string): Promise<SearchSettingsStatus>;
}
