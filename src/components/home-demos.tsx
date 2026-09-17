import { SOURCES, type SourceId } from '@/lib/sources';
import { cn } from '@/lib/utils';
import { SourceIcon } from './source-icon';

const chip = 'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[13px]';
const on = 'border-foreground/50 bg-background text-foreground';

const PICKED: SourceId[] = ['hackernews', 'reddit', 'x'];

const ROWS: { source: SourceId; host: string; title: string; score: number }[] = [
  { source: 'x', host: 'x.com/jarredsumner', title: 'In the next version of Bun, `Bun.FetchSession` gives you a fetch with its own keepalive…', score: 0.96 },
  { source: 'hackernews', host: 'news.ycombinator.com', title: 'I made a build visualizer to understand Bun’s compile times', score: 0.92 },
  { source: 'reddit', host: 'reddit.com/r/bun', title: 'Should I move away from Bun?', score: 0.89 },
];
const FOLDED = { source: 'reddit' as SourceId, host: 'reddit.com/r/hair', title: 'How do you keep a low bun from sagging?', score: 0.04 };

function Row({ row, dim }: { row: typeof FOLDED; dim?: boolean }) {
  return (
    <div className={cn('flex flex-col gap-0.5', dim && 'opacity-55')}>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <SourceIcon className="size-3" id={row.source} />
        <span className="truncate">{row.host}</span>
      </div>
      <p className="text-[15px] leading-snug text-link line-clamp-1">{row.title}</p>
      <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <span className={cn('inline-block size-1.5 rounded-full', row.score >= 0.7 ? 'bg-emerald-500' : 'bg-neutral-400')} />
        {Math.round(row.score * 100)}% on topic
      </p>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium text-primary">{children}</p>;
}

/**
 * One question, and both things Jev did with it, in a panel that fits
 * beside the search box: the engines it lit, then the order it produced.
 */
export function DemoPanel() {
  const chosen = SOURCES.filter((s) => PICKED.includes(s.id));
  const rest = SOURCES.filter((s) => !PICKED.includes(s.id));
  return (
    <div className="flex flex-col gap-5 rounded-2xl border bg-muted/40 p-5">
      <p className="text-[15px] text-foreground">“what are people saying about Bun 1.3 this week”</p>

      <div className="flex flex-col gap-2">
        <Label>Jev picked where to look</Label>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn(chip, on)}>Past week</span>
          <span className="text-muted-foreground/40">·</span>
          {chosen.map((s) => (
            <span className={cn(chip, on)} key={s.id}>
              <SourceIcon className="size-3.5" id={s.id} on />
              {s.label}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          {rest.map((s) => (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground/60" key={s.id}>
              <SourceIcon className="size-3" id={s.id} on={false} />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t pt-4">
        <Label>Jev ranked what came back</Label>
        {ROWS.map((row) => (
          <Row key={row.host} row={row} />
        ))}
        <div className="flex flex-col gap-2 border-t pt-3">
          <p className="text-xs text-muted-foreground">7 more that didn't seem to match</p>
          <Row dim row={FOLDED} />
        </div>
      </div>
    </div>
  );
}

export function EngineStrip() {
  return (
    <ul className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {SOURCES.map((s) => (
        <li className="inline-flex items-center gap-1 text-xs text-muted-foreground" key={s.id} title={s.label}>
          <SourceIcon className="size-3.5" id={s.id} on />
        </li>
      ))}
    </ul>
  );
}
