import { createRouter, type RouterHistory } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

/**
 * Browser history by default. A shell that loads the page from a file URL can
 * pass `createHashHistory()` instead; routes and search params stay the same.
 */
export function getRouter(options: { history?: RouterHistory } = {}) {
  return createRouter({
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    routeTree,
    scrollRestoration: true,
    ...(options.history ? { history: options.history } : {}),
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
