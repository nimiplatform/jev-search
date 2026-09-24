import { createContext, useContext } from 'react';
import type { SearchTransport } from './host-transport';

/** The transport to the desktop host; null when the page runs without one. */
export const SearchTransportContext = createContext<SearchTransport | null>(null);

export function useSearchTransport(): SearchTransport | null {
  return useContext(SearchTransportContext);
}
