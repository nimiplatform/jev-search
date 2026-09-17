import { sourceById } from '@/lib/sources';
import type { AskState } from '@/lib/use-ask';
import { Progress, Understanding } from './progress';

function list(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * One plain sentence about what is happening, written for the person who
 * typed the request. The engineering readout lives behind "details".
 */
export function Status({ state, hiddenOffTopic }: { state: AskState; hiddenOffTopic: number }) {
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
      {intent && (
        <details className="shrink-0 text-xs">
          <summary className="cursor-pointer select-none text-muted-foreground/70 hover:text-foreground">details</summary>
          <div className="absolute right-4 z-10 mt-2 flex max-w-2xl flex-col gap-2 rounded-lg border bg-popover p-3 shadow-md lg:right-auto">
            <Understanding intent={intent} />
            <Progress state={state} />
          </div>
        </details>
      )}
    </div>
  );
}
