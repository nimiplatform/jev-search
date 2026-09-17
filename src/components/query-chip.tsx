import { useNavigate } from '@tanstack/react-router';
import { PencilIcon } from 'lucide-react';
import { useState } from 'react';
import type { SourceId, WindowId } from '@/lib/sources';
import { cn } from '@/lib/utils';

/**
 * The words the judge pulled out of the question, as the first chip of the
 * row so the row reads as "look for THIS · in this window · here, here and
 * here". Click to edit: the edited words become the whole request.
 */
export function QueryChip({
  query,
  ready,
  w,
  s,
}: {
  query: string | null;
  ready: boolean;
  w: WindowId | undefined;
  s: SourceId[] | undefined;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(query ?? '');
  const navigate = useNavigate();

  if (!ready || query === null) {
    return <span className="chip inline-flex h-8 min-w-24 items-center rounded-full border border-dashed px-3" />;
  }

  if (editing) {
    return (
      <form
        className="inline-flex"
        onSubmit={(event) => {
          event.preventDefault();
          const q = value.trim();
          setEditing(false);
          if (q && q !== query) navigate({ to: '/search', search: { q, w, s: s?.join(',') } });
        }}
      >
        <input
          autoFocus
          className="h-8 rounded-full border border-foreground bg-background px-3 text-sm font-medium outline-none"
          onBlur={() => setEditing(false)}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setEditing(false);
          }}
          size={Math.max(8, value.length)}
          value={value}
        />
      </form>
    );
  }

  return (
    <button
      className={cn(
        'chip inline-flex h-8 items-center gap-1.5 rounded-full border border-foreground bg-foreground/5 px-3 text-sm font-medium text-foreground hover:bg-foreground/10'
      )}
      onClick={() => {
        setValue(query);
        setEditing(true);
      }}
      title="What we are looking for. Click to change it."
      type="button"
    >
      {query}
      <PencilIcon className="size-3 opacity-50" />
    </button>
  );
}
