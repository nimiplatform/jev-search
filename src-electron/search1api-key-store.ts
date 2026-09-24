/**
 * Custody of the Search1API key in the Host. The key is sealed by the operating
 * system through Electron `safeStorage`; only that ciphertext, base64 encoded,
 * is written to the App's Nimi-mediated JSON storage. Without OS encryption the
 * key is refused, never stored in the clear. The key is returned only to the
 * search host, which sends it to Search1API; nothing here logs it or puts it
 * into an error.
 */
import type { SearchKeyStore } from '../host/search-host';

/** The App storage document that holds the sealed key. */
export const SEARCH1API_KEY_DOCUMENT = 'settings/search1api.json';

const DOCUMENT_FORMAT = 'jev-search.search1api-key/v1';
const DOCUMENT_ENCRYPTION = 'electron-safe-storage';
const MAX_CIPHERTEXT_LENGTH = 8192;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export type SealedKeyDocument = {
  format: typeof DOCUMENT_FORMAT;
  encryption: typeof DOCUMENT_ENCRYPTION;
  /** base64 of `safeStorage.encryptString(key)`. */
  ciphertext: string;
};

/** Electron `safeStorage`, reduced to what the store uses. */
export interface KeyEncryption {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Uint8Array;
  decryptString(encrypted: Uint8Array): string;
}

/** `bridge.services.storage` of the Kit Electron App bridge, reduced to JSON documents. */
export interface KeyDocumentStorage {
  readJson(relativePath: string): Promise<{ readonly value: unknown }>;
  writeJson(relativePath: string, value: SealedKeyDocument): Promise<unknown>;
}

export class Search1ApiKeyStoreError extends Error {
  readonly reasonCode: string;
  constructor(reasonCode: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'Search1ApiKeyStoreError';
    this.reasonCode = reasonCode;
  }
}

export const KEY_ENCRYPTION_UNAVAILABLE = 'SEARCH1API_KEY_ENCRYPTION_UNAVAILABLE';
export const KEY_UNREADABLE = 'SEARCH1API_KEY_UNREADABLE';

export function createSearch1ApiKeyStore(deps: { storage: KeyDocumentStorage; encryption: KeyEncryption }): SearchKeyStore {
  const { storage, encryption } = deps;
  return {
    async get() {
      let document: unknown;
      try {
        document = (await storage.readJson(SEARCH1API_KEY_DOCUMENT)).value;
      } catch (error) {
        if (isStorageEntryNotFound(error)) return undefined;
        throw error;
      }
      const ciphertext = readCiphertext(document);
      if (!encryption.isEncryptionAvailable()) {
        throw new Search1ApiKeyStoreError(
          KEY_ENCRYPTION_UNAVAILABLE,
          'The saved Search1API key cannot be read: OS encryption (Electron safeStorage) is unavailable on this system.'
        );
      }
      try {
        return encryption.decryptString(fromBase64(ciphertext));
      } catch (cause) {
        throw new Search1ApiKeyStoreError(
          KEY_UNREADABLE,
          'The saved Search1API key cannot be decrypted on this system. Enter the key again in the search settings.',
          { cause }
        );
      }
    },

    async set(key) {
      if (!encryption.isEncryptionAvailable()) {
        throw new Search1ApiKeyStoreError(
          KEY_ENCRYPTION_UNAVAILABLE,
          'The Search1API key was not saved: OS encryption (Electron safeStorage) is unavailable on this system, and the key is never stored unencrypted.'
        );
      }
      const ciphertext = toBase64(encryption.encryptString(key));
      await storage.writeJson(SEARCH1API_KEY_DOCUMENT, {
        format: DOCUMENT_FORMAT,
        encryption: DOCUMENT_ENCRYPTION,
        ciphertext,
      });
    },
  };
}

/** The stored document must be exactly the sealed-key shape; anything else is unreadable, not "no key". */
function readCiphertext(document: unknown): string {
  const unreadable = () =>
    new Search1ApiKeyStoreError(
      KEY_UNREADABLE,
      'The saved Search1API key is not in a readable format. Enter the key again in the search settings.'
    );
  if (typeof document !== 'object' || document === null || Array.isArray(document)) throw unreadable();
  const record = document as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.join(',') !== 'ciphertext,encryption,format') throw unreadable();
  if (record.format !== DOCUMENT_FORMAT || record.encryption !== DOCUMENT_ENCRYPTION) throw unreadable();
  const ciphertext = record.ciphertext;
  if (
    typeof ciphertext !== 'string' ||
    ciphertext === '' ||
    ciphertext.length > MAX_CIPHERTEXT_LENGTH ||
    !BASE64.test(ciphertext)
  ) {
    throw unreadable();
  }
  return ciphertext;
}

/**
 * A missing document means no key has been saved. The spellings follow the
 * reference App's storage handling of the same Kit/Runtime carrier.
 */
export function isStorageEntryNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const fields = error as { reasonCode?: unknown; code?: unknown };
  const raw = typeof fields.reasonCode === 'string' ? fields.reasonCode : fields.code;
  if (typeof raw !== 'string') return false;
  const normalized = raw.trim().toUpperCase().replaceAll('-', '_');
  return (
    normalized === 'APP_STORAGE_ENTRY_NOT_FOUND' ||
    normalized === 'NOT_FOUND' ||
    normalized === 'ENTRY_NOT_FOUND' ||
    normalized.endsWith('_STORAGE_JSON_NOT_FOUND') ||
    normalized.endsWith('_STORAGE_ENTRY_NOT_FOUND')
  );
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
}
