import type { IntentEvent, LaneEvent } from '@/lib/pipeline';
import { SOURCES, sourceById, windowById } from '@/lib/sources';
import type { AskState } from '@/lib/use-ask';
import { cn } from '@/lib/utils';

function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
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
  if (!intent) {
    return <p className="text-sm text-muted-foreground animate-pulse">Reading the request…</p>;
  }
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
