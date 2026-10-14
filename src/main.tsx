import { createNimiClient } from '@nimiplatform/sdk';
import { createNimiLocalAppStandardShellSurface, invoke, listenShell } from '@nimiplatform/kit/shell/renderer/bridge';
import { createHashHistory } from '@tanstack/react-router';
import { mountJevSearch } from './app';
import { createShellSearchTransport } from './lib/shell-transport';

/*
 * The page inside the Desktop-supervised Electron Host. Searches and the
 * Search1API key go to the App's Host commands through the Kit renderer
 * bridge that the preload installs; outside that Host the bridge reports
 * itself unavailable. The packaged page is loaded from a file URL, so routes
 * and search parameters live in the URL hash.
 */
const container = document.getElementById('app');
if (!container) throw new Error('index.html has no #app element');
const nimi = createNimiClient({ localApp: { standardShell: createNimiLocalAppStandardShellSurface() } });
mountJevSearch(container, {
  transport: createShellSearchTransport({
    invoke,
    listen: listenShell,
    prepareSession: async (signal) => {
      signal?.throwIfAborted();
      const status = await nimi.auth.status();
      signal?.throwIfAborted();
      if (!status.sessionBound) throw Object.assign(new Error(status.reasonCode), { reasonCode: status.reasonCode });
    },
  }),
  history: createHashHistory(),
});
