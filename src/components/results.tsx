import { ThumbsDownIcon, ThumbsUpIcon } from 'lucide-react';
import { useState } from 'react';
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
  if (clusters.length === 0) {
    if (streaming) return null;
    return (
      <p className="mt-8 text-muted-foreground">
        Nothing in this window. Try a wider one, or fewer sources.
      </p>
    );
  }
  let rank = 0;
  return (
    <ol className="mt-6 flex flex-col gap-6">
      {clusters.map((cluster) => (
        <li className="flex flex-col gap-2 animate-in fade-in slide-in-from-bottom-1 duration-300" key={cluster.lead.id}>
          <ResultRow item={cluster.lead} rank={++rank} request={request} weights={weights} />
          {cluster.others.map((item) => (
            <ResultRow item={item} key={item.id} minor rank={++rank} request={request} weights={weights} />
          ))}
        </li>
      ))}
    </ol>
  );
}


