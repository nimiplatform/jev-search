import type { AskState } from '@/lib/use-ask';

/**
 * Says something only when there is something to say: that the judge sent
 * a different query than the words typed. Counts live on the chips;
 * "still searching" is the chips' breathing icons. Before the request has
 * been read there is one line.
 */
export function Status({
  state,
  sort,
  onSort,
}: {
  state: AskState;
  /** Undefined hides the toggle (no time window, so "newest" means nothing). */
  sort?: 'best' | 'newest';
  onSort: (s: 'best' | 'newest') => void;
}) {
  const { intent } = state;
  const parts: React.ReactNode[] = [];

  if (!intent) {
    parts.push(<span className="animate-pulse" key="reading">Reading your request…</span>);
  } else {
    const rewritten = intent.query.trim().toLowerCase() !== intent.request.trim().toLowerCase();
    if (rewritten) {
      parts.push(
        <span key="query">
          {state.phase === 'done' ? 'Searched for' : 'Searching for'}{' '}
          <span className="font-medium text-foreground">“{intent.query}”</span>
        </span>
      );
    }
  }

  const showSort = Boolean(intent && sort);
  if (parts.length === 0 && !showSort) return null;

  return (
    <div className="flex items-baseline justify-between gap-4 text-sm text-muted-foreground">
      <p className="enter">
        {parts.map((p, i) => (
          <span key={i}>
            {i > 0 && <span className="mx-1.5 text-muted-foreground/50">·</span>}
            {p}
          </span>
        ))}
      </p>
      {showSort && (
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
