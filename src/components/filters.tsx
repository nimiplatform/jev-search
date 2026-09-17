import { SOURCES, WINDOWS, sourceById, type SourceId, type WindowId } from '@/lib/sources';
import { SourceIcon } from './source-icon';
import type { AskState } from '@/lib/use-ask';
import { cn } from '@/lib/utils';

const chip =
  'chip inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm text-muted-foreground hover:bg-accent disabled:opacity-50';
/** Selected: the brand icon in colour, dark text, a firmer border. Never a filled block. */
const active = 'border-foreground/50 bg-accent/60 text-foreground';

/**
 * The only place that says where we are looking. Rendered from the first
 * frame in a neutral state; when the judge has read the request the chosen
 * chips light up, and each one shows its own progress: a breathing dot
 * while its engines run, a count once they have reported.
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
  const { intent } = state;
  const selected = new Set(intent?.sources ?? []);
  const ready = Boolean(intent);

  const toggleSource = (id: SourceId) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    if (next.size === 0) return;
    onSources([...next]);
  };

  const counts = new Map<SourceId, number>();
  for (const item of state.items) counts.set(item.source, (counts.get(item.source) ?? 0) + 1);


  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {WINDOWS.map((w) => (
          <button
            className={cn(chip, ready && intent!.window === w.id && active)}
            disabled={!ready}
            key={w.id}
            onClick={() => onWindow(w.id === intent?.window && explicitWindow ? undefined : w.id)}
            type="button"
          >
            {w.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {SOURCES.map((s) => {
          const on = selected.has(s.id);
          const lanes = sourceById(s.id).lanes;
          const done = on && lanes.every((l) => state.lanes[`${s.id}/${l.service}`]);
          const count = counts.get(s.id) ?? 0;
          return (
            <button
              className={cn(chip, on && active)}
              disabled={!ready}
              key={s.id}
              onClick={() => toggleSource(s.id)}
              type="button"
            >
              <SourceIcon className="size-3.5" id={s.id} on={on} />
              {s.label}
              {done && <span className="enter text-xs text-muted-foreground tabular-nums">{count}</span>}
            </button>
          );
        })}
        {explicitSources && (
          <button className="text-xs text-muted-foreground underline" onClick={() => onSources(undefined)} type="button">
            reset
          </button>
        )}
      </div>
    </div>
  );
}
