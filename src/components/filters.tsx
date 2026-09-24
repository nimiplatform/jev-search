import { ChevronDownIcon, CircleDashedIcon, PlusIcon, TriangleAlertIcon } from 'lucide-react';
import { useState } from 'react';
import { sourceProgress, type SourceProgress } from '@/lib/progress';
import { SOURCES, WINDOWS, windowById, type SourceId, type WindowId } from '@/lib/sources';
import type { AskState } from '@/lib/use-ask';
import { cn } from '@/lib/utils';
import { SourceIcon } from './source-icon';

const chip =
  'chip inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm text-muted-foreground hover:bg-accent disabled:opacity-50';
const active = 'border-foreground/50 bg-accent/60 text-foreground';

function describeChip(
  label: string,
  progress: SourceProgress | undefined,
  count: number,
  stopped: boolean
): { aria: string; title: string } {
  switch (progress?.status) {
    case 'failed':
      return {
        aria: `${label}: search failed. Click to leave it out.`,
        title: `${label} couldn't finish searching. Click to leave it out.`,
      };
    case 'partial':
      return {
        aria: `${label}, ${count} results; ${progress.failures.length} of ${progress.lanes} searches failed. Click to leave it out.`,
        title: `${progress.failures.length} of ${progress.lanes} ${label} searches failed. Click to leave it out.`,
      };
    case 'unfinished':
      return stopped
        ? {
            aria: `${label}: stopped before it finished. Click to leave it out.`,
            title: `Stopped before ${label} finished. Click to leave it out.`,
          }
        : {
            aria: `${label}: did not finish. Click to leave it out.`,
            title: `${label} did not finish. Click to leave it out.`,
          };
    case 'done':
      return { aria: `${label}, ${count} results. Click to leave it out.`, title: `Searched ${label}. Click to leave it out.` };
    default:
      return { aria: `${label}. Click to leave it out.`, title: `Searching ${label}. Click to leave it out.` };
  }
}

/**
 * One row that is both the reading of the question and the progress of the
 * search: the time window, then the sources chosen, each with its count once
 * its results are in. Reserve the first row while reading the question;
 * chips wrap when needed. Everything not chosen is behind "more".
 */
export function Filters({
  state,
  explicitWindow,
  explicitSources,
  onWindow,
  onSources,
  onReset,
}: {
  state: AskState;
  explicitWindow: WindowId | undefined;
  explicitSources: SourceId[] | undefined;
  onWindow: (w: WindowId | undefined) => void;
  onSources: (s: SourceId[] | undefined) => void;
  onReset: () => void;
}) {
  const [showWindows, setShowWindows] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const { intent } = state;

  // Reserve one chip row; the working block below already says
  // "Reading your question…".
  if (!intent) return <div aria-hidden className="h-8" />;

  const selected = new Set(intent.sources);
  const counts = new Map<SourceId, number>();
  for (const item of state.items) counts.set(item.source, (counts.get(item.source) ?? 0) + 1);
  const progress = new Map(sourceProgress(state).map((p) => [p.id, p]));

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
          const p = progress.get(s.id);
          const status = p?.status;
          const count = counts.get(s.id) ?? 0;
          const { aria, title } = describeChip(s.label, p, count, state.phase === 'stopped');
          let slot: React.ReactNode = null;
          if (status === 'failed') slot = <TriangleAlertIcon aria-hidden className="size-3.5 text-destructive" />;
          else if (status === 'unfinished') slot = <CircleDashedIcon aria-hidden className="size-3.5" />;
          else if (status === 'partial') slot = <span className="text-amber-600 dark:text-amber-400">{count}</span>;
          else if (status === 'done') slot = count;
          return (
            <button
              // Phones show the icon and count only, so the name lives here; the
              // working block below still spells every source out.
              aria-label={aria}
              className={cn(chip, active, 'px-2.5 sm:px-3')}
              key={s.id}
              onClick={() => toggleSource(s.id)}
              title={title}
              type="button"
            >
              <SourceIcon className="size-3.5" id={s.id} on={status !== 'failed'} />
              <span className="hidden sm:inline">{s.label}</span>
              <span className="inline-flex w-[2ch] justify-end text-xs text-muted-foreground tabular-nums sm:w-[3ch]">
                {slot}
              </span>
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
            className="shrink-0 whitespace-nowrap text-xs text-muted-foreground underline"
            onClick={onReset}
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
