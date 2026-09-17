import { Badge } from '@/components/ui/badge';
import type { SearchOutput } from '@/lib/pipeline';
import { SOURCES, WINDOWS, type SourceId, type WindowId } from '@/lib/sources';
import { cn } from '@/lib/utils';

const chip =
  'rounded-full border px-3 py-1 text-sm transition-colors hover:bg-accent disabled:opacity-50';
const active = 'border-foreground bg-foreground text-background hover:bg-foreground';

export function Filters({
  data,
  explicitWindow,
  explicitSources,
  onWindow,
  onSources,
}: {
  data: SearchOutput;
  explicitWindow: WindowId | undefined;
  explicitSources: SourceId[] | undefined;
  onWindow: (w: WindowId | undefined) => void;
  onSources: (s: SourceId[] | undefined) => void;
}) {
  const selected = new Set(data.sources);

  const toggleSource = (id: SourceId) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    if (next.size === 0) return;
    onSources([...next]);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {WINDOWS.map((w) => (
          <button
            className={cn(chip, data.window === w.id && active)}
            key={w.id}
            onClick={() => onWindow(w.id === data.window && explicitWindow ? undefined : w.id)}
            type="button"
          >
            {w.label}
          </button>
        ))}
        {!explicitWindow && (
          <Badge variant="outline" className="text-muted-foreground">
            inferred · {Math.round(data.inferred.window.confidence * 100)}%
          </Badge>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {SOURCES.map((s) => (
          <button
            className={cn(chip, selected.has(s.id) && active)}
            key={s.id}
            onClick={() => toggleSource(s.id)}
            title={`${Math.round(data.inferred.sources[s.id] * 100)}% likely wanted`}
            type="button"
          >
            {s.label}
          </button>
        ))}
        {!explicitSources && (
          <Badge variant="outline" className="text-muted-foreground">
            inferred
          </Badge>
        )}
        {explicitSources && (
          <button className="text-xs text-muted-foreground underline" onClick={() => onSources(undefined)} type="button">
            reset
          </button>
        )}
      </div>
    </div>
  );
}
