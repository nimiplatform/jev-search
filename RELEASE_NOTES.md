# Release notes

## 0.1.1

- Uses published Nimi SDK/Kit 0.21.0 and App Tools 0.13.1 with Electron 44 on Windows x86-64.
- New searches and settings operations prepare the protected session; cancellation during preparation does not start a search or replay an earlier operation.
- An explicit time window no longer triggers an extra speculative Google search that could not be reused.
- If the speculative Google search fails, the Google result shows that failure instead of paying for the same
  search again past its 15-second limit.

## 0.1.0

Initial Nimi desktop adaptation of Jev Search, adapted from the upstream web app ([superagents-lab/jev-search](https://github.com/superagents-lab/jev-search), upstream `main` at `67027d0`). This earlier local candidate was not publicly released.

- Runs as a Nimi App on Windows x86-64, in an Electron Host supervised by Nimi Desktop.
- Reading the request and judging each result's relevance use Nimi `text.decide`. Which model answers, and whether it runs locally or in the cloud, is configured in Nimi.
- Web search goes through Search1API with your own key, entered once in the search settings. The key is sealed with the operating system's encryption and kept in the App's Nimi storage; the page only learns whether a key is configured.
- Stop, Search again, per-source failure notices and unjudged results with their reasons stay visible; nothing is filled in by guessing.
- Result and footer links open in your default browser.
