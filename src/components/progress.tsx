import type { AskState } from '@/lib/use-ask';
import { sourceById } from '@/lib/sources';
import { cn } from '@/lib/utils';

/** One dot per source: pulsing while its engines run, solid once scored. */
export function Progress({ state }: { state: AskState }) {
  if (!state.intent) {
    return <p className="text-sm text-muted-foreground animate-pulse">Reading the request…</p>;
  }
  const counts = new Map<string, number>();
  for (const item of state.items) counts.set(item.source, (counts.get(item.source) ?? 0) + 1);
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {state.intent.sources.map((id) => {
        const status = state.status[id];
        return (
          <li className="flex items-center gap-1.5" key={id}>
            <span
              className={cn(
                'inline-block size-1.5 rounded-full',
                status === 'done' ? 'bg-foreground/70' : 'bg-primary animate-pulse'
              )}
            />
            {sourceById(id).label}
            {status === 'done' && <span>· {counts.get(id) ?? 0}</span>}
          </li>
        );
      })}
      {state.phase === 'done' && state.totalMs !== null && <li>· {state.totalMs} ms</li>}
    </ul>
  );
}
