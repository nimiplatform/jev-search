import { afterEach, describe, expect, it, vi } from 'vitest';
import { runSearch } from '@/lib/pipeline';

type Call = { url: string; body: Record<string, unknown> };
const calls: Call[] = [];

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      calls.push({ url, body });

      if (url.endsWith('/v1/systemone')) {
        const questions = body.questions as Record<string, { type: string }>;
        const answers: Record<string, unknown> = {};
        for (const [id, q] of Object.entries(questions)) {
          if (id === 'window') {
            answers[id] = { type: 'choice', choice: '7d', probabilities: { '7d': 0.8 }, confidence: 0.8 };
          } else if (id === 'query') {
            answers[id] = { type: 'choice', choice: 'c1', probabilities: { c0: 0.2, c1: 0.8 }, confidence: 0.8 };
          } else if (id.startsWith('source_')) {
            answers[id] = { type: 'noul', noul: id === 'source_reddit' ? 0.9 : 0.1 };
          } else if (q.type === 'noul') {
            // r0 is on topic, r1 is the hair bun.
            answers[id] = { type: 'noul', noul: id === 'r0' ? 0.95 : 0.05 };
          }
        }
        return jsonResponse({ model: 'jev-1.13.0', answers, usage: { input_tokens: 100, output_tokens: 1 } });
      }

      if (url.endsWith('/search')) {
        return jsonResponse({
          results: [
            { title: 'Should I move away from Bun? - Reddit', link: 'https://www.reddit.com/r/bun/1', snippet: '3 days ago ... runtime' },
            { title: 'Hair up in a bun : r/hair - Reddit', link: 'https://www.reddit.com/r/hair/2', snippet: '1 day ago ... hair' },
          ],
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  calls.length = 0;
});

describe('runSearch', () => {
  it('infers window and sources, picks the stripped query, and scores results', async () => {
    stubFetch();
    const out = await runSearch(
      { search1api: { apiKey: 's1' }, typesafe: { apiKey: 'ts' }, now: () => new Date('2026-09-17T00:00:00Z') },
      { request: 'what are people saying about Bun 1.3 this week' }
    );

    expect(out.window).toBe('7d');
    expect(out.sources).toEqual(['reddit']);
    expect(out.query).toBe('Bun 1.3');

    const searchCall = calls.find((c) => c.url.endsWith('/search'))!;
    expect(searchCall.body).toMatchObject({
      query: 'Bun 1.3',
      search_service: 'google',
      time_range: 'week',
      include_sites: ['reddit.com'],
    });

    expect(out.items).toHaveLength(2);
    expect(out.items[0]).toMatchObject({ id: 'reddit:1', relevance: 0.95, ageHours: 72, snippet: 'runtime' });
    expect(out.items[1]).toMatchObject({ id: 'reddit:2', relevance: 0.05, ageHours: 24 });
    expect(out.tokens).toBe(200);
  });

  it('respects explicit window and sources and excludes restricted sites for web', async () => {
    stubFetch();
    const out = await runSearch(
      { search1api: { apiKey: 's1' }, typesafe: { apiKey: 'ts' } },
      { request: 'Bun 1.3', window: '24h', sources: ['web', 'github'] }
    );
    expect(out.window).toBe('24h');
    expect(out.sources).toEqual(['web', 'github']);
    const searches = calls.filter((c) => c.url.endsWith('/search'));
    expect(searches).toHaveLength(2);
    expect(searches[0]!.body).toMatchObject({ time_range: 'day', include_sites: [], exclude_sites: ['news.ycombinator.com', 'reddit.com', 'github.com', 'x.com'] });
    expect(searches[1]!.body).toMatchObject({ include_sites: ['github.com'] });
  });

  it('keeps going when one source fails', async () => {
    stubFetch();
    const original = globalThis.fetch as ReturnType<typeof vi.fn>;
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { include_sites?: string[] };
      if (String(input).endsWith('/search') && body.include_sites?.[0] === 'github.com') {
        return new Response('upstream broke', { status: 502 });
      }
      return original(input, init);
    }));
    const out = await runSearch(
      { search1api: { apiKey: 's1' }, typesafe: { apiKey: 'ts' } },
      { request: 'Bun 1.3', sources: ['reddit', 'github'] }
    );
    expect(out.errors).toEqual([{ source: 'github', message: 'upstream broke' }]);
    expect(out.items.map((i) => i.source)).toEqual(['reddit', 'reddit']);
  });
});
