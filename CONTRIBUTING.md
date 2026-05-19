# Contributing

## Expectations

- Keep the core board workflow lean and fast.
- Treat new features as core necessities or explicit extensions.
- Preserve shared contracts in `packages/domain` and `packages/plugin-sdk`.

## Development setup

1. Run `pnpm install`.
2. Start Convex locally with `npx convex dev`.
3. Run `pnpm dev` for the web app.

## Pull request checklist

Before opening a PR, run:

```bash
pnpm lint
pnpm typecheck
pnpm test
```

Also ensure:

- no secrets or private credentials are committed
- docs and tests are updated for behavior changes
- changes are scoped and described clearly in the PR

## Commit guidance

- Use clear, imperative commit messages.
- Keep each commit focused on one concern.

## Architecture guardrails

- Core board data lives in Convex tables and shared domain types.
- Extensions are trusted local packages in `packages/plugins/*`.
- New extension surfaces should go through `definePlugin` in `@plank/plugin-sdk`.
