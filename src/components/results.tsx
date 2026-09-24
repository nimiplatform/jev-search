import { useState } from 'react';
import { formatPublicationAge } from '@/lib/freshness';
import { relevanceGroup, type Cluster, type RankedItem } from '@/lib/rank';
import { sourceById } from '@/lib/sources';
import { cn } from '@/lib/utils';
import { SourceIcon } from './source-icon';

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

/** A judged percentage, or an honest statement that there is none. */
function Relevance({ item }: { item: RankedItem }) {
  if (item.ranked && item.relevance !== null) {
    const relevance = item.relevance;
    return (
      <span className="inline-flex items-center gap-1" title="Judged probability that this result is about what you asked">
        <span
          className={cn(
            'inline-block size-2 rounded-full',
            relevance >= 0.7 ? 'bg-emerald-500' : relevance >= 0.4 ? 'bg-amber-500' : 'bg-neutral-400'
          )}
        />
        {Math.round(relevance * 100)}% on topic
      </span>
    );
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-1" title={item.unscoredReason}>
      <span className="inline-block size-2 shrink-0 rounded-full border border-muted-foreground/60" />
      <span className="min-w-0 wrap-anywhere">
        {item.unscoredReason ? `Relevance not judged: ${item.unscoredReason}` : 'Relevance not judged yet'}
      </span>
    </span>
  );
}

function ResultRow({
  item,
  minor,
}: {
  item: RankedItem;
  minor?: boolean;
}) {
  const age = formatPublicationAge(item);

  return (
    <article className={cn('group', minor ? 'pl-4 border-l' : '')}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex size-4 shrink-0 items-center justify-center" title={sourceById(item.source).label}>
          <SourceIcon className="size-3.5" id={item.source} />
        </span>
        <span className="truncate">{displayUrl(item.url)}</span>
        {age && <span className="shrink-0">· <time dateTime={item.publishedDate}>{age}</time></span>}
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
        rel="noreferrer"
        target="_blank"
      >
        {item.title}
      </a>
      {!minor && item.snippet && (
        <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">{item.snippet}</p>
      )}
      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
        <Relevance item={item} />
      </div>
    </article>
  );
}

/** 'streaming' while the task runs; 'stopped' when the user stopped it early. */
export type ResultsStatus = 'streaming' | 'done' | 'stopped';

/** Whether any chosen source failed to search: every one of them, some of them, or none. */
export type SearchFailure = 'all' | 'some' | null;

function emptyMessage(status: ResultsStatus, failure: SearchFailure): string {
  if (status === 'stopped') return 'Stopped before any results arrived.';
  if (failure === 'all') return 'Every search failed, so there are no results to show.';
  if (failure === 'some') return 'Nothing found in the sources that answered.';
  return 'Nothing found. Try a wider time range, or more sources.';
}

/**
 * Judged on-topic rows first, then rows whose relevance could not be judged
 * (they are not off topic, they are unknown), then the off-topic fold.
 */
export function Results({
  clusters,
  status,
  failure = null,
}: {
  clusters: Cluster[];
  status: ResultsStatus;
  failure?: SearchFailure;
}) {
  const [showOffTopic, setShowOffTopic] = useState(false);
  const onTopic = clusters.filter((c) => relevanceGroup(c.lead) === 'on-topic');
  const unscored = clusters.filter((c) => relevanceGroup(c.lead) === 'unscored');
  const offTopic = clusters.filter((c) => relevanceGroup(c.lead) === 'off-topic');

  if (clusters.length === 0) {
    if (status === 'streaming') return null;
    return <p className="mt-8 text-muted-foreground">{emptyMessage(status, failure)}</p>;
  }

  const render = (list: Cluster[]) =>
    list.map((cluster) => (
      <li className="enter flex flex-col gap-2" key={cluster.lead.id}>
        <ResultRow item={cluster.lead} />
        {cluster.others.map((item) => (
          <ResultRow item={item} key={item.id} minor />
        ))}
      </li>
    ));

  return (
    <>
      {(onTopic.length > 0 || unscored.length > 0) && (
        <ol className="mt-6 flex flex-col gap-6">
          {render(onTopic)}
          {render(unscored)}
        </ol>
      )}
      {offTopic.length > 0 && status !== 'streaming' && (
        <div className="mt-8">
          <button
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => setShowOffTopic((v) => !v)}
            type="button"
          >
            {showOffTopic ? 'Hide' : 'Show'} {offTopic.length} more that didn't seem to match
          </button>
          {showOffTopic && <ol className="mt-4 flex flex-col gap-6 opacity-70">{render(offTopic)}</ol>}
        </div>
      )}
    </>
  );
}
