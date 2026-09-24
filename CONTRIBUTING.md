# Contributing

Use the setup instructions in [README.md](README.md). Keep documentation, comments, commit messages and user-facing copy in English. Multilingual search examples and input handling are welcome.

Before opening a pull request:

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
pnpm build:electron
pnpm check
```

Keep changes focused. Explain the user-visible problem, the resulting behavior and how you verified it. Add regression coverage for behavioral changes, especially decision and search failures, budgets, cancellation, source selection and ranking. Tests should fake Search1API and the decision function and must not require real API keys or network access. For layout changes, check both mobile and desktop widths and include screenshots when possible.

Do not commit `.env`, API keys, responses containing private queries or generated build output. Commit `pnpm-lock.yaml` when dependencies change. Route types are generated and ignored.

Source definitions live in `src/lib/sources.ts`. The UI should keep search progress and results aligned, chips stationary as counts update, and result links visually distinct from brand accents. See [design-context.md](design-context.md) for design context.

Report ordinary bugs through GitHub issues. Follow [SECURITY.md](SECURITY.md) for sensitive reports.
