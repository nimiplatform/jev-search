import { env as workerEnv } from 'cloudflare:workers';

interface RateLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface AnalyticsEngineDataset {
  writeDataPoint(point: {
    blobs?: string[];
    doubles?: number[];
    indexes?: string[];
  }): void;
}

interface KVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface AppEnv {
  SEARCH1API_API_KEY: string;
  SEARCH1API_BASE_URL?: string;
  TYPESAFE_API_KEY: string;
  TYPESAFE_MODEL?: string;
  SEARCH_RATE_LIMIT?: RateLimiter;
  CACHE?: KVLike;
  FEEDBACK?: AnalyticsEngineDataset;
}

export function getEnv(): AppEnv {
  const env = workerEnv as unknown as AppEnv;
  if (!env.SEARCH1API_API_KEY) {
    throw new Error('SEARCH1API_API_KEY is not set (see .dev.vars.example)');
  }
  if (!env.TYPESAFE_API_KEY) {
    throw new Error('TYPESAFE_API_KEY is not set (see .dev.vars.example)');
  }
  return env;
}
