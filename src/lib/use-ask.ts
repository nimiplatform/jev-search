import { useCallback, useEffect, useRef, useState } from 'react';
import { createAskSession, IDLE, type AskParams, type AskSession, type AskState } from './ask-session';
import { useSearchTransport } from './transport-context';

export type { AskState } from './ask-session';

/**
 * Runs the search for the page's parameters through the desktop host.
 * Changing a parameter cancels the running task and starts a new one;
 * `searchAgain` starts a new task with the same parameters; `stop` cancels
 * the running task and keeps what has arrived.
 */
export function useAsk(params: AskParams) {
  const transport = useSearchTransport();
  // The first frame already says "Reading your question" when there is one.
  const [state, setState] = useState<AskState>(() =>
    params.q.trim() ? { ...IDLE, phase: 'understanding' } : IDLE
  );
  const [attempt, setAttempt] = useState(0);
  const session = useRef<AskSession | null>(null);
  const key = JSON.stringify(params);

  useEffect(() => {
    const created = createAskSession(transport, setState);
    session.current = created;
    return () => {
      created.dispose();
      if (session.current === created) session.current = null;
    };
  }, [transport]);

  useEffect(() => {
    session.current?.start(params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transport, key, attempt]);

  const stop = useCallback(() => session.current?.stop(), []);
  const searchAgain = useCallback(() => setAttempt((n) => n + 1), []);

  return { state, stop, searchAgain };
}
