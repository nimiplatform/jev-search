/**
 * The App's DecideFn over Nimi `text.decide`: each decision is one synchronous
 * Scenario execute through the Host's SDK client
 * (`bridge.services.ai.scenario.execute`). Which model answers, and whether it
 * runs locally or in the cloud, is configured in Nimi; nothing here selects,
 * reads or branches on it.
 *
 * Errors pass through unchanged, so the pipeline reads the SDK's
 * OPERATION_ABORTED, OPERATION_TIMEOUT and SDK_LOCAL_APP_INPUT_INVALID codes
 * and Runtime reason codes (AI_INPUT_LIMIT_EXCEEDED, AI_ROUTE_UNSUPPORTED,
 * AI_LOCAL_CONFIGURATION_NOT_CONFIGURED, ...) as they were raised.
 */
import type {
  NimiLocalAppScenarioExecuteOptions,
  NimiLocalAppScenarioExecuteResult,
  NimiLocalAppScenarioExecuteSpec,
  NimiLocalAppTextDecisionAnswer,
} from '@nimiplatform/sdk/app';
import { DecisionAnswerError, type DecideFn, type DecisionAnswer, type DecisionResult } from '../src/lib/decide';

/** `bridge.services.ai.scenario.execute` of the Kit Electron App bridge. */
export type ScenarioExecute = (
  spec: NimiLocalAppScenarioExecuteSpec,
  options?: NimiLocalAppScenarioExecuteOptions
) => Promise<NimiLocalAppScenarioExecuteResult>;

export function createNimiDecide(execute: ScenarioExecute): DecideFn {
  return async (spec, options) => flattenDecision(await execute(spec, options));
}

/** `{ output: { type, answers }, traceId }` as `{ type, answers, traceId }`, answers copied as returned. */
export function flattenDecision(result: NimiLocalAppScenarioExecuteResult): DecisionResult {
  const { output, traceId } = result;
  if (output.type !== 'text-decide') {
    throw new DecisionAnswerError(`The decision returned a ${String(output.type)} result instead of text-decide`);
  }
  return { type: output.type, answers: output.answers.map(copyAnswer), traceId };
}

function copyAnswer(answer: NimiLocalAppTextDecisionAnswer): DecisionAnswer {
  if (answer.kind === 'choice') {
    return {
      questionId: answer.questionId,
      kind: answer.kind,
      selectedCandidateId: answer.selectedCandidateId,
      probabilities: answer.probabilities.map(({ candidateId, probability }) => ({ candidateId, probability })),
    };
  }
  return { questionId: answer.questionId, kind: answer.kind, trueProbability: answer.trueProbability };
}
