import { sourceById } from '@/lib/sources';
import type { AskState } from '@/lib/use-ask';

function list(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * One plain sentence about what is happening, written for the person who
 * typed the request.
 */
export function Status({
  state,
  hiddenOffTopic,
  sort,
  onSort,
}: {
  state: AskState;
  hiddenOffTopic: number;
  /** Undefined hides the toggle (no time window, so "newest" means nothing). */
  sort?: 'best' | 'newest';
  onSort: (s: 'best' | 'newest') => void;
}) {
  const { intent } = state;
  let text: React.ReactNode;
  if (!intent) {
    text = <span className="animate-pulse">Reading your request…</span>;
  } else {
    const query = <span className="font-medium text-foreground">“{intent.query}”</span>;
    const pending = intent.sources.filter((id) =>
      sourceById(id).lanes.some((l) => !state.lanes[`${id}/${l.service}`])
    );
    if (state.phase === 'done') {
      text = (
        <>
          {state.items.length} results for {query}
          {hiddenOffTopic > 0 && ` · ${hiddenOffTopic} off-topic hidden below`}
        </>
      );
    } else {
      text = (
        <>
          Looking for {query} on {list(intent.sources.map((id) => sourceById(id).label))}
          {pending.length > 0 && pending.length < intent.sources.length && (
            <span className="text-muted-foreground/70"> · still checking {list(pending.map((id) => sourceById(id).label))}</span>
          )}
          …
        </>
      );
    }
  }
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm text-muted-foreground">
      <p>{text}</p>
      {intent && sort && (
        <span className="ml-auto shrink-0 text-xs">
          {(['best', 'newest'] as const).map((s, i) => (
            <button
              className={s === sort ? 'text-foreground font-medium' : 'hover:text-foreground'}
              key={s}
              onClick={() => onSort(s)}
              type="button"
            >
              {i > 0 && <span className="mx-1.5 text-muted-foreground/50">·</span>}
              {s === 'best' ? 'Best match' : 'Newest'}
            </button>
          ))}
        </span>
      )}
    </div>
  );
}
