/**
 * One readable shape for failures that cross a boundary: the decision
 * capability, Search1API, the desktop host and the transport to it. Their
 * error classes differ, so read what they commonly carry: a `reasonCode`,
 * else a `code`, else the error `name`, plus the `message`. Only string codes
 * count: a DOMException's numeric legacy `code` says less than its name.
 */
export interface Failure {
  code: string;
  message: string;
}

export const UNKNOWN_FAILURE = 'UNKNOWN_ERROR';

function codeOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

export function describeFailure(error: unknown): Failure {
  if (typeof error === 'object' && error !== null) {
    const fields = error as Record<string, unknown>;
    return {
      code: codeOf(fields.reasonCode) ?? codeOf(fields.code) ?? codeOf(fields.name) ?? UNKNOWN_FAILURE,
      message: typeof fields.message === 'string' ? fields.message.trim() : '',
    };
  }
  if (typeof error === 'string') return { code: UNKNOWN_FAILURE, message: error.trim() };
  return { code: UNKNOWN_FAILURE, message: '' };
}

/**
 * Codes that mean the call was cancelled or ran out of time rather than
 * failed: the Nimi SDK's OPERATION_ABORTED and OPERATION_TIMEOUT, the web
 * platform's AbortError and TimeoutError, and this app's own budget.
 */
const CANCELED = new Set(['OPERATION_ABORTED', 'AbortError']);
const TIMED_OUT = new Set(['OPERATION_TIMEOUT', 'TimeoutError', 'BUDGET_EXCEEDED']);

export type FailureKind = 'canceled' | 'timeout' | 'failed';

export function failureKind(failure: Failure): FailureKind {
  if (CANCELED.has(failure.code)) return 'canceled';
  if (TIMED_OUT.has(failure.code)) return 'timeout';
  return 'failed';
}

/** The first line, cut to fit a status line. */
export function shortMessage(message: string, max = 160): string {
  const line = (message.split(/\r?\n/, 1)[0] ?? '').trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}
