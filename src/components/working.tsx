import { CheckIcon, ChevronRightIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { OFF_TOPIC } from './results';
import { sourceById, windowById, type SourceId } from '@/lib/sources';
import type { AskState } from '@/lib/use-ask';
import { cn } from '@/lib/utils';
import { SourceIcon } from './source-icon';

function list(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

type Line = { key: string; state: 'doing' | 'done' | 'failed'; text: React.ReactNode; icon?: SourceId };

/** Where each chosen source is, in words. */
function sourceLines(state: AskState): Line[] {
  const { intent } = state;
  if (!intent) return [];
  return intent.sources.map((id) => {
    const source = sourceById(id);
    const keys = source.lanes.map((l) => `${id}/${l.service}`);
    const answered = keys.filter((k) => k in state.found || k in state.lanes);
    const scored = keys.filter((k) => k in state.lanes);
    const found = keys.reduce((n, k) => n + (state.found[k] ?? 0), 0);
    const rows = state.items.filter((i) => i.source === id);
    const answering = rows.filter((i) => i.relevance >= OFF_TOPIC).length;
    const allFailed = scored.length === keys.length && scored.every((k) => state.lanes[k]?.error) && found === 0;

    if (allFailed) return { key: id, state: 'failed', icon: id, text: <>{source.label} didn't answer</> };
    if (answered.length === 0) return { key: id, state: 'doing', icon: id, text: <>Asking {source.label}…</> };
    if (scored.length < keys.length) {
      return {
        key: id,
        state: 'doing',
        icon: id,
        text: (
          <>
            {source.label} · {found} found{scored.length > 0 && `, ${answering} answer you so far`}
          </>
        ),
      };
    }
    return {
      key: id,
      state: 'done',
      icon: id,
      text: found === 0 ? <>{source.label} · nothing there</> : <>{source.label} · {answering} of {found} answer you</>,
    };
  });
}

function Mark({ state }: { state: Line['state'] }) {
  if (state === 'done') {
    return (
      <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-foreground/80 text-background">
        <CheckIcon className="size-2.5" strokeWidth={3} />
      </span>
    );
  }
  if (state === 'failed') return <span className="inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground">–</span>;
  return (
    <span className="inline-flex size-4 shrink-0 items-center justify-center">
      <span className="size-2 rounded-full bg-primary animate-pulse" />
    </span>
  );
}

/**
 * The wait, narrated. A block that fills the space where results will land
 * and grows a line per thing that happens, in plain words. Once results
 * are on screen it folds to one line that keeps updating; click to reopen.
 */
export function Working({ state }: { state: AskState }) {
  const [open, setOpen] = useState(true);
  const hasResults = state.items.length > 0;
  useEffect(() => {
    if (hasResults) setOpen(false);
  }, [hasResults]);
  useEffect(() => {
    if (state.phase === 'understanding') setOpen(true);
  }, [state.phase]);
  if (state.phase === 'idle' || state.phase === 'error') return null;

  const { intent } = state;
  const lines = sourceLines(state);
  const found = Object.values(state.found).reduce((n, c) => n + c, 0);
  const answering = state.items.filter((i) => i.relevance >= OFF_TOPIC).length;
  const pending = lines.filter((l) => l.state === 'doing');
  const window = intent && intent.window !== 'any' ? windowById(intent.window).label.toLowerCase() : null;

  let summary: React.ReactNode;
  if (!intent) summary = 'Reading your question…';
  else if (state.phase === 'done') {
    summary = (
      <>
        Asked {list(intent.sources.map((id) => sourceById(id).label))} · {found} found · {answering} answer you
        {state.totalMs !== null && <span className="text-muted-foreground/60"> · {(state.totalMs / 1000).toFixed(1)}s</span>}
      </>
    );
  } else if (pending.length > 0) {
    summary = (
      <>
        Still asking {list(pending.map((l) => sourceById(l.key as SourceId).label))}…
        {found > 0 && <span className="text-muted-foreground/70"> · {found} found so far</span>}
      </>
    );
  } else summary = 'Sorting…';

  return (
    <section className="mt-4 text-sm">
      <button
        className="flex w-full items-center gap-2 text-left text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <ChevronRightIcon className={cn('size-3.5 shrink-0 transition-transform duration-200', open && 'rotate-90')} />
        <span className={cn(!intent && 'animate-pulse')}>{summary}</span>
      </button>

      {open && (
        <ol className="enter mt-2 ml-1.5 flex flex-col gap-1.5 border-l pl-4">
          {intent && (
            <li className="flex items-center gap-2 text-muted-foreground">
              <Mark state="done" />
              <span>
                Looking for <span className="text-foreground">“{intent.query}”</span>
                {window && <span> · {window}</span>}
              </span>
            </li>
          )}
          {!intent && (
            <li className="flex items-center gap-2 text-foreground">
              <Mark state="doing" />
              <span>Reading your question</span>
            </li>
          )}
          {lines.map((line) => (
            <li
              className={cn(
                'enter flex items-center gap-2',
                line.state === 'doing' ? 'text-foreground' : 'text-muted-foreground'
              )}
              key={line.key}
            >
              <Mark state={line.state} />
              {line.icon && <SourceIcon className="size-3.5" id={line.icon} on={line.state !== 'failed'} />}
              <span>{line.text}</span>
            </li>
          ))}
          {state.phase === 'done' && state.totalMs !== null && (
            <li className="flex items-center gap-2 text-muted-foreground">
              <Mark state="done" />
              <span>Done in {(state.totalMs / 1000).toFixed(1)}s</span>
            </li>
          )}
        </ol>
      )}
    </section>
  );
}
