import type { AskState } from './ask-session';
import { relevanceGroup } from './rank';
import { isSourceId, sourceById, type SourceId } from './sources';

/**
 * Where one chosen source stands.
 * - waiting: no engine has answered yet
 * - judging: some engine answered, not every lane has finished
 * - done: every lane finished and none failed
 * - partial: every lane finished and some, not all, failed
 * - failed: every lane failed
 * - unfinished: the task ended (stopped or failed) before every lane finished
 */
export type SourceStatus = 'waiting' | 'judging' | 'done' | 'partial' | 'failed' | 'unfinished';

export interface LaneFailure {
  engine: string;
  /** Set for a general engine restricted to one site. */
  site?: string;
  message: string;
  code?: string;
}

export interface SourceProgress {
  id: SourceId;
  status: SourceStatus;
  lanes: number;
  finished: number;
  /** Rows the engines returned within the window. */
  found: number;
  /** Rows judged on topic. */
  answering: number;
  /** Rows whose relevance could not be judged. */
  unscored: number;
  failures: LaneFailure[];
}

export function sourceProgress(state: AskState): SourceProgress[] {
  const { intent } = state;
  if (!intent) return [];
  const ended = state.phase === 'done' || state.phase === 'stopped' || state.phase === 'error';
  return intent.sources.map((id) => {
    const lanes = sourceById(id).lanes;
    const keys = lanes.map((lane) => `${id}/${lane.service}`);
    const finished = keys.filter((key) => key in state.lanes).length;
    const answered = keys.filter((key) => key in state.found || key in state.lanes).length;
    const found = keys.reduce((n, key) => n + (state.found[key] ?? 0), 0);
    const rows = state.items.filter((item) => item.source === id);
    const failures: LaneFailure[] = [];
    lanes.forEach((lane, i) => {
      const event = state.lanes[keys[i]!];
      if (event?.error) {
        failures.push({
          engine: lane.service,
          ...(lane.site ? { site: lane.site } : {}),
          message: event.error,
          ...(event.errorCode ? { code: event.errorCode } : {}),
        });
      }
    });

    let status: SourceStatus;
    if (finished === keys.length) {
      status = failures.length === keys.length ? 'failed' : failures.length > 0 ? 'partial' : 'done';
    } else if (ended) status = 'unfinished';
    else status = answered === 0 ? 'waiting' : 'judging';

    return {
      id,
      status,
      lanes: keys.length,
      finished,
      found,
      answering: rows.filter((item) => relevanceGroup(item) === 'on-topic').length,
      unscored: rows.filter((item) => relevanceGroup(item) === 'unscored').length,
      failures,
    };
  });
}

/** "Google (reddit.com)" for a site-restricted lane, else the engine's own name. */
export function engineLabel(failure: Pick<LaneFailure, 'engine' | 'site'>): string {
  const name = isSourceId(failure.engine) ? sourceById(failure.engine).label : failure.engine;
  return failure.site ? `${name} (${failure.site})` : name;
}
