import { describe, expect, it, vi } from 'vitest';
import {
  DecisionAnswerError,
  inferIntent,
  judgeRelevance,
  type DecideFn,
  type DecisionAnswer,
  type DecisionResult,
  type DecisionSpec,
} from '@/lib/decide';
import { describeFailure, failureKind } from '@/lib/failure';
import { SOURCES, SOURCE_IDS } from '@/lib/sources';
import { answerIntent, relevanceResult } from './support/fakes';

const NOW = new Date('2026-09-18T18:30:00Z');

function recording(answer: (spec: DecisionSpec) => DecisionResult | Promise<DecisionResult>) {
  const specs: DecisionSpec[] = [];
  const options: Array<Parameters<DecideFn>[1]> = [];
  const decide = vi.fn<DecideFn>(async (spec, opts) => {
    specs.push(spec);
    options.push(opts);
    return answer(spec);
  });
  return { decide, specs, options };
}

/** Replaces or drops one answer of an otherwise complete intent result. */
function withAnswer(result: DecisionResult, questionId: string, replacement?: DecisionAnswer | Record<string, unknown>): DecisionResult {
  const answers = result.answers.filter((a) => a.questionId !== questionId);
  if (replacement) answers.push(replacement as DecisionAnswer);
  return { ...result, answers };
}

describe('inferIntent', () => {
  it('asks the window, every source, and the query and entity choices in one request', async () => {
    const { decide, specs } = recording((spec) => answerIntent(spec));
    const candidates = ['what are people saying about Bun 1.3 this week', 'Bun 1.3'];
    await inferIntent(decide, { request: 'what are people saying about Bun 1.3 this week', candidates, now: NOW }, {});

    expect(decide).toHaveBeenCalledTimes(1);
    const choices = [
      { id: 'c0', description: { text: candidates[0] } },
      { id: 'c1', description: { text: candidates[1] } },
    ];
    expect(specs[0]).toEqual({
      type: 'text-decide',
      state: {
        json: {
          request: 'what are people saying about Bun 1.3 this week',
          now: '2026-09-18',
          candidates: { c0: candidates[0], c1: candidates[1] },
        },
      },
      questions: [
        {
          id: 'window',
          kind: 'choice',
          instructions: {
            text: 'Does the request in `request` ask for recent results, and if so how recent? Judge only from what the request says or clearly implies; `now` is the current date. A request with no time cue wants any time.',
          },
          candidates: [
            { id: 'any', description: { text: 'The request does not ask for recent results; older, evergreen pages are fine' } },
            { id: '24h', description: { text: 'Only things from today or the last day' } },
            { id: '7d', description: { text: 'Things from the last several days, up to a week' } },
            { id: '30d', description: { text: 'Things from the last few weeks, up to a month' } },
          ],
        },
        ...SOURCES.map((s) => ({
          id: `source_${s.id}`,
          kind: 'boolean',
          instructions: { text: `About \`request\`: ${s.ask.question}` },
          trueCriterion: { text: s.ask.yes },
          falseCriterion: { text: s.ask.no },
        })),
        {
          id: 'query',
          kind: 'choice',
          instructions: {
            text: 'Which candidate in `candidates` is the best keyword query to send to a web search engine so the results match what the user is asking for in `request`? Prefer the candidate that keeps the subject and drops words about time, sources or phrasing that a search engine would treat as keywords.',
          },
          candidates: choices,
        },
        {
          id: 'entity',
          kind: 'choice',
          instructions: {
            text: 'Which candidate in `candidates` is just the name or title of the thing the user is asking about in `request`, as you would type it into a catalogue such as IMDb or a library index? Prefer the shortest candidate that is still the full proper name.',
          },
          candidates: choices,
        },
      ],
    });
    expect(specs[0]!.questions).toHaveLength(15);
  });

  it('asks no query or entity choice when there is only one candidate', async () => {
    const { decide, specs } = recording((spec) => answerIntent(spec));
    const intent = await inferIntent(decide, { request: 'Bun 1.3', candidates: ['Bun 1.3'], now: NOW }, {});
    expect(specs[0]!.questions.map((q) => q.id)).toEqual(['window', ...SOURCE_IDS.map((id) => `source_${id}`)]);
    expect(specs[0]!.state).toEqual({ json: { request: 'Bun 1.3', now: '2026-09-18', candidates: { c0: 'Bun 1.3' } } });
    expect(intent.query).toBeNull();
    expect(intent.entity).toBeNull();
  });

  it('passes the signal and timeout through untouched', async () => {
    const { decide, options } = recording((spec) => answerIntent(spec));
    const controller = new AbortController();
    await inferIntent(decide, { request: 'Bun', candidates: ['Bun'], now: NOW }, { signal: controller.signal, timeoutMs: 29_000 });
    expect(options[0]).toEqual({ signal: controller.signal, timeoutMs: 29_000 });
  });

  it('returns the probabilities exactly as answered', async () => {
    const { decide } = recording((spec) =>
      answerIntent(
        spec,
        {
          window: { choice: '7d', probability: 0.62 },
          sources: { reddit: 0.91, google: 0.33 },
          query: { choice: 'c1', probability: 0.77 },
          entity: { choice: 'c0', probability: 0.58 },
        },
        'trace-42'
      )
    );
    const intent = await inferIntent(decide, { request: 'Bun news on Reddit this week', candidates: ['Bun news on Reddit this week', 'Bun'], now: NOW }, {});
    expect(intent.window).toEqual({ choice: '7d', probability: 0.62 });
    expect(intent.sources.reddit).toBe(0.91);
    expect(intent.sources.google).toBe(0.33);
    expect(intent.sources.youtube).toBe(0.1);
    expect(Object.keys(intent.sources).sort()).toEqual([...SOURCE_IDS].sort());
    expect(intent.query).toEqual({ index: 1, probability: 0.77 });
    expect(intent.entity).toEqual({ index: 0, probability: 0.58 });
    expect(intent.traceId).toBe('trace-42');
  });

  const request = { request: 'Bun news', candidates: ['Bun news', 'Bun'], now: NOW };
  const broken: Array<[string, (spec: DecisionSpec) => DecisionResult]> = [
    ['a missing window answer', (spec) => withAnswer(answerIntent(spec), 'window')],
    ['a missing source answer', (spec) => withAnswer(answerIntent(spec), 'source_reddit')],
    ['a missing query answer', (spec) => withAnswer(answerIntent(spec), 'query')],
    ['a boolean answer to a choice question', (spec) =>
      withAnswer(answerIntent(spec), 'window', { questionId: 'window', kind: 'boolean', trueProbability: 0.5 })],
    ['a choice answer to a boolean question', (spec) =>
      withAnswer(answerIntent(spec), 'source_x', {
        questionId: 'source_x', kind: 'choice', selectedCandidateId: 'yes', probabilities: [{ candidateId: 'yes', probability: 1 }],
      })],
    ['a window that was not offered', (spec) =>
      withAnswer(answerIntent(spec), 'window', {
        questionId: 'window', kind: 'choice', selectedCandidateId: '90d', probabilities: [{ candidateId: '90d', probability: 0.9 }],
      })],
    ['no probability for the selected candidate', (spec) =>
      withAnswer(answerIntent(spec), 'window', {
        questionId: 'window', kind: 'choice', selectedCandidateId: '7d', probabilities: [{ candidateId: 'any', probability: 0.4 }],
      })],
    ['a probability above 1', (spec) =>
      withAnswer(answerIntent(spec), 'source_reddit', { questionId: 'source_reddit', kind: 'boolean', trueProbability: 1.2 })],
    ['a probability that is not a number', (spec) =>
      withAnswer(answerIntent(spec), 'source_reddit', { questionId: 'source_reddit', kind: 'boolean', trueProbability: null })],
    ['an answer to a question that was not asked', (spec) =>
      withAnswer(answerIntent(spec), 'bonus', { questionId: 'bonus', kind: 'boolean', trueProbability: 0.5 })],
    ['two answers to one question', (spec) => {
      const result = answerIntent(spec);
      return { ...result, answers: [...result.answers, result.answers[0]!] };
    }],
    ['a result of another type', (spec) => ({ ...answerIntent(spec), type: 'text-generate' }) as unknown as DecisionResult],
  ];

  it.each(broken)('fails on %s instead of filling in a default', async (_name, answer) => {
    const { decide } = recording(answer);
    const failure = inferIntent(decide, request, {});
    await expect(failure).rejects.toBeInstanceOf(DecisionAnswerError);
    await expect(failure).rejects.toMatchObject({ reasonCode: 'DECISION_ANSWER_INVALID' });
  });

  it('lets a decision failure through with its reason code', async () => {
    const error = Object.assign(new Error('Local AI is not configured'), { reasonCode: 'AI_LOCAL_CONFIGURATION_NOT_CONFIGURED' });
    const decide = vi.fn<DecideFn>(async () => {
      throw error;
    });
    await expect(inferIntent(decide, request, {})).rejects.toBe(error);
  });
});

describe('judgeRelevance', () => {
  it('asks one boolean question about one result', async () => {
    const { decide, specs, options } = recording(() => relevanceResult(0.83));
    const controller = new AbortController();
    const probability = await judgeRelevance(
      decide,
      'Bun 1.3 release',
      { source: 'reddit', title: 'Bun 1.3 is out', snippet: 'Release notes' },
      { signal: controller.signal, timeoutMs: 12_000 }
    );
    expect(probability).toBe(0.83);
    expect(specs).toEqual([
      {
        type: 'text-decide',
        state: { json: { request: 'Bun 1.3 release', result: { source: 'reddit', title: 'Bun 1.3 is out', snippet: 'Release notes' } } },
        questions: [
          {
            id: 'relevant',
            kind: 'boolean',
            instructions: { text: 'Is `result` about the subject the user asked for in `request`?' },
            trueCriterion: {
              text: 'The title or snippet discusses the same subject the user asked about, even briefly or as one of several topics',
            },
            falseCriterion: {
              text: 'The result is about something else that only shares words with the request (a different meaning of the same word, a different product, a person with the same name) or is unrelated',
            },
          },
        ],
      },
    ]);
    expect(options).toEqual([{ signal: controller.signal, timeoutMs: 12_000 }]);
  });

  it.each([
    ['no answer', { type: 'text-decide', answers: [], traceId: 't' }],
    ['a choice answer', {
      type: 'text-decide',
      answers: [{ questionId: 'relevant', kind: 'choice', selectedCandidateId: 'yes', probabilities: [{ candidateId: 'yes', probability: 1 }] }],
      traceId: 't',
    }],
    ['a negative probability', { type: 'text-decide', answers: [{ questionId: 'relevant', kind: 'boolean', trueProbability: -0.1 }], traceId: 't' }],
    ['a missing trace id', { type: 'text-decide', answers: [{ questionId: 'relevant', kind: 'boolean', trueProbability: 0.4 }] }],
  ])('fails on %s instead of scoring 0', async (_name, result) => {
    const decide = vi.fn<DecideFn>(async () => result as unknown as DecisionResult);
    await expect(judgeRelevance(decide, 'Bun', { source: 'google', title: 't', snippet: 's' }, {})).rejects.toBeInstanceOf(
      DecisionAnswerError
    );
  });

  it('keeps 0 and 1 when they are the answer', async () => {
    for (const p of [0, 1]) {
      const decide = vi.fn<DecideFn>(async () => relevanceResult(p));
      expect(await judgeRelevance(decide, 'Bun', { source: 'google', title: 't', snippet: 's' }, {})).toBe(p);
    }
  });
});

describe('describeFailure', () => {
  it('prefers reasonCode, then code, then name', () => {
    expect(describeFailure(Object.assign(new Error('Provider down'), { reasonCode: 'AI_PROVIDER_UNAVAILABLE', code: 'X' })))
      .toEqual({ code: 'AI_PROVIDER_UNAVAILABLE', message: 'Provider down' });
    expect(describeFailure({ code: 'ECONNRESET', message: 'socket hang up' })).toEqual({ code: 'ECONNRESET', message: 'socket hang up' });
    expect(describeFailure(new DOMException('The operation was aborted due to timeout', 'TimeoutError')))
      .toEqual({ code: 'TimeoutError', message: 'The operation was aborted due to timeout' });
    expect(describeFailure('plain text')).toEqual({ code: 'UNKNOWN_ERROR', message: 'plain text' });
    expect(describeFailure(undefined)).toEqual({ code: 'UNKNOWN_ERROR', message: '' });
  });

  it('reads the Nimi SDK codes for cancellation and timeouts', () => {
    const sdk = (code: string, reasonCode?: string) =>
      describeFailure(Object.assign(new Error('x'), { name: 'NimiError', code, ...(reasonCode ? { reasonCode } : {}) }));
    expect(failureKind(sdk('OPERATION_ABORTED'))).toBe('canceled');
    expect(failureKind(sdk('OPERATION_TIMEOUT'))).toBe('timeout');
    expect(failureKind(sdk('SDK_LOCAL_APP_INPUT_INVALID'))).toBe('failed');
    expect(sdk('RUNTIME_ERROR', 'AI_ROUTE_UNSUPPORTED').code).toBe('AI_ROUTE_UNSUPPORTED');
    expect(failureKind(sdk('RUNTIME_ERROR', 'AI_ROUTE_UNSUPPORTED'))).toBe('failed');
    expect(failureKind(describeFailure(new DOMException('Stopped', 'AbortError')))).toBe('canceled');
    expect(failureKind(describeFailure(new DOMException('Too slow', 'TimeoutError')))).toBe('timeout');
  });
});
