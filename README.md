# last24hours

Ask in plain language what happened recently. Get the right sources, ranked. No generated answers.

> "what are people saying about Bun 1.3 this week" → the last 7 days on Reddit, Hacker News, GitHub, X and the web, ranked by whether each hit is actually about Bun the runtime, not hair buns.

**How it works**

1. **Understand the request.** [TypeSafe](https://typesafe.ai)'s Jev model answers typed questions about the request: how far back (24h / 7d / 30d), which sources the user wants, and which keyword candidate to send to the engine. It returns probabilities, not prose, so code owns every decision.
2. **Search each source.** One [Search1API](https://www.search1api.com) call per source. Hacker News, Reddit, GitHub, X and the open web go through Google with `include_sites` and `time_range`, because those snippets carry a "3 days ago" prefix that makes freshness measurable. arXiv and YouTube use Search1API's vertical engines and are searched only when the request asks for papers or videos. Adding a source is one entry in `src/lib/sources.ts`.
3. **Judge every result.** One yes/no question per result: is this about what was asked? That probability, the age parsed from the snippet, and Google's own rank are combined with weights you can drag in the UI. Near-duplicates are grouped.

Everything the app inferred is shown as editable chips. Every edit, click and thumbs-up is logged (anonymously, to Cloudflare Analytics Engine) so the judge can be evaluated against real use.

## Run it

Requires Node 20.19+ and pnpm. Two API keys:

- `SEARCH1API_API_KEY` from [search1api.com](https://www.search1api.com)
- `TYPESAFE_API_KEY` from [typesafe.ai](https://typesafe.ai)

```bash
pnpm install
cp .dev.vars.example .dev.vars   # fill in the two keys
pnpm dev                          # http://localhost:3030
```

## Deploy

It is a Cloudflare Worker (TanStack Start + `@cloudflare/vite-plugin`).

```bash
wrangler secret put SEARCH1API_API_KEY
wrangler secret put TYPESAFE_API_KEY
pnpm deploy
```

`wrangler.jsonc` also declares an optional per-IP rate limit (30 searches per minute) and an Analytics Engine dataset for feedback. Remove either block if you do not want them.

## Layout

```
src/lib/sources.ts     source and window registry (add a source here)
src/lib/candidates.ts  keyword-query candidates built from the request
src/lib/typesafe.ts    TypeSafe client + the two judgments (intent, relevance)
src/lib/search1api.ts  Search1API client
src/lib/freshness.ts   age parsed from snippet prefixes ("3 days ago ...")
src/lib/rank.ts        composite score, clustering
src/lib/pipeline.ts    orchestration: infer → fan out → judge
src/server/search.ts   server functions (search, feedback), rate limit, logging
src/routes/            /  and  /search?q=&w=&s=
```

Tests: `pnpm test`. Typecheck and build: `pnpm build`.

## Why no LLM answer

The point is to see the sources, fast, with the judgment visible. A model that only selects and scores cannot hallucinate a result; it can only rank one wrongly, and you can see and correct that.

## License

MIT
