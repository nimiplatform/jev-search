import { sourceById } from '@/lib/sources';
import type { AskState } from '@/lib/use-ask';
import { cn } from '@/lib/utils';

/** How many engine lanes are in flight and how many have reported. */
export function laneProgress(state: AskState): { done: number; total: number } {
  if (!state.intent) return { done: 0, total: 0 };
  const total = state.intent.sources.reduce((n, id) => n + sourceById(id).lanes.length, 0);
  return { done: Object.keys(state.lanes).length, total };
}

/**
 * Thin line under the search box. Indeterminate while the judge reads the
 * request, then advances one step per engine lane that has reported, so
 * its motion is the real progress and nothing else.
 */
export function ProgressBar({ state }: { state: AskState }) {
  const { done, total } = laneProgress(state);
  const active = state.phase === 'understanding' || state.phase === 'searching';
  const reading = state.phase === 'understanding';
  const width = reading ? 8 : total === 0 ? 0 : Math.max(8, Math.round((done / total) * 100));
  return (
    <div
      aria-hidden
      className={cn(
        'absolute inset-x-0 bottom-0 h-0.5 overflow-hidden transition-opacity duration-500',
        active ? 'opacity-100' : 'opacity-0'
      )}
    >
      <div
        className={cn('h-full bg-primary transition-[width] duration-500 ease-out', reading && 'animate-pulse')}
        style={{ width: `${state.phase === 'done' ? 100 : width}%` }}
      />
    </div>
  );
}
