import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { app, BrowserWindow, ipcMain, Menu, protocol, safeStorage, session, shell, webContents } from 'electron';
import { configureNimiElectronAppHostProfile } from '@nimiplatform/kit/shell/electron/host-profile';
// App modules are bundled into this file and have no load-time side effects.
import { createSearchHost } from '../host/search-host';
import { createNimiDecide } from './nimi-decide';
import { createSearchCommandHandlers } from './search-commands';
import { createSearch1ApiKeyStore, type KeyEncryption } from './search1api-key-store';

declare const __NIMI_ELECTRON_PRODUCTION__: boolean;

// Bind user data, session data and temp to the Host profile Nimi Desktop
// prepared under the selected data root, before any session or window and
// before the rest of Kit loads: a module that failed to load first would
// leave Electron on its default paths in the OS user's profile.
try {
  configureNimiElectronAppHostProfile(app);
} catch (error) {
  process.stderr.write(`[nimi-app-host-profile] ${error instanceof Error ? error.message : String(error)}\n`);
  app.exit(78);
  throw error;
}

const {
  isAllowedElectronRendererUrl,
  registerNimiElectronAppAssetProtocolScheme,
  registerNimiElectronAppBridge,
} = await import('@nimiplatform/kit/shell/electron/main');

const APP_ID = 'io.github.nimiplatform.jev-search';
const APP_NAME = 'Jev Search';
const NATIVE_BUNDLE_IDENTIFIER = 'ai.nimi.apps.io.github.nimiplatform.jev-search';
const IS_PRODUCTION_BUNDLE = typeof __NIMI_ELECTRON_PRODUCTION__ !== 'undefined'
  && __NIMI_ELECTRON_PRODUCTION__;
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(currentDir, '..');
const preloadPath = path.join(currentDir, 'preload.cjs');
// The production page is loaded from a file URL; the renderer keeps its routes in the URL hash.
const productionRendererUrl = pathToFileURL(path.join(appRoot, 'dist', 'index.html')).toString();
const developmentRendererUrl = readDevelopmentRendererUrl();
const rendererUrl = developmentRendererUrl || productionRendererUrl;
const allowedRendererUrls = [rendererUrl];

app.setName(APP_NAME);
app.setAppUserModelId(NATIVE_BUNDLE_IDENTIFIER);
Menu.setApplicationMenu(null);
registerNimiElectronAppAssetProtocolScheme(protocol);

void app.whenReady().then(async () => {
  // Services of the bridge registered below: decisions and storage run over
  // the protected session Kit holds for this Host.
  const searchHost = createSearchHost({
    decide: createNimiDecide((spec, options) => bridge.services.ai.scenario.execute(spec, options)),
    keyStore: createSearch1ApiKeyStore({
      storage: {
        readJson: (relativePath) => bridge.services.storage.readJson(relativePath),
        writeJson: (relativePath, value) => bridge.services.storage.writeJson(relativePath, value),
      },
      encryption: osKeyEncryption(),
    }),
  });
  const bridge = registerNimiElectronAppBridge({
    appId: APP_ID,
    allowedRendererUrls,
    assetMediaPlatform: { protocol, webRequest: session.defaultSession.webRequest, webContents },
    ipcMain,
    appCommandHandlers: createSearchCommandHandlers(searchHost),
    // The page's session is gone: stop every search so none reports into the next one.
    onSessionInvalidated: () => {
      searchHost.cancelAll();
    },
  });
  await createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createMainWindow();
  });
}).catch((error: unknown) => {
  process.stderr.write(`[jev-search-host] ${error instanceof Error ? error.stack || error.message : String(error)}\n`);
  app.exit(1);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

async function createMainWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 360,
    minHeight: 560,
    title: APP_NAME,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // Result and footer links leave the App: web pages open in the default browser, never in a Host window.
  window.webContents.setWindowOpenHandler(({ url }) => {
    openInBrowser(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (isAllowedElectronRendererUrl(url, allowedRendererUrls)) return;
    event.preventDefault();
    openInBrowser(url);
  });
  await window.loadURL(rendererUrl);
}

/** Only plain web links are handed to the OS; other schemes are ignored. */
function openInBrowser(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }
  if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || parsed.username || parsed.password) return;
  shell.openExternal(parsed.toString()).catch(() => {
    // The address is not logged: result links can carry the search text.
    process.stderr.write('[jev-search-host] The default browser did not open a link.\n');
  });
}

/** The OS encryption Electron offers through safeStorage; Linux's plain-text fallback does not count. */
function osKeyEncryption(): KeyEncryption {
  return {
    isEncryptionAvailable: () =>
      safeStorage.isEncryptionAvailable()
      && !(process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text'),
    encryptString: (plainText) => safeStorage.encryptString(plainText),
    decryptString: (encrypted) => safeStorage.decryptString(Buffer.from(encrypted)),
  };
}

function readDevelopmentRendererUrl(): string {
  const flag = '--nimi-dev-renderer-url';
  const prefix = '--nimi-dev-renderer-url=';
  const hasDevelopmentRendererArgument = process.argv.some((value) => value === flag || value.startsWith(prefix));
  if (IS_PRODUCTION_BUNDLE && hasDevelopmentRendererArgument) {
    throw new Error('The production Electron bundle rejects --nimi-dev-renderer-url.');
  }
  if (process.argv.includes(flag)) throw new Error('Nimi development renderer URL is missing.');
  const values = process.argv.filter((value) => value.startsWith(prefix));
  if (values.length === 0) return '';
  if (values.length !== 1) throw new Error('Nimi development renderer URL must be singular.');
  const selected = values[0];
  if (!selected) throw new Error('Nimi development renderer URL is missing.');
  const raw = selected.slice(prefix.length);
  const parsed = new URL(raw);
  if (
    parsed.protocol !== 'http:'
    || !['127.0.0.1', 'localhost', '[::1]', '::1'].includes(parsed.hostname.toLowerCase())
    || !parsed.port
    || parsed.username
    || parsed.password
    || (parsed.pathname !== '/' && parsed.pathname !== '')
    || parsed.search
    || parsed.hash
  ) {
    throw new Error('Nimi development renderer URL must be exact loopback.');
  }
  return parsed.origin;
}
