/**
 * The two typed judgments this app needs, asked through one injected function.
 *
 * The desktop host passes a DecideFn that runs the Nimi `text.decide`
 * capability through `services.ai.scenario.execute(spec, options)`, flattening
 * its `{ output: { type, answers }, traceId }` result into DecisionResult.
 * Nimi decides which model answers and where it runs; nothing here knows or
 * branches on backend, provider or model. The spec and answer shapes mirror
 * the Nimi SDK text-decide contract exactly.
 *
 * Answers are used as given. A missing, mistyped or out-of-range answer is a
 * failed judgment: these functions throw instead of filling in a default.
 * Errors from the DecideFn pass through untouched; see failure.ts for how
 * their `reasonCode`, `code` or `name` is read.
 */
import { SOURCES, WINDOWS, type SourceId, type WindowId } from './sources';

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type DecisionContent = { text: string } | { json: Record<string, JsonValue> | JsonValue[] };
export type DecisionQuestion =
  | { id: string; instructions: DecisionContent; kind: 'choice'; candidates: Array<{ id: string; description?: DecisionContent }> }
  | { id: string; instructions: DecisionContent; kind: 'boolean'; trueCriterion?: DecisionContent; falseCriterion?: DecisionContent };
export type DecisionSpec = { type: 'text-decide'; state: DecisionContent; questions: DecisionQuestion[] };
export type DecisionAnswer =
  | { questionId: string; kind: 'choice'; selectedCandidateId: string; probabilities: Array<{ candidateId: string; probability: number }> }
  | { questionId: string; kind: 'boolean'; trueProbability: number };
export type DecisionResult = { type: 'text-decide'; answers: DecisionAnswer[]; traceId: string };
export type DecideFn = (spec: DecisionSpec, options: { signal?: AbortSignal; timeoutMs?: number }) => Promise<DecisionResult>;
export type DecideOptions = Parameters<DecideFn>[1];

type ChoiceQuestion = Extract<DecisionQuestion, { kind: 'choice' }>;
type BooleanQuestion = Extract<DecisionQuestion, { kind: 'boolean' }>;

/** The decision came back, but an answer does not fit the question that was asked. */
export class DecisionAnswerError extends Error {
  readonly reasonCode = 'DECISION_ANSWER_INVALID';
  constructor(message: string) {
    super(message);
    this.name = 'DecisionAnswerError';
  }
}

export const WINDOW_INSTRUCTIONS =
  'Does the request in `request` ask for recent results, and if so how recent? Judge only from what the request says or clearly implies; `now` is the current date. A request with no time cue wants any time.';
export const QUERY_INSTRUCTIONS =
  'Which candidate in `candidates` is the best keyword query to send to a web search engine so the results match what the user is asking for in `request`? Prefer the candidate that keeps the subject and drops words about time, sources or phrasing that a search engine would treat as keywords.';
export const ENTITY_INSTRUCTIONS =
  'Which candidate in `candidates` is just the name or title of the thing the user is asking about in `request`, as you would type it into a catalogue such as IMDb or a library index? Prefer the shortest candidate that is still the full proper name.';
export const RELEVANCE_INSTRUCTIONS = 'Is `result` about the subject the user asked for in `request`?';
export const RELEVANCE_TRUE =
  'The title or snippet discusses the same subject the user asked about, even briefly or as one of several topics';
export const RELEVANCE_FALSE =
  'The result is about something else that only shares words with the request (a different meaning of the same word, a different product, a person with the same name) or is unrelated';

function isProbability(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

/** Index the answers by question, rejecting anything that is not one answer per question asked. */
function readAnswers(result: DecisionResult, questions: DecisionQuestion[]): Map<string, DecisionAnswer> {
  if (typeof result !== 'object' || result === null || result.type !== 'text-decide' || !Array.isArray(result.answers)) {
    throw new DecisionAnswerError('The decision did not return a text-decide result');
  }
  if (typeof result.traceId !== 'string') throw new DecisionAnswerError('The decision result has no trace id');
  const asked = new Set(questions.map((q) => q.id));
  const answers = new Map<string, DecisionAnswer>();
  for (const answer of result.answers) {
    const id = typeof answer === 'object' && answer !== null ? answer.questionId : undefined;
    if (typeof id !== 'string' || !asked.has(id)) throw new DecisionAnswerError(`The decision answered a question that was not asked (${String(id)})`);
    if (answers.has(id)) throw new DecisionAnswerError(`The decision answered question ${id} twice`);
    answers.set(id, answer);
  }
  return answers;
}

function choiceAnswer(answers: Map<string, DecisionAnswer>, question: ChoiceQuestion): { id: string; probability: number } {
  const answer = answers.get(question.id);
  if (!answer) throw new DecisionAnswerError(`No answer for question ${question.id}`);
  if (answer.kind !== 'choice') throw new DecisionAnswerError(`Question ${question.id} needs a choice answer`);
  const offered = new Set(question.candidates.map((c) => c.id));
  if (!offered.has(answer.selectedCandidateId)) {
    throw new DecisionAnswerError(`Question ${question.id} selected a candidate that was not offered`);
  }
  if (!Array.isArray(answer.probabilities)) throw new DecisionAnswerError(`Question ${question.id} has no probabilities`);
  for (const entry of answer.probabilities) {
    if (!offered.has(entry?.candidateId) || !isProbability(entry.probability)) {
      throw new DecisionAnswerError(`Question ${question.id} has an invalid candidate probability`);
    }
  }
  const selected = answer.probabilities.find((entry) => entry.candidateId === answer.selectedCandidateId);
  if (!selected) throw new DecisionAnswerError(`Question ${question.id} has no probability for its selected candidate`);
  return { id: answer.selectedCandidateId, probability: selected.probability };
}

function booleanAnswer(answers: Map<string, DecisionAnswer>, question: BooleanQuestion): number {
  const answer = answers.get(question.id);
  if (!answer) throw new DecisionAnswerError(`No answer for question ${question.id}`);
  if (answer.kind !== 'boolean') throw new DecisionAnswerError(`Question ${question.id} needs a boolean answer`);
  if (!isProbability(answer.trueProbability)) throw new DecisionAnswerError(`Question ${question.id} has an invalid probability`);
  return answer.trueProbability;
}

// ---------------------------------------------------------------------------
// Judgment 1: what does the request ask for?
// ---------------------------------------------------------------------------

export interface Intent {
  /** The chosen window and the probability the decision gave that choice. */
  window: { choice: WindowId; probability: number };
  /** Probability that the user specifically wants each source. */
  sources: Record<SourceId, number>;
  /** Index into the caller's candidates. Null when there was one candidate, so nothing was asked. */
  query: { index: number; probability: number } | null;
  /** Candidate that is just the name or title asked about, for catalogue engines. Null as for `query`. */
  entity: { index: number; probability: number } | null;
  traceId: string;
}

export async function inferIntent(
  decide: DecideFn,
  input: { request: string; candidates: string[]; now: Date },
  options: DecideOptions
): Promise<Intent> {
  const windowQuestion: ChoiceQuestion = {
    id: 'window',
    instructions: { text: WINDOW_INSTRUCTIONS },
    kind: 'choice',
    candidates: WINDOWS.map((w) => ({ id: w.id, description: { text: w.description } })),
  };
  const sourceQuestions: BooleanQuestion[] = SOURCES.map((s) => ({
    id: `source_${s.id}`,
    instructions: { text: `About \`request\`: ${s.ask.question}` },
    kind: 'boolean',
    trueCriterion: { text: s.ask.yes },
    falseCriterion: { text: s.ask.no },
  }));
  const questions: DecisionQuestion[] = [windowQuestion, ...sourceQuestions];

  let queryQuestion: ChoiceQuestion | null = null;
  let entityQuestion: ChoiceQuestion | null = null;
  if (input.candidates.length > 1) {
    const candidates = input.candidates.map((c, i) => ({ id: `c${i}`, description: { text: c } }));
    queryQuestion = { id: 'query', instructions: { text: QUERY_INSTRUCTIONS }, kind: 'choice', candidates };
    entityQuestion = { id: 'entity', instructions: { text: ENTITY_INSTRUCTIONS }, kind: 'choice', candidates };
    questions.push(queryQuestion, entityQuestion);
  }

  const spec: DecisionSpec = {
    type: 'text-decide',
    state: {
      json: {
        request: input.request,
        now: input.now.toISOString().slice(0, 10),
        candidates: Object.fromEntries(input.candidates.map((c, i) => [`c${i}`, c])),
      },
    },
    questions,
  };

  const result = await decide(spec, options);
  const answers = readAnswers(result, questions);

  const window = choiceAnswer(answers, windowQuestion);
  const sources = {} as Record<SourceId, number>;
  sourceQuestions.forEach((question, i) => {
    sources[SOURCES[i]!.id] = booleanAnswer(answers, question);
  });
  const candidateIndex = (question: ChoiceQuestion | null) => {
    if (!question) return null;
    const { id, probability } = choiceAnswer(answers, question);
    return { index: Number(id.slice(1)), probability };
  };

  return {
    window: { choice: window.id as WindowId, probability: window.probability },
    sources,
    query: candidateIndex(queryQuestion),
    entity: candidateIndex(entityQuestion),
    traceId: result.traceId,
  };
}

// ---------------------------------------------------------------------------
// Judgment 2: is this result about what was asked?
// ---------------------------------------------------------------------------

export interface RelevanceInput {
  source: string;
  title: string;
  snippet: string;
}

/**
 * One decision per result. Measured on a local model, a shared state of many
 * results could not be resolved item by item, while one result per decision
 * judged correctly; the same unit is used whatever runs the decision.
 */
export async function judgeRelevance(
  decide: DecideFn,
  request: string,
  item: RelevanceInput,
  options: DecideOptions
): Promise<number> {
  const question: BooleanQuestion = {
    id: 'relevant',
    instructions: { text: RELEVANCE_INSTRUCTIONS },
    kind: 'boolean',
    trueCriterion: { text: RELEVANCE_TRUE },
    falseCriterion: { text: RELEVANCE_FALSE },
  };
  const spec: DecisionSpec = {
    type: 'text-decide',
    state: { json: { request, result: { source: item.source, title: item.title, snippet: item.snippet } } },
    questions: [question],
  };
  const result = await decide(spec, options);
  return booleanAnswer(readAnswers(result, [question]), question);
}
