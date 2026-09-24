import { RouterProvider, type RouterHistory } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { SearchTransport } from './lib/host-transport';
import { SearchTransportContext } from './lib/transport-context';
import { getRouter } from './router';
import './styles.css';

export interface MountOptions {
  /** The desktop host connection; null runs the page without one, and searches then say so. */
  transport: SearchTransport | null;
  history?: RouterHistory;
}

/** Renders the app into `container`; returns a function that unmounts it. */
export function mountJevSearch(container: Element, options: MountOptions): () => void {
  const router = getRouter({ history: options.history });
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <SearchTransportContext.Provider value={options.transport}>
        <RouterProvider router={router} />
      </SearchTransportContext.Provider>
    </StrictMode>
  );
  return () => root.unmount();
}
