# Plank

Plank is an open-source, Convex-powered team workflow app with realtime boards,
typed cards, local plugins, and a deterministic automation engine.

## Alpha status

Plank is currently in **alpha**.

- bugs and breaking changes are expected
- features and data models may change without migration guarantees
- do not use this project for production workloads yet

## Authentication warning

Current auth is intentionally simple for development velocity and is **not security-hardened**.

- minimal checks and guardrails are implemented today
- threat modeling and full security review are still pending
- treat this as a development/demo setup, not production-grade auth

## Current product state

Reviewed against the codebase on 2026-05-19.

Implemented today:

- realtime workspaces with members, invites, auth, presence, and seen state
- boards backed by typed cards, board types, card types, and tags
- board views: Kanban, Calendar, Focus, and Task Board
- workspace-level plugin enable/disable controls
- plugin-driven property types, commands, card slots, card renderers, and board type templates
- automation packs, bindings, compile/activate flow, and run logs
- board search, command palette, and plugin-aware card drawer rendering

Current limits:

- behavior-triggered writes do not re-emit normalized card events yet
- `notify` is trace-only in v1 (no email/push/chat delivery)
- plugins are trusted local code; there is no remote marketplace or sandbox

## Repo layout

- `apps/web` - TanStack Start frontend
- `convex` - schema, auth, queries, mutations, search, and behavior runtime
- `packages/domain` - shared domain types and helpers
- `packages/ui` - UI primitives
- `packages/plugin-sdk` - plugin authoring API
- `packages/plugin-runtime` - builtin registry and enablement filtering
- `packages/board-views` - shared board-view utilities
- `packages/plugins/*` - builtin plugins

## Getting started

### Prerequisites

- Node.js
- pnpm
- a Convex project or local Convex dev environment

### Install and run

```bash
pnpm install
npx convex dev
pnpm dev
```

Useful follow-up commands:

```bash
pnpm convex:codegen
pnpm typecheck
pnpm test
```

### Environment setup

Copy `.env.example` values into your local `.env.local` and set your own Convex deployment values.

### Auth setup

Plank uses Convex Auth with local email/password accounts during development.

```bash
pnpm exec auth --web-server-url http://localhost:3000
```

## Documentation

- [`docs/README.md`](docs/README.md)
- [`docs/architecture.md`](docs/architecture.md)
- [`docs/plugins.md`](docs/plugins.md)

## Open-source files

- [`LICENSE`](LICENSE)
- [`CONTRIBUTING.md`](CONTRIBUTING.md)
- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)
- [`SECURITY.md`](SECURITY.md)
- [`SUPPORT.md`](SUPPORT.md)
- [`CHANGELOG.md`](CHANGELOG.md)
