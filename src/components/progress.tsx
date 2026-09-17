import type { IntentEvent, LaneEvent } from '@/lib/pipeline';
import { SOURCES, sourceById, windowById } from '@/lib/sources';
import type { AskState } from '@/lib/use-ask';
import { cn } from '@/lib/utils';

function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

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

/** One muted line: what the judge decided and how sure it was. */
export function Understanding({ intent }: { intent: IntentEvent }) {
  const wanted = SOURCES.filter((s) => intent.sources.includes(s.id));
  const skipped = SOURCES.filter((s) => !intent.sources.includes(s.id) && intent.inferred.sources[s.id] >= 0.25);
  const pickedIndex = intent.candidates.indexOf(intent.query);
  return (
    <p className="text-xs text-muted-foreground leading-relaxed">
      <span className="font-medium text-foreground/80">Read as:</span>{' '}
      {windowById(intent.window).label.toLowerCase()} ({pct(intent.inferred.window.confidence)})
      {' · '}
      {wanted.map((s) => `${s.label} ${pct(intent.inferred.sources[s.id])}`).join(', ')}
      {skipped.length > 0 && (
        <span> · skipped {skipped.map((s) => `${s.label} ${pct(intent.inferred.sources[s.id])}`).join(', ')}</span>
      )}
      {' · '}
      query <span className="text-foreground">“{intent.query}”</span>
      {intent.candidates.length > 1 && (
        <span>
          {' '}
          ({pct(intent.inferred.query.confidence)}, picked {pickedIndex + 1} of {intent.candidates.length})
        </span>
      )}
      {intent.entityQuery !== intent.query && intent.sources.some((id) => sourceById(id).lanes.some((l) => l.entityQuery)) && (
        <span>
          {' '}
          · lookup <span className="text-foreground">“{intent.entityQuery}”</span>
        </span>
      )}
      {' · '}
      {intent.intentMs} ms
    </p>
  );
}

function LaneDot({ lane }: { lane: LaneEvent | undefined }) {
  if (!lane) return <span className="inline-block size-1.5 rounded-full bg-primary animate-pulse" />;
  if (lane.error) return <span className="inline-block size-1.5 rounded-full bg-destructive" />;
  return <span className="inline-block size-1.5 rounded-full bg-foreground/70" />;
}

/** One row per source: each engine's state and timing, then the tally. */
export function Progress({ state }: { state: AskState }) {
  const { intent } = state;
  if (!intent) return null;
  return (
    <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
      {intent.sources.map((id) => {
        const source = sourceById(id);
        const lanes = source.lanes.map((l) => ({ engine: l.service, event: state.lanes[`${id}/${l.service}`] }));
        const done = lanes.every((l) => l.event);
        const items = state.items.filter((i) => i.source === id);
        const onBoth = items.filter((i) => i.engines.length > 1).length;
        const low = items.filter((i) => i.relevance < 0.3).length;
        const stale = lanes.reduce((n, l) => n + (l.event?.stale ?? 0), 0);
        return (
          <li className="flex flex-wrap items-center gap-x-3 gap-y-0.5" key={id}>
            <span className="w-24 shrink-0 font-medium text-foreground/80">{source.label}</span>
            {lanes.map(({ engine, event }) => (
              <span
                className={cn('inline-flex items-center gap-1.5', event?.error && 'text-destructive')}
                key={engine}
                title={event?.error ?? (event ? `search ${event.searchMs} ms · judge ${event.scoreMs} ms` : 'waiting')}
              >
                <LaneDot lane={event} />
                {engine}
                {event && !event.error && (
                  <span className="tabular-nums">
                    {event.items.length} · {((event.searchMs + event.scoreMs) / 1000).toFixed(1)}s
                  </span>
                )}
                {event?.error && <span>failed</span>}
              </span>
            ))}
            {done && items.length > 0 && (
              <span className="text-muted-foreground/80">
                → {items.length}
                {onBoth > 0 && `, ${onBoth} on both`}
                {low > 0 && `, ${low} off-topic`}
                {stale > 0 && `, ${stale} too old`}
              </span>
            )}
            {done && items.length === 0 && <span>→ nothing</span>}
          </li>
        );
      })}
      {state.phase === 'done' && state.totalMs !== null && (
        <li className="text-muted-foreground/80">all done in {(state.totalMs / 1000).toFixed(1)}s</li>
      )}
    </ul>
  );
}

/**
 * Placeholders at the foot of the list, one per source still searching, so
 * the reader sees where the next rows will come from and the list only ever
 * grows into space that was already reserved.
 */
export function PendingSources({ state }: { state: AskState }) {
  const { intent } = state;
  if (!intent || state.phase === 'done') return null;
  const pending = intent.sources.filter((id) =>
    sourceById(id).lanes.some((l) => !state.lanes[`${id}/${l.service}`])
  );
  if (pending.length === 0) return null;
  return (
    <ul className="mt-6 flex flex-col gap-4">
      {pending.map((id) => {
        const source = sourceById(id);
        const waiting = source.lanes.filter((l) => !state.lanes[`${id}/${l.service}`]).map((l) => l.service);
        return (
          <li className="animate-in fade-in duration-300" key={id}>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-block size-1.5 rounded-full bg-primary animate-pulse" />
              <span className="font-medium text-foreground/70">{source.label}</span>
              <span>· waiting for {waiting.join(', ')}</span>
            </div>
            <div className="mt-2 h-4 w-2/3 rounded bg-muted/70" />
            <div className="mt-1.5 h-3 w-full rounded bg-muted/50" />
          </li>
        );
      })}
    </ul>
  );
}
