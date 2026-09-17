import { useState } from 'react';
import type { Cluster, RankedItem } from '@/lib/rank';
import { sourceById } from '@/lib/sources';
import { cn } from '@/lib/utils';
import { feedbackFn, type FeedbackEvent } from '@/server/search';
import { SourceIcon } from './source-icon';

function formatAge(hours: number | null): string | null {
  if (hours === null) return null;
  if (hours < 1) return 'just now';
  if (hours < 48) return `${Math.round(hours)}h ago`;
  if (hours < 24 * 14) return `${Math.round(hours / 24)}d ago`;
  return `${Math.round(hours / (24 * 7))}w ago`;
}

function displayUrl(url: string): string {
  try {
    const u = new URL(url);
    const id = u.searchParams.get('id') ?? u.searchParams.get('v');
    const path = u.pathname.replace(/\/$/, '') + (id ? `?${u.searchParams.has('id') ? 'id' : 'v'}=${id}` : '');
    return `${u.hostname.replace(/^www\./, '')}${path.length > 48 ? `${path.slice(0, 48)}…` : path}`;
  } catch {
    return url;
  }
}

function send(event: FeedbackEvent) {
  feedbackFn({ data: event }).catch(() => undefined);
}

function ResultRow({
  item,
  rank,
  request,
  minor,
}: {
  item: RankedItem;
  rank: number;
  request: string;
  minor?: boolean;
}) {
  const age = formatAge(item.ageHours);
  const base = { request, url: item.url, source: item.source, relevance: item.relevance, rank };

  return (
    <article className={cn('group', minor ? 'pl-4 border-l' : '')}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex size-4 shrink-0 items-center justify-center" title={sourceById(item.source).label}>
          <SourceIcon className="size-3.5" id={item.source} />
        </span>
        <span className="truncate">{displayUrl(item.url)}</span>
        {age && <span>· {age}</span>}
        {item.engines.length > 1 && (
          <span title={item.engines.join(' + ')}>· found by {item.engines.length} engines</span>
        )}
      </div>
      <a
        className={cn(
          'mt-0.5 block text-link visited:text-visited hover:underline',
          minor ? 'text-base' : 'text-lg'
        )}
        href={item.url}
        onClick={() => send({ kind: 'click', ...base })}
        rel="noreferrer"
        target="_blank"
      >
        {item.title}
      </a>
      {!minor && item.snippet && (
        <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">{item.snippet}</p>
      )}
      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
        <span
          className="inline-flex items-center gap-1"
          title="How sure Jev is that this result is about what you asked"
        >
          <span
            className={cn(
              'inline-block size-2 rounded-full',
              item.relevance >= 0.7 ? 'bg-emerald-500' : item.relevance >= 0.4 ? 'bg-amber-500' : 'bg-neutral-400'
            )}
          />
          {Math.round(item.relevance * 100)}% on topic
        </span>
      </div>
    </article>
  );
}

/** Below this the judge says "not about what you asked"; such rows are folded away, not deleted. */
export const OFF_TOPIC = 0.3;

export function Results({
  clusters,
  request,
  streaming,
}: {
  clusters: Cluster[];
  request: string;
  streaming: boolean;
}) {
  const [showOffTopic, setShowOffTopic] = useState(false);
  const onTopic = clusters.filter((c) => c.lead.relevance >= OFF_TOPIC);
  const offTopic = clusters.filter((c) => c.lead.relevance < OFF_TOPIC);

  if (clusters.length === 0) {
    if (streaming) return null;
    return (
      <p className="mt-8 text-muted-foreground">
        Nothing found. Try a wider time range, or more sources.
      </p>
    );
  }

  let rank = 0;
  const render = (list: Cluster[]) =>
    list.map((cluster) => (
      <li className="enter flex flex-col gap-2" key={cluster.lead.id}>
        <ResultRow item={cluster.lead} rank={++rank} request={request} />
        {cluster.others.map((item) => (
          <ResultRow item={item} key={item.id} minor rank={++rank} request={request} />
        ))}
      </li>
    ));

  return (
    <>
      <ol className="mt-6 flex flex-col gap-6">{render(onTopic)}</ol>
      {offTopic.length > 0 && !streaming && (
        <div className="mt-8">
          <button
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => setShowOffTopic((v) => !v)}
            type="button"
          >
            {showOffTopic ? 'Hide' : 'Show'} {offTopic.length} more that {offTopic.length === 1 ? "didn't" : "didn't"} seem to match
          </button>
          {showOffTopic && <ol className="mt-4 flex flex-col gap-6 opacity-70">{render(offTopic)}</ol>}
        </div>
      )}
    </>
  );
}




