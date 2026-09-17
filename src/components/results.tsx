import { ThumbsDownIcon, ThumbsUpIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import type { Cluster, RankedItem, Weights } from '@/lib/rank';
import { compositeScore } from '@/lib/rank';
import { sourceById } from '@/lib/sources';
import { cn } from '@/lib/utils';
import { feedbackFn, type FeedbackEvent } from '@/server/search';

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
  weights,
  minor,
}: {
  item: RankedItem;
  rank: number;
  request: string;
  weights: Weights;
  minor?: boolean;
}) {
  const [vote, setVote] = useState<'useful' | 'irrelevant' | null>(null);
  const age = formatAge(item.ageHours);
  const base = { request, url: item.url, source: item.source, relevance: item.relevance, rank };

  return (
    <article className={cn('group', minor ? 'pl-4 border-l' : '')}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground/80">{sourceById(item.source).label}</span>
        <span className="truncate">{displayUrl(item.url)}</span>
        {age && <span>· {age}</span>}
        {item.engines.length > 1 && (
          <span title={item.engines.join(' + ')}>· {item.engines.length} engines</span>
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
          title={`relevance ${item.relevance.toFixed(2)} · freshness ${item.freshness.toFixed(2)} · composite ${compositeScore(item, weights).toFixed(2)}`}
        >
          <span
            className={cn(
              'inline-block size-2 rounded-full',
              item.relevance >= 0.7 ? 'bg-emerald-500' : item.relevance >= 0.4 ? 'bg-amber-500' : 'bg-neutral-400'
            )}
          />
          {Math.round(item.relevance * 100)}% on topic
        </span>
        <span className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <button
            aria-label="Useful"
            className={cn('rounded p-1 hover:bg-accent', vote === 'useful' && 'text-emerald-600 opacity-100')}
            onClick={() => {
              setVote('useful');
              send({ kind: 'useful', ...base });
            }}
            type="button"
          >
            <ThumbsUpIcon className="size-3.5" />
          </button>
          <button
            aria-label="Not relevant"
            className={cn('rounded p-1 hover:bg-accent', vote === 'irrelevant' && 'text-destructive opacity-100')}
            onClick={() => {
              setVote('irrelevant');
              send({ kind: 'irrelevant', ...base });
            }}
            type="button"
          >
            <ThumbsDownIcon className="size-3.5" />
          </button>
        </span>
      </div>
    </article>
  );
}

/** Below this the judge says "not about what you asked"; such rows are folded away, not deleted. */
export const OFF_TOPIC = 0.3;

/**
 * Entrance order within a batch: rows that appear in the same render get
 * successive delays (capped) so a batch reads as arriving, not popping.
 */
function useEnterIndex() {
  const seen = useRef(new Map<string, number>());
  return (ids: string[]) => {
    let i = 0;
    for (const id of ids) {
      if (!seen.current.has(id)) seen.current.set(id, Math.min(i++, 6));
    }
    return (id: string) => seen.current.get(id) ?? 0;
  };
}

export function Results({
  clusters,
  request,
  weights,
  streaming,
}: {
  clusters: Cluster[];
  request: string;
  weights: Weights;
  streaming: boolean;
}) {
  const [showOffTopic, setShowOffTopic] = useState(false);
  const enterIndex = useEnterIndex()(clusters.map((c) => c.lead.id));
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
      <li className="enter flex flex-col gap-2" key={cluster.lead.id} style={{ '--i': enterIndex(cluster.lead.id) } as React.CSSProperties}>
        <ResultRow item={cluster.lead} rank={++rank} request={request} weights={weights} />
        {cluster.others.map((item) => (
          <ResultRow item={item} key={item.id} minor rank={++rank} request={request} weights={weights} />
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
            {showOffTopic ? 'Hide' : 'Show'} {offTopic.length} off-topic {offTopic.length === 1 ? 'result' : 'results'}
          </button>
          {showOffTopic && <ol className="mt-4 flex flex-col gap-6 opacity-70">{render(offTopic)}</ol>}
        </div>
      )}
    </>
  );
}

export function offTopicCount(clusters: Cluster[]): number {
  return clusters.filter((c) => c.lead.relevance < OFF_TOPIC).length;
}


