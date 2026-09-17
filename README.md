# s1 ask

Ask in plain language. The app picks the right sources, sends the right query, and ranks what comes back. No generated answers.

> "what are people saying about Bun 1.3 this week" → the last 7 days on Hacker News, Reddit, X and the web, ranked by whether each hit is about Bun the runtime, not hair buns.
> "who directed Oppenheimer and who is in it" → any time, web + Wikipedia + IMDb.
> "Claude Code 入门教程视频" → YouTube only.

**How it works**

1. **Understand the request.** [TypeSafe](https://typesafe.ai)'s Jev model answers typed questions about the request: whether it wants recent results and how recent (any time by default, or 24h / 7d / 30d), which sources fit, and which keyword candidate to send to the engines. It returns probabilities, not prose, so code owns every decision. Everything it inferred is shown as chips the user can change.
2. **Search each source, on more than one engine where it helps.** Everything goes through [Search1API](https://www.search1api.com). Google and DuckDuckGo each search the open web; Hacker News, Reddit and GitHub are each queried on both of those engines with `include_sites` (and `time_range` when a window is set), a URL both return is one row that says "found by 2 engines", and one engine failing does not empty the source. X, arXiv, YouTube, Wikipedia, IMDb and WeChat use Search1API's vertical engines. Snippets that carry a date ("3 days ago …", "2026-09-13") give freshness; with a window set, anything provably older is dropped. Adding a source or an engine is one entry in `src/lib/sources.ts`.
3. **Judge every result.** One yes/no question per result: is this about what was asked? Results are ordered by that probability, which is the "94% on topic" shown on each row; ties go to the row more engines returned, then to engine rank. With a time window set you can switch to Newest. Near-duplicates are grouped, and rows the judge calls off-topic are folded under a link.

The whole thing streams. `POST /api/ask` returns newline-delimited JSON: first what the judge understood, then every engine lane on its own as soon as it has answered and its rows are scored, then a summary. On the page one row under the search box is the judge's reading of the question: the time window, then the sources it chose, each with its count once its results are in; everything not chosen is behind "more". Under it, where the results will land, the wait is narrated the way an agent narrates its work: "Looking for “…” · past week", then one line per source that moves from "Asking Reddit…" to "Reddit · 16 found" to "Reddit · 9 of 16 answer you". As soon as the first results are on screen the block folds to one line that keeps updating ("Still asking Hacker News… · 24 found so far", then "Asked 5 sources · 44 found · 15 answer you · 6.7s"); click to reopen it. Results fade in as each source is ranked, each with the judge's on-topic percentage; rows that did not seem to match are folded under a link at the bottom. Google is queried with the words as typed at the same moment the judge starts reading them; when the judge keeps those words and wants no time window (most factual questions) that call is the Google lane and the first results land about a second sooner. Each engine call has a 6-second cap so one slow engine cannot hold the page, and every engine call is cached.

Every edit to the chips, every click and every thumbs-up is logged (anonymously, to Cloudflare Analytics Engine) so the judge can be evaluated against real use.

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

`wrangler.jsonc` also declares a KV namespace that caches each engine call by query, engine and time window (10 minutes for "past day", up to 6 hours for "any time"), an optional per-IP rate limit (30 searches per minute), and an Analytics Engine dataset for feedback. Create the namespace with `wrangler kv namespace create CACHE` and paste its id; remove any block you do not want.

## Layout

```
src/lib/sources.ts     source and window registry (add a source here)
src/lib/candidates.ts  keyword-query candidates built from the request
src/lib/typesafe.ts    TypeSafe client + the two judgments (intent, relevance)
src/lib/search1api.ts  Search1API client
src/lib/freshness.ts   age parsed from snippet prefixes ("3 days ago ...")
src/lib/rank.ts        composite score, clustering
src/lib/pipeline.ts    orchestration as an event stream: infer → per-source fan out → judge
src/lib/use-ask.ts     client hook that consumes the stream
src/routes/api/ask.ts  POST /api/ask (NDJSON), same-origin check, rate limit, logging
src/server/search.ts   feedback server function
src/routes/            /  and  /search?q=&w=&s=
```

Tests: `pnpm test`. Typecheck and build: `pnpm build`.

## Why no LLM answer

The point is to see the sources, fast, with the judgment visible. A model that only selects and scores cannot hallucinate a result; it can only rank one wrongly, and you can see and correct that.

## License

MIT
