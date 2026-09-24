import { useEffect } from 'react';

export const APP_TITLE = 'Jev Search — Picks where to search. Ranks what comes back.';

/** The window title follows the page: the request on the results page, the app name elsewhere. */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
