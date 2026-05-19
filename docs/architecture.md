# Architecture

Last reviewed: 2026-05-19

## Mental model

Plank has one canonical card model. Board types define workflow semantics, views are interchangeable lenses over the same cards, plugins extend the UI and schema contracts, and behavior packs react to normalized card events.

## Repository layers

- `apps/web` - frontend routes, board shell, card drawer, command palette, settings UI
- `convex` - persistence, auth, access checks, search, presence, activity, and automation runtime
- `packages/domain` - shared domain helpers and types
- `packages/plugin-sdk` - plugin registration contracts
- `packages/plugin-runtime` - builtin plugin registry and enablement filtering
- `packages/board-views` - shared drag-and-drop and grouping utilities for board-style views
- `packages/plugins/*` - builtin plugin implementations

## Core persisted model

- `workspaces` - tenant boundary
- `boards` - board scope, selected view, and board-level settings
- `boardTypes` - lifecycle statuses and default views
- `cardTypeRegistry` - card type manifests with schema plus semantic card policy
- `cards` - canonical typed work items
- `tagDefinitions` - workspace tags
- `workspaceExtensions` - plugin enablement records
- `boardViews` - per-board persisted views and view config
- `behaviorPacks`, `behaviorBindings`, `automationRuns` - automation storage and logs

## Frontend flow

1. The board route loads workspace overview and board page data from Convex through `@convex-dev/react-query`.
2. The route derives active plugins from required builtins plus workspace extension state.
3. Active plugin views, property editors, commands, and card slots are assembled in the client.
4. Board-style views receive derived columns from `boardType.lifecycleConfig.statuses`, where `column.id = status.key`.
5. The generic card drawer renders card details, while board views own card presentation inside each view.
6. The command palette exposes plugin commands on `Cmd/Ctrl+K`.

## Write path

Core board actions live in `apps/web/src/lib/use-board-actions.ts` and call Convex mutations in `convex/boards.ts`, `convex/cardTypes.ts`, `convex/tags.ts`, and related modules.

Important behavior of the write path:

- optimistic updates happen in the frontend
- authz stays in core Convex mutations
- normalized card events are emitted after core writes
- plugin card-change handlers and the behavior runtime both consume the same event seam

## Plugin runtime

The builtin registry is created in `packages/plugin-runtime`.

Current builtin plugins:

- `core-kanban`
- `calendar-board`
- `focus-tools`
- `task-board`

`core-kanban` and `calendar-board` are treated as required builtin plugins. Other builtin plugins are enabled or disabled per workspace through `workspaceExtensions`.

## Automation runtime

Automation lives on top of normalized card events.

Current event names:

- `card.created`
- `card.updated`
- `card.moved`
- `card.deleted`
- `tag.applied`
- `property.changed`

Current built-in actions:

- `set_property`
- `add_tag`
- `remove_tag`
- `move_status`
- `notify`
- `stop`

The settings UI already supports:

- simple rule authoring
- raw source editing
- compile and activate flow
- bindings
- run log inspection

## Collaboration surfaces

The current app also includes:

- workspace invites and member management
- board presence heartbeats
- board and card seen state
- board activity feed
- board title search

## Current gaps

- Behavior-triggered writes do not re-emit normalized card events yet, so cascaded automation chains are not closed.
- `notify` only records trace output; there is no external delivery integration yet.
- Plugins are local trusted code only; there is no remote install path or sandbox.
