import { invoke, listenShell } from '@nimiplatform/kit/shell/renderer/bridge';
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
mountJevSearch(container, {
  transport: createShellSearchTransport({ invoke, listen: listenShell }),
  history: createHashHistory(),
});
