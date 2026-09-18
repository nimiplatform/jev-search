import { env as workerEnv } from 'cloudflare:workers';

export function getEnv() {
  // Optional bindings may be removed by self-hosters without changing application code.
  const env: typeof workerEnv & {
    CACHE?: KVNamespace;
    SEARCH_RATE_LIMIT?: RateLimit;
  } = workerEnv;
  if (!env.SEARCH1API_API_KEY) {
    throw new Error('SEARCH1API_API_KEY is not set (see .dev.vars.example)');
  }
  if (!env.TYPESAFE_API_KEY) {
    throw new Error('TYPESAFE_API_KEY is not set (see .dev.vars.example)');
  }
  return env;
}
