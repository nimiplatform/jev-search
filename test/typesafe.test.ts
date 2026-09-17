import { afterEach, describe, expect, it, vi } from 'vitest';
import { systemOne } from '@/lib/typesafe';

afterEach(() => vi.unstubAllGlobals());

describe('TypeSafe provider failures', () => {
  it.each([
    [503, 'Jev is temporarily unavailable. Please try again shortly.'],
    [529, 'Jev is temporarily unavailable. Please try again shortly.'],
    [429, 'Jev is receiving too many requests. Please try again shortly.'],
    [401, 'Jev could not process this request (HTTP 401).'],
  ])('shows a readable message for HTTP %i without exposing the provider body', async (status, message) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ detail: { error_type: 'model_unavailable', message: 'Internal request details' } }),
      { status }
    )));
    await expect(systemOne({ apiKey: 'test' }, 'test', {})).rejects.toMatchObject({ status, message });
  });
});
