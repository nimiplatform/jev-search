/**
 * Fakes shared by the tests. Nothing here reaches a network service: the
 * decision capability is a function, Search1API is a stubbed `fetch`, and the
 * host transport is an in-process call.
 */
import { vi } from 'vitest';
import type { SearchHost } from '../../host/search-host';
import type { DecideFn, DecideOptions, DecisionAnswer, DecisionResult, DecisionSpec } from '@/lib/decide';
import type { SearchTransport } from '@/lib/host-transport';

export interface IntentAnswers {
  window?: { choice: string; probability: number };
  /** True probability per source id; unlisted sources get 0.1. */
  sources?: Partial<Record<string, number>>;
  query?: { choice: string; probability: number };
  entity?: { choice: string; probability: number };
}

export type RelevanceFn = (result: { source: string; title: string; snippet: string }, options: DecideOptions) => number | Promise<number>;

/** Answers every question an intent spec asks, from `answers` or plain defaults. */
export function answerIntent(spec: DecisionSpec, answers: IntentAnswers = {}, traceId = 'trace-intent'): DecisionResult {
  const out: DecisionAnswer[] = spec.questions.map((question) => {
    if (question.kind === 'boolean') {
      const source = question.id.replace(/^source_/, '');
      return { questionId: question.id, kind: 'boolean', trueProbability: answers.sources?.[source] ?? 0.1 };
    }
    const chosen =
      question.id === 'window'
        ? answers.window ?? { choice: 'any', probability: 0.9 }
        : question.id === 'query'
          ? answers.query ?? { choice: 'c0', probability: 0.9 }
          : answers.entity ?? { choice: 'c0', probability: 0.9 };
    const rest = (1 - chosen.probability) / Math.max(1, question.candidates.length - 1);
    return {
      questionId: question.id,
      kind: 'choice',
      selectedCandidateId: chosen.choice,
      probabilities: question.candidates.map((c) => ({
        candidateId: c.id,
        probability: c.id === chosen.choice ? chosen.probability : rest,
      })),
    };
  });
  return { type: 'text-decide', answers: out, traceId };
}

export function relevanceResult(trueProbability: number, traceId = 'trace-relevance'): DecisionResult {
  return { type: 'text-decide', answers: [{ questionId: 'relevant', kind: 'boolean', trueProbability }], traceId };
}

export function isIntentSpec(spec: DecisionSpec): boolean {
  return spec.questions.some((q) => q.id === 'window');
}

export function relevanceSubject(spec: DecisionSpec): { source: string; title: string; snippet: string } {
  const state = spec.state as { json: { result: { source: string; title: string; snippet: string } } };
  return state.json.result;
}

export interface DecideCall {
  spec: DecisionSpec;
  options: DecideOptions;
}

type RawDecide = (spec: DecisionSpec, options: DecideOptions) => Promise<DecisionResult>;

/**
 * A DecideFn that answers intent specs from `intent` and relevance specs from
 * `relevance` (a probability per result), recording every call. `intent` or
 * `relevanceResult` can instead produce, or reject with, anything a test needs.
 */
export function fakeDecide(
  config: {
    intent?: IntentAnswers | RawDecide;
    relevance?: RelevanceFn;
    relevanceResult?: RawDecide;
  } = {}
) {
  const calls: DecideCall[] = [];
  const decide = vi.fn<DecideFn>(async (spec, options) => {
    calls.push({ spec, options });
    if (isIntentSpec(spec)) {
      return typeof config.intent === 'function' ? config.intent(spec, options) : answerIntent(spec, config.intent);
    }
    if (config.relevanceResult) return config.relevanceResult(spec, options);
    const relevance = config.relevance ?? (() => 0.9);
    return relevanceResult(await relevance(relevanceSubject(spec), options));
  });
  return {
    decide,
    calls,
    intentCalls: () => calls.filter((c) => isIntentSpec(c.spec)),
    relevanceCalls: () => calls.filter((c) => !isIntentSpec(c.spec)),
  };
}

/** A promise that settles only when `signal` aborts, like a well-behaved call that never finishes. */
export function untilAborted<T>(signal: AbortSignal | undefined): Promise<T> {
  return new Promise<T>((_, reject) => {
    if (!signal) return;
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
}

export type SearchCall = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

/** Stubs `fetch` for Search1API; `respond` returns the rows (or a Response) for each call. */
export function stubSearch1Api(
  respond: (call: SearchCall, init: RequestInit | undefined) => Array<Record<string, unknown>> | Response | Promise<Response>
): SearchCall[] {
  const calls: SearchCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (!/\/(search|news)$/.test(url)) throw new Error(`unexpected fetch ${url}`);
      const call: SearchCall = {
        url,
        headers: Object.fromEntries(new Headers(init?.headers).entries()),
        body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
      };
      calls.push(call);
      const out = await respond(call, init);
      if (out instanceof Response) return out;
      return new Response(JSON.stringify({ results: out }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    })
  );
  return calls;
}

/** The transport a shell would provide, reduced to direct calls on an in-process host. */
export function inProcessTransport(host: SearchHost): SearchTransport {
  return {
    async ask(params, onEvent, signal) {
      if (signal.aborted) return;
      const cancel = () => host.cancel({ taskId: params.taskId });
      signal.addEventListener('abort', cancel, { once: true });
      try {
        await host.ask(params, (event) => {
          if (event.taskId === params.taskId && !signal.aborted) onEvent(event);
        });
      } finally {
        signal.removeEventListener('abort', cancel);
      }
    },
    status: () => host.searchSettingsStatus(),
    setKey: (apiKey) => host.setSearch1ApiKey({ apiKey }),
  };
}

/** A key store kept in a variable, as the host's private storage would be. */
export function memoryKeyStore(initial?: string) {
  let key = initial;
  return {
    get: vi.fn(async () => key),
    set: vi.fn(async (next: string) => {
      key = next;
    }),
  };
}
