/**
 * Minimal TypeSafe System One client plus the two judgments this app needs.
 * Docs: https://docs.typesafe.ai/api
 */
import { SOURCES, WINDOWS, type SourceId, type WindowId } from './sources';

export interface TypeSafeConfig {
  apiKey: string;
  model?: string;
}

type NoulQuestion = {
  type: 'noul';
  instructions: string;
  criteria?: { true?: string; false?: string };
};
type ChoiceQuestion = {
  type: 'choice';
  instructions: string;
  criteria: Record<string, string | null>;
};
type Question = NoulQuestion | ChoiceQuestion;

type NoulAnswer = { type: 'noul'; noul: number };
type ChoiceAnswer = {
  type: 'choice';
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
};
type Answer = NoulAnswer | ChoiceAnswer;

export interface SystemOneResponse {
  model: string;
  answers: Record<string, Answer>;
  usage: { input_tokens: number; output_tokens: number };
}

export class TypeSafeError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'TypeSafeError';
    this.status = status;
  }
}

export async function systemOne(
  config: TypeSafeConfig,
  state: unknown,
  questions: Record<string, Question>,
  signal?: AbortSignal
): Promise<SystemOneResponse> {
  const response = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      state,
      model: config.model ?? 'jev-latest',
      questions,
    }),
    signal,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new TypeSafeError(response.status, text.slice(0, 300) || response.statusText);
  }
  return (await response.json()) as SystemOneResponse;
}

// ---------------------------------------------------------------------------
// Judgment 1: what does the request ask for?
// ---------------------------------------------------------------------------

export interface Intent {
  window: { choice: WindowId; confidence: number };
  /** Probability that the user specifically wants each source. */
  sources: Record<SourceId, number>;
  /** Index into the candidates array the caller passed in. */
  query: { index: number; confidence: number };
  usage: SystemOneResponse['usage'];
}

export async function inferIntent(
  config: TypeSafeConfig,
  input: { request: string; candidates: string[]; now: Date },
  signal?: AbortSignal
): Promise<Intent> {
  const questions: Record<string, Question> = {};

  const windowCriteria: Record<string, string> = {};
  for (const w of WINDOWS) windowCriteria[w.id] = w.description;
  questions.window = {
    type: 'choice',
    instructions:
      'Does the request in `request` ask for recent results, and if so how recent? Judge only from what the request says or clearly implies; `now` is the current date. A request with no time cue wants any time.',
    criteria: windowCriteria,
  };

  for (const s of SOURCES) {
    questions[`source_${s.id}`] = {
      type: 'noul',
      instructions: `About \`request\`: ${s.ask.question}`,
      criteria: { true: s.ask.yes, false: s.ask.no },
    };
  }

  if (input.candidates.length > 1) {
    const criteria: Record<string, string> = {};
    input.candidates.forEach((c, i) => {
      criteria[`c${i}`] = c;
    });
    questions.query = {
      type: 'choice',
      instructions:
        'Which candidate in `candidates` is the best keyword query to send to a web search engine so the results match what the user is asking for in `request`? Prefer the candidate that keeps the subject and drops words about time, sources or phrasing that a search engine would treat as keywords.',
      criteria,
    };
  }

  const state = {
    request: input.request,
    now: input.now.toISOString().slice(0, 10),
    candidates: Object.fromEntries(input.candidates.map((c, i) => [`c${i}`, c])),
  };

  const res = await systemOne(config, state, questions, signal);

  const windowAnswer = res.answers.window;
  const window =
    windowAnswer?.type === 'choice'
      ? {
          choice: windowAnswer.choice as WindowId,
          confidence: windowAnswer.confidence,
        }
      : { choice: 'any' as const, confidence: 0 };

  const sources = {} as Record<SourceId, number>;
  for (const s of SOURCES) {
    const a = res.answers[`source_${s.id}`];
    sources[s.id] = a?.type === 'noul' ? a.noul : 0;
  }

  const queryAnswer = res.answers.query;
  const query =
    queryAnswer?.type === 'choice'
      ? {
          index: Number(queryAnswer.choice.slice(1)) || 0,
          confidence: queryAnswer.confidence,
        }
      : { index: 0, confidence: 1 };

  return { window, sources, query, usage: res.usage };
}

// ---------------------------------------------------------------------------
// Judgment 2: is each result about what was asked?
// ---------------------------------------------------------------------------

export interface RerankInput {
  id: string;
  source: string;
  title: string;
  snippet: string;
}

const RERANK_BATCH = 40;

export async function rerank(
  config: TypeSafeConfig,
  request: string,
  items: RerankInput[],
  signal?: AbortSignal
): Promise<{ relevance: Record<string, number>; usage: SystemOneResponse['usage'] }> {
  const relevance: Record<string, number> = {};
  const usage = { input_tokens: 0, output_tokens: 0 };
  if (items.length === 0) return { relevance, usage };

  const batches: RerankInput[][] = [];
  for (let i = 0; i < items.length; i += RERANK_BATCH) {
    batches.push(items.slice(i, i + RERANK_BATCH));
  }

  const responses = await Promise.all(
    batches.map((batch) => {
      const questions: Record<string, Question> = {};
      batch.forEach((_, i) => {
        questions[`r${i}`] = {
          type: 'noul',
          instructions: `Is \`results[${i}]\` about the subject the user asked for in \`request\`?`,
          criteria: {
            true: 'The title or snippet discusses the same subject the user asked about, even briefly or as one of several topics',
            false: 'The result is about something else that only shares words with the request (a different meaning of the same word, a different product, a person with the same name) or is unrelated',
          },
        };
      });
      const state = {
        request,
        results: batch.map((it) => ({
          source: it.source,
          title: it.title,
          snippet: it.snippet,
        })),
      };
      return systemOne(config, state, questions, signal);
    })
  );

  responses.forEach((res, b) => {
    usage.input_tokens += res.usage.input_tokens;
    usage.output_tokens += res.usage.output_tokens;
    batches[b]!.forEach((item, i) => {
      const a = res.answers[`r${i}`];
      relevance[item.id] = a?.type === 'noul' ? a.noul : 0;
    });
  });

  return { relevance, usage };
}
