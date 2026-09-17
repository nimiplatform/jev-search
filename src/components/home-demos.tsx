import { SOURCES, type SourceId } from '@/lib/sources';
import { cn } from '@/lib/utils';
import { SourceIcon } from './source-icon';

const chip = 'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-sm';
const on = 'border-foreground/50 bg-accent/60 text-foreground';
const off = 'text-muted-foreground/70';

/** A question and what Jev chose for it, drawn with the real chip styles. */
function Picked({ question, window, sources }: { question: string; window: string; sources: SourceId[] }) {
  const chosen = SOURCES.filter((s) => sources.includes(s.id));
  const rest = SOURCES.filter((s) => !sources.includes(s.id));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-base text-foreground">“{question}”</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className={cn(chip, on)}>{window}</span>
        <span className="text-muted-foreground/40">·</span>
        {chosen.map((s) => (
          <span className={cn(chip, on)} key={s.id}>
            <SourceIcon className="size-3.5" id={s.id} on />
            {s.label}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-1">
        {rest.map((s) => (
          <span className={cn('inline-flex items-center gap-1 text-xs', off)} key={s.id}>
            <SourceIcon className="size-3" id={s.id} on={false} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function DemoPicks() {
  return (
    <div className="flex flex-col gap-8">
      <Picked question="what are people saying about Bun 1.3 this week" window="Past week" sources={['hackernews', 'reddit', 'x']} />
      <Picked question="who directed Oppenheimer and who is in it" window="Any time" sources={['google', 'wikipedia', 'imdb']} />
    </div>
  );
}

const ROWS: { source: SourceId; host: string; title: string; snippet: string; score: number }[] = [
  { source: 'google', host: 'bun.com/blog/bun-v1.3', title: 'Bun 1.3 | Bun Blog', snippet: 'Bun 1.3 introduces zero-config frontend development, unified SQL API, built-in Redis client, security enhancements…', score: 0.96 },
  { source: 'reddit', host: 'reddit.com/r/bun', title: 'Should I move away from Bun?', snippet: '…1.3.3, 1.3.14, the canary and node 26, and it asks anyone still seeing growth to file separately so each cause is tracked…', score: 0.91 },
  { source: 'x', host: 'x.com/jarredsumner', title: 'Jarred Sumner on X: “In the next version of Bun `Bun.FetchSession`…”', snippet: 'gives you a `fetch` function with its own keepalive…', score: 0.88 },
];

const OFF_ROW = { source: 'reddit' as SourceId, host: 'reddit.com/r/hair', title: 'How do you keep a low bun from sagging?', snippet: 'Bobby pins, a little texture spray, and…', score: 0.04 };

function Row({ row, dim }: { row: (typeof ROWS)[number]; dim?: boolean }) {
  return (
    <div className={cn('flex flex-col gap-0.5', dim && 'opacity-60')}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <SourceIcon className="size-3.5" id={row.source} />
        <span className="truncate">{row.host}</span>
      </div>
      <p className="text-base text-link">{row.title}</p>
      <p className="text-sm text-muted-foreground line-clamp-1">{row.snippet}</p>
      <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
        <span
          className={cn(
            'inline-block size-2 rounded-full',
            row.score >= 0.7 ? 'bg-emerald-500' : row.score >= 0.4 ? 'bg-amber-500' : 'bg-neutral-400'
          )}
        />
        {Math.round(row.score * 100)}% on topic
      </p>
    </div>
  );
}

export function DemoRanks() {
  return (
    <div className="flex flex-col gap-5">
      {ROWS.map((row) => (
        <Row key={row.title} row={row} />
      ))}
      <div className="flex flex-col gap-3 border-t pt-4">
        <p className="text-sm text-muted-foreground">Show 7 more that didn't seem to match</p>
        <Row row={OFF_ROW} dim />
      </div>
    </div>
  );
}

export function EngineStrip() {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {SOURCES.map((s) => (
        <li className="inline-flex items-center gap-1.5 text-sm text-muted-foreground" key={s.id}>
          <SourceIcon className="size-4" id={s.id} on />
          {s.label}
        </li>
      ))}
    </ul>
  );
}
