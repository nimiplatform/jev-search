import { CheckIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { sourceById } from '@/lib/sources';
import type { AskState } from '@/lib/use-ask';
import { cn } from '@/lib/utils';

type StepState = 'todo' | 'doing' | 'done';

function Mark({ state }: { state: StepState }) {
  if (state === 'done') {
    return (
      <span className="inline-flex size-4 items-center justify-center rounded-full bg-foreground text-background">
        <CheckIcon className="size-2.5" strokeWidth={3} />
      </span>
    );
  }
  if (state === 'doing') {
    return (
      <span className="inline-flex size-4 items-center justify-center">
        <span className="size-2 rounded-full bg-primary animate-pulse" />
      </span>
    );
  }
  return (
    <span className="inline-flex size-4 items-center justify-center">
      <span className="size-2 rounded-full border border-muted-foreground/50" />
    </span>
  );
}

function list(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * The three things that happen, in the order they happen, in plain words.
 * Fades away once everything is done so only the results remain.
 */
export function Steps({ state }: { state: AskState }) {
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (state.phase !== 'done') {
      setGone(false);
      return;
    }
    const t = setTimeout(() => setGone(true), 900);
    return () => clearTimeout(t);
  }, [state.phase]);
  if (gone || state.phase === 'idle' || state.phase === 'error') return null;

  const { intent } = state;
  const read: StepState = intent ? 'done' : 'doing';

  let search: StepState = 'todo';
  let sort: StepState = 'todo';
  let found = 0;
  let names: string[] = [];
  if (intent) {
    names = intent.sources.map((id) => sourceById(id).label);
    const lanes = intent.sources.flatMap((id) => sourceById(id).lanes.map((l) => `${id}/${l.service}`));
    const answered = lanes.filter((k) => k in state.found || k in state.lanes);
    const scored = lanes.filter((k) => k in state.lanes);
    found = Object.values(state.found).reduce((n, c) => n + c, 0);
    search = answered.length === lanes.length ? 'done' : 'doing';
    sort = state.phase === 'done' ? 'done' : scored.length > 0 || answered.length > 0 ? 'doing' : 'todo';
  }

  const rows: { state: StepState; text: React.ReactNode }[] = [
    { state: read, text: read === 'done' ? 'Read your question' : 'Reading your question' },
    {
      state: search,
      text: intent ? (
        <>
          {search === 'done' ? 'Searched' : 'Searching'} {list(names)}
          {found > 0 && <span className="text-muted-foreground/70"> · {found} found</span>}
        </>
      ) : (
        'Search'
      ),
    },
    { state: sort, text: sort === 'done' ? 'Sorted by how well each one answers you' : 'Sorting by how well each one answers you' },
  ];

  return (
    <ol
      className={cn(
        'mt-4 flex flex-col gap-1.5 text-sm transition-opacity duration-500',
        state.phase === 'done' && 'opacity-0'
      )}
    >
      {rows.map((row, i) => (
        <li
          className={cn(
            'flex items-center gap-2.5 transition-colors duration-300',
            row.state === 'todo' ? 'text-muted-foreground/60' : row.state === 'doing' ? 'text-foreground' : 'text-muted-foreground'
          )}
          key={i}
        >
          <Mark state={row.state} />
          <span>{row.text}</span>
        </li>
      ))}
    </ol>
  );
}
