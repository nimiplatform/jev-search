import { CheckIcon, ChevronDownIcon, LoaderCircleIcon, SquareIcon, TriangleAlertIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { relevanceGroup } from '@/lib/rank';
import { sourceProgress, type SourceProgress } from '@/lib/progress';
import { sourceById, windowById, type SourceId } from '@/lib/sources';
import type { AskState } from '@/lib/use-ask';
import { cn } from '@/lib/utils';
import { SourceIcon } from './source-icon';

function list(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

type Mark = 'doing' | 'done' | 'partial' | 'failed' | 'stopped';
type Line = { key: string; state: Mark; text: React.ReactNode; icon?: SourceId };

function notJudged(count: number): string {
  return count > 0 ? `, ${count} not judged` : '';
}

/** Where each chosen source is, in words. */
function sourceLine(p: SourceProgress, stopped: boolean): Line {
  const label = sourceById(p.id).label;
  const base = { key: p.id, icon: p.id };
  switch (p.status) {
    case 'waiting':
      return { ...base, state: 'doing', text: <>Asking {label}…</> };
    case 'judging':
      return {
        ...base,
        state: 'doing',
        text: (
          <>
            {label} · {p.found} found
            {p.finished > 0 && `, ${p.answering} answer you so far`}
            <span className="text-muted-foreground"> · checking which answer you…</span>
          </>
        ),
      };
    case 'failed':
      return { ...base, state: 'failed', text: <>{label} didn't answer</> };
    case 'partial':
      return {
        ...base,
        state: 'partial',
        text: (
          <>
            {label} · {p.answering} of {p.found} answer you{notJudged(p.unscored)} · {p.failures.length} of {p.lanes} searches failed
          </>
        ),
      };
    case 'unfinished':
      return {
        ...base,
        state: 'stopped',
        text: (
          <>
            {label} · {stopped ? 'stopped before it finished' : 'did not finish'}
            {p.found > 0 && ` (${p.found} found so far)`}
          </>
        ),
      };
    case 'done':
      return {
        ...base,
        state: 'done',
        text:
          p.found === 0 ? (
            <>{label} · nothing there</>
          ) : (
            <>
              {label} · {p.answering} of {p.found} answer you{notJudged(p.unscored)}
            </>
          ),
      };
  }
}

function MarkIcon({ state }: { state: Mark }) {
  if (state === 'done') {
    return (
      <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
        <CheckIcon className="size-2.5" strokeWidth={3} />
      </span>
    );
  }
  if (state === 'partial') {
    return (
      <span className="inline-flex size-4 shrink-0 items-center justify-center text-amber-600 dark:text-amber-400">
        <TriangleAlertIcon aria-hidden className="size-3.5" />
      </span>
    );
  }
  if (state === 'stopped') {
    return (
      <span className="inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground">
        <SquareIcon aria-hidden className="size-2.5" fill="currentColor" />
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

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/**
 * The wait, narrated. A block that fills the space where results will land
 * and grows a line per thing that happens, in plain words. Once results
 * are on screen it folds to one line that keeps updating; click to reopen.
 * A stopped search says so, and sources that had not finished are not
 * shown as complete.
 */
export function Working({ state, actions }: { state: AskState; actions?: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  const hasResults = state.items.length > 0;
  useEffect(() => {
    if (hasResults) setOpen(false);
  }, [hasResults]);
  useEffect(() => {
    if (state.phase === 'understanding') setOpen(true);
  }, [state.phase]);
  if (state.phase === 'idle') return null;
  if (state.phase === 'error' && !state.intent) return null;

  const { intent } = state;
  const progress = sourceProgress(state);
  const lines = progress.map((p) => sourceLine(p, state.phase === 'stopped'));
  const found = Object.values(state.found).reduce((n, c) => n + c, 0);
  const answering = state.items.filter((i) => relevanceGroup(i) === 'on-topic').length;
  const unscored = state.items.filter((i) => relevanceGroup(i) === 'unscored').length;
  const pending = progress.filter((p) => p.status === 'waiting' || p.status === 'judging');
  const troubled = progress.filter((p) => p.status === 'failed' || p.status === 'partial').length;
  const allFailed = progress.length > 0 && progress.every((p) => p.status === 'failed');
  const window = intent && intent.window !== 'any' ? windowById(intent.window).label.toLowerCase() : null;
  const ended = state.phase === 'done' || state.phase === 'stopped' || state.phase === 'error';

  let summary: React.ReactNode;
  if (state.phase === 'stopped') {
    summary = intent ? (
      <>
        Stopped · partial results · {found} found · {answering} answer you{notJudged(unscored)}
      </>
    ) : (
      'Stopped before the question was read'
    );
  } else if (state.phase === 'error') {
    summary = <>Search failed · partial results · {found} found · {answering} answer you</>;
  } else if (!intent) summary = 'Reading your question…';
  else if (state.phase === 'done' && allFailed) {
    // Failed searches found nothing because they did not run, not because there was nothing.
    summary = <>Asked {list(intent.sources.map((id) => sourceById(id).label))} · every search failed</>;
  } else if (state.phase === 'done') {
    summary = (
      <>
        <span className="sm:hidden">{answering} of {found} relevant</span>
        <span className="hidden sm:inline">
          Asked {list(intent.sources.map((id) => sourceById(id).label))} · {found} found · {answering} answer you
          {notJudged(unscored)}
          {state.totalMs !== null && <span className="text-muted-foreground/60"> · {seconds(state.totalMs)}</span>}
        </span>
      </>
    );
  } else if (pending.length > 0) {
    summary = (
      <>
        Still asking {list(pending.map((p) => sourceById(p.id).label))}…
        {found > 0 && <span className="text-muted-foreground/70"> · {found} found so far</span>}
      </>
    );
  } else summary = <>Checking which of the {found} answer you…</>;

  let headIcon: React.ReactNode;
  if (state.phase === 'done' && troubled > 0) {
    headIcon = <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />;
  } else if (state.phase === 'done') {
    headIcon = (
      <span className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
        <CheckIcon className="size-2.5" strokeWidth={3} />
      </span>
    );
  } else if (state.phase === 'stopped') {
    headIcon = (
      <span className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground">
        <SquareIcon aria-hidden className="size-3" fill="currentColor" />
      </span>
    );
  } else if (state.phase === 'error') {
    headIcon = <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive" />;
  } else {
    headIcon = <LoaderCircleIcon className="mt-0.5 size-4 shrink-0 animate-spin text-primary" />;
  }

  return (
    <section className="mt-4 text-sm">
      <div className="flex items-start gap-4">
        <button
          className="group flex min-w-0 flex-1 items-start gap-2 text-left text-muted-foreground hover:text-foreground"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          type="button"
        >
          {headIcon}
          <span className="min-w-0 wrap-anywhere">{summary}</span>
          <ChevronDownIcon
            className={cn(
              'mt-[3px] size-3.5 shrink-0 opacity-40 transition-transform duration-200 group-hover:opacity-80',
              open && 'rotate-180'
            )}
          />
        </button>
        {actions}
      </div>

      <div className="fold" data-open={open ? '' : undefined}>
        <ol className="mt-2 ml-1.5 flex flex-col gap-1.5 border-l pl-4">
          {intent && (
            <li className="flex items-center gap-2 text-muted-foreground">
              <MarkIcon state="done" />
              <span>
                Looking for <span className="text-foreground">“{intent.query}”</span>
                {window && <span> · {window}</span>}
              </span>
            </li>
          )}
          {!intent && (
            <li className={cn('flex items-center gap-2', ended ? 'text-muted-foreground' : 'text-foreground')}>
              <MarkIcon state={ended ? 'stopped' : 'doing'} />
              <span>{ended ? 'Stopped while reading your question' : 'Reading your question'}</span>
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
              <MarkIcon state={line.state} />
              {line.icon && <SourceIcon className="size-3.5" id={line.icon} on={line.state !== 'failed'} />}
              <span>{line.text}</span>
            </li>
          ))}
          {state.phase === 'done' && state.totalMs !== null && (
            <li className="flex items-center gap-2 text-muted-foreground">
              <MarkIcon state="done" />
              <span>
                Done in {seconds(state.totalMs)}
                {state.timedOut && ' · the search budget ran out before everything finished'}
              </span>
            </li>
          )}
          {state.phase === 'stopped' && intent && (
            <li className="flex items-center gap-2 text-muted-foreground">
              <MarkIcon state="stopped" />
              <span>Stopped · results so far are kept</span>
            </li>
          )}
        </ol>
      </div>
    </section>
  );
}
