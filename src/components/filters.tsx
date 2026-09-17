import { ChevronDownIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { SOURCES, WINDOWS, sourceById, windowById, type SourceId, type WindowId } from '@/lib/sources';
import type { AskState } from '@/lib/use-ask';
import { cn } from '@/lib/utils';
import { SourceIcon } from './source-icon';

const chip =
  'chip inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm text-muted-foreground hover:bg-accent disabled:opacity-50';
const active = 'border-foreground/50 bg-accent/60 text-foreground';

/**
 * One row that is both the judge's reading of the question and the progress
 * of the search: the time window, then the sources it chose, each with its
 * count once its results are in. Before the question has been read the row
 * says so, at the same height, so nothing jumps. Everything not chosen is
 * behind "more".
 */
export function Filters({
  state,
  explicitWindow,
  explicitSources,
  onWindow,
  onSources,
}: {
  state: AskState;
  explicitWindow: WindowId | undefined;
  explicitSources: SourceId[] | undefined;
  onWindow: (w: WindowId | undefined) => void;
  onSources: (s: SourceId[] | undefined) => void;
}) {
  const [showWindows, setShowWindows] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const { intent } = state;

  if (!intent) {
    return (
      <div className="flex h-8 items-center text-sm text-muted-foreground">
        <span className="animate-pulse">Reading your question…</span>
      </div>
    );
  }

  const selected = new Set(intent.sources);
  const counts = new Map<SourceId, number>();
  for (const item of state.items) counts.set(item.source, (counts.get(item.source) ?? 0) + 1);

  const toggleSource = (id: SourceId) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    if (next.size === 0) return;
    onSources([...next]);
  };

  const chosen = SOURCES.filter((s) => selected.has(s.id));
  const others = SOURCES.filter((s) => !selected.has(s.id));

  return (
    <div className="enter flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          className={cn(chip, active)}
          onClick={() => setShowWindows((v) => !v)}
          title="How far back to look"
          type="button"
        >
          {windowById(intent.window).label}
          <ChevronDownIcon className={cn('size-3.5 opacity-60 transition-transform', showWindows && 'rotate-180')} />
        </button>
        <span className="text-muted-foreground/40">·</span>
        {chosen.map((s) => {
          const done = sourceById(s.id).lanes.every((l) => state.lanes[`${s.id}/${l.service}`]);
          return (
            <button
              className={cn(chip, active)}
              key={s.id}
              onClick={() => toggleSource(s.id)}
              title={`Searching ${s.label}. Click to leave it out.`}
              type="button"
            >
              <SourceIcon className="size-3.5" id={s.id} on />
              {s.label}
              {done && <span className="enter text-xs text-muted-foreground tabular-nums">{counts.get(s.id) ?? 0}</span>}
            </button>
          );
        })}
        {others.length > 0 && (
          <button
            className={cn(chip, 'border-dashed')}
            onClick={() => setShowMore((v) => !v)}
            title="Other places to look"
            type="button"
          >
            <PlusIcon className="size-3.5" />
            {showMore ? 'less' : 'more'}
          </button>
        )}
        {(explicitWindow || explicitSources) && (
          <button
            className="text-xs text-muted-foreground underline"
            onClick={() => {
              onWindow(undefined);
              onSources(undefined);
            }}
            type="button"
          >
            let Jev decide
          </button>
        )}
      </div>

      {showWindows && (
        <div className="enter flex flex-wrap items-center gap-2">
          {WINDOWS.map((w) => (
            <button
              className={cn(chip, intent.window === w.id && active)}
              key={w.id}
              onClick={() => {
                setShowWindows(false);
                onWindow(w.id);
              }}
              type="button"
            >
              {w.label}
            </button>
          ))}
        </div>
      )}

      {showMore && (
        <div className="enter flex flex-wrap items-center gap-2">
          {others.map((s) => (
            <button className={chip} key={s.id} onClick={() => toggleSource(s.id)} type="button">
              <SourceIcon className="size-3.5" id={s.id} on={false} />
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
