/**
 * The renderer's side of a search, without React: one task at a time, each
 * with a fresh task id. Events are applied only when they carry the current
 * task id and the task has not ended, so a replaced or stopped task can never
 * change what is on screen.
 */
import { describeFailure, type Failure } from './failure';
import type { SearchTransport } from './host-transport';
import { mergeItems } from './merge';
import type { IntentEvent, LaneEvent } from './pipeline';
import type { RankedItem } from './rank';
import type { AskCommand, TaskEvent } from './search-protocol';
import type { SourceId, WindowId } from './sources';

export type AskPhase = 'idle' | 'understanding' | 'searching' | 'done' | 'stopped' | 'error';

export interface AskState {
  phase: AskPhase;
  /** The task everything below belongs to. */
  taskId: string | null;
  intent: IntentEvent | null;
  /** Judged lanes folded by URL as they arrive. */
  items: RankedItem[];
  /** Lanes whose engine has answered (rows may still be unjudged), keyed `${source}/${engine}`. */
  found: Record<string, number>;
  /** Every finished lane, keyed `${source}/${engine}`. */
  lanes: Record<string, LaneEvent>;
  totalMs: number | null;
  /** The overall budget cut a search or a judgment short. */
  timedOut: boolean;
  error: Failure | null;
}

export interface AskParams {
  q: string;
  w?: WindowId;
  s?: SourceId[];
}

export const IDLE: AskState = {
  phase: 'idle',
  taskId: null,
  intent: null,
  items: [],
  found: {},
  lanes: {},
  totalMs: null,
  timedOut: false,
  error: null,
};

export const HOST_UNAVAILABLE = 'HOST_UNAVAILABLE';
export const HOST_TASK_INCOMPLETE = 'HOST_TASK_INCOMPLETE';

export function isRunning(state: AskState): boolean {
  return state.phase === 'understanding' || state.phase === 'searching';
}

/** Applies one host event. Anything for another task, or after the task ended, is ignored. */
export function applyTaskEvent(state: AskState, event: TaskEvent): AskState {
  if (event.taskId !== state.taskId || !isRunning(state)) return state;
  switch (event.type) {
    case 'intent': {
      const { taskId: _taskId, ...intent } = event;
      return { ...state, phase: 'searching', intent };
    }
    case 'found':
      return { ...state, found: { ...state.found, [`${event.source}/${event.engine}`]: event.items.length } };
    case 'lane': {
      const { taskId: _taskId, ...lane } = event;
      const key = `${event.source}/${event.engine}`;
      return {
        ...state,
        items: mergeItems(state.items, event.items),
        found: { ...state.found, [key]: event.items.length },
        lanes: { ...state.lanes, [key]: lane },
      };
    }
    case 'done':
      return { ...state, phase: 'done', totalMs: event.totalMs, timedOut: event.timedOut };
    case 'error':
      return { ...state, phase: 'error', error: { code: event.code, message: event.message } };
    case 'stopped':
      return { ...state, phase: 'stopped' };
  }
}

export interface AskSession {
  readonly state: AskState;
  /** Cancels the current task, if any, and starts a new one, even for the same parameters. */
  start(params: AskParams): void;
  /** Cancels the running task and keeps what has arrived, marked as stopped. */
  stop(): void;
  /** Cancels the running task; the session reports nothing afterwards. */
  dispose(): void;
}

let sequence = 0;

export function newTaskId(): string {
  sequence += 1;
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `task-${sequence}-${random}`;
}

export function createAskSession(
  transport: SearchTransport | null,
  onChange: (state: AskState) => void,
  nextTaskId: () => string = newTaskId
): AskSession {
  let state = IDLE;
  let running: AbortController | null = null;
  let disposed = false;

  const set = (next: AskState) => {
    if (disposed || next === state) return;
    state = next;
    onChange(state);
  };
  const fail = (taskId: string, failure: Failure) => {
    if (state.taskId === taskId && isRunning(state)) set({ ...state, phase: 'error', error: failure });
  };
  const cancelRunning = () => {
    running?.abort();
    running = null;
  };

  return {
    get state() {
      return state;
    },
    start(params) {
      if (disposed) return;
      cancelRunning();
      if (!params.q.trim()) {
        set(IDLE);
        return;
      }
      const taskId = nextTaskId();
      set({ ...IDLE, phase: 'understanding', taskId });
      if (!transport) {
        fail(taskId, { code: HOST_UNAVAILABLE, message: 'The search host is not connected.' });
        return;
      }
      const controller = new AbortController();
      running = controller;
      const command: AskCommand = {
        taskId,
        q: params.q,
        ...(params.w ? { w: params.w } : {}),
        ...(params.s ? { s: params.s } : {}),
      };
      let task: Promise<void>;
      try {
        task = transport.ask(command, (event) => set(applyTaskEvent(state, event)), controller.signal);
      } catch (error) {
        task = Promise.reject(error);
      }
      task
        .then(
          () => fail(taskId, { code: HOST_TASK_INCOMPLETE, message: 'The search host ended the task without a result.' }),
          (error: unknown) => {
            if (!controller.signal.aborted) fail(taskId, describeFailure(error));
          }
        )
        .finally(() => {
          if (running === controller) running = null;
        });
    },
    stop() {
      if (!running || !isRunning(state)) return;
      cancelRunning();
      set({ ...state, phase: 'stopped' });
    },
    dispose() {
      cancelRunning();
      disposed = true;
    },
  };
}
