# `@plank/web`

This package contains the TanStack Start frontend for Plank.

## What the web app owns

- auth entry points and invite redemption
- workspace shell and board navigation
- board view rendering for active plugins
- command palette, board search, presence, and activity UI
- generic card drawer rendering
- workspace settings for extensions, schema, automation, and members

## Important routes

- `src/routes/index.tsx` - marketing / landing page
- `src/routes/login.tsx` - sign-in flow
- `src/routes/invite.$token.tsx` - invite acceptance
- `src/routes/w.$workspaceSlug/index.tsx` - workspace home
- `src/routes/w.$workspaceSlug/boards.$boardId.tsx` - main board experience
- `src/routes/w.$workspaceSlug/settings.tsx` - workspace settings

## Important frontend seams

- `src/lib/providers.tsx` wires the Convex client, React Query, and plugin registry into the app.
- `src/lib/use-board-actions.ts` contains board mutations and optimistic UI behavior.
- `src/components/card-drawer.tsx` hosts the generic card drawer.
- `src/components/command-palette.tsx` renders the plugin command surface opened with `Cmd/Ctrl+K`.
- `src/routes/w.$workspaceSlug/_settings/` contains the workspace settings tabs.

## Data flow

- Reads use `@convex-dev/react-query` with Convex queries.
- Writes go through Convex mutations and are wrapped by local board actions for optimistic updates.
- The board route assembles active plugin views, property editors, commands, and card slots from the builtin registry plus workspace enablement state.

## Development

From the repo root:

```bash
pnpm dev
pnpm --filter @plank/web test
pnpm --filter @plank/web test:e2e
pnpm --filter @plank/web typecheck
```

## Styling

The app uses Tailwind v4 plus local design tokens in [`src/styles.css`](src/styles.css).
