/**
 * The fixed contract between the renderer and the desktop host that runs the
 * search. Commands go renderer → host through the shell bridge; task events
 * come back on one event channel, each tagged with the task it belongs to.
 * Framework-free and shared by both sides.
 */
import type { AskEvent } from './pipeline';
import type { SourceId, WindowId } from './sources';

/** Command names the host registers its handlers under. */
export const SEARCH_COMMANDS = {
  /** AskCommand → resolves when the task has ended; events arrive on SEARCH_EVENT. */
  ask: 'ask',
  /** CancelCommand → CancelResult. */
  cancel: 'cancel',
  /** No payload → SearchSettingsStatus. */
  searchSettingsStatus: 'searchSettingsStatus',
  /** SetSearch1ApiKeyCommand → SearchSettingsStatus. The key is never sent back. */
  setSearch1ApiKey: 'setSearch1ApiKey',
} as const;

/** The host → renderer event channel. Every payload is a TaskEvent. */
export const SEARCH_EVENT = 'search-event';

export interface AskCommand {
  /** Chosen by the renderer, unique per task: 1–128 letters, digits, `.`, `:`, `_` or `-`. */
  taskId: string;
  q: string;
  w?: WindowId;
  s?: SourceId[];
}

export interface CancelCommand {
  taskId: string;
}

export interface CancelResult {
  /** False when no task with that id was running. */
  canceled: boolean;
}

export interface SetSearch1ApiKeyCommand {
  apiKey: string;
}

export interface SearchSettingsStatus {
  search1apiConfigured: boolean;
}

/** The task was cancelled before it finished; whatever arrived before stays valid. */
export interface StoppedEvent {
  type: 'stopped';
}

/**
 * Everything the host sends about one task, in order. Each task ends with
 * exactly one terminal event (`done`, `error` or `stopped`) and nothing
 * follows it.
 */
export type TaskEvent = (AskEvent | StoppedEvent) & { taskId: string };

export type TerminalEvent = Extract<TaskEvent, { type: 'done' | 'error' | 'stopped' }>;

export function isTerminalEvent(event: { type: string }): boolean {
  return event.type === 'done' || event.type === 'error' || event.type === 'stopped';
}

const TASK_ID = /^[\w.:-]{1,128}$/;

export function isTaskId(value: unknown): value is string {
  return typeof value === 'string' && TASK_ID.test(value);
}
