import { createServerFn } from '@tanstack/react-start';
import { getEnv } from './env.server';

export interface FeedbackEvent {
  kind: 'click' | 'useful' | 'irrelevant';
  request: string;
  url: string;
  source: string;
  relevance: number;
  rank: number;
}

function validateFeedback(input: unknown): FeedbackEvent {
  if (typeof input !== 'object' || input === null) throw new Error('Invalid input');
  const e = input as Record<string, unknown>;
  const kind = e.kind;
  if (kind !== 'click' && kind !== 'useful' && kind !== 'irrelevant') {
    throw new Error('Invalid kind');
  }
  return {
    kind,
    request: String(e.request ?? '').slice(0, 300),
    url: String(e.url ?? '').slice(0, 500),
    source: String(e.source ?? '').slice(0, 20),
    relevance: Number(e.relevance) || 0,
    rank: Number(e.rank) || 0,
  };
}

export const feedbackFn = createServerFn({ method: 'POST' })
  .validator(validateFeedback)
  .handler(async ({ data }) => {
    let env: ReturnType<typeof getEnv>;
    try {
      env = getEnv();
    } catch {
      return { ok: false as const };
    }
    env.FEEDBACK?.writeDataPoint({
      indexes: [data.kind],
      blobs: [data.kind, data.request, data.url, data.source],
      doubles: [data.relevance, data.rank],
    });
    return { ok: true as const };
  });
