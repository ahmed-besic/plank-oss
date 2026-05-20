# Architecture

Last reviewed: 2026-05-19

## Mental model

Plank has one canonical card model. Board types define workflow semantics, views are interchangeable lenses over the same cards, plugins extend the UI and schema contracts, and behavior packs react to normalized card events.

Shared platform vocabulary is defined in [`platform-conceptual-model.md`](platform-conceptual-model.md). In architecture planning, use "plugin package" for code and manifests, "workspace extension" for workspace-scoped enablement, and "feature instance" for concrete mounted or persisted uses of a feature.

## Repository layers

- `apps/web` - frontend routes, board shell, card drawer, command palette, settings UI
- `convex` - persistence, auth, access checks, search, presence, activity, and automation runtime
- `packages/domain` - shared domain helpers and types
- `packages/plugin-sdk` - plugin registration contracts
- `packages/plugin-runtime` - builtin plugin registry and enablement filtering
- `packages/board-views` - shared drag-and-drop and grouping utilities for board-style views
- `packages/plugins/*` - builtin plugin implementations

## Target ownership boundaries

- Core platform - auth, tenancy, routing, layout primitives, persistence contracts, and mediated platform APIs
- Builtin features - shipped product behavior such as collaboration, views, automations, notifications, comments, presence, and activity
- Plugin runtime - plugin package discovery, deterministic registry generation, registration, enablement filtering, trusted local execution, and future client/server split seams

## Core persisted model

- `workspaces` - tenant boundary
- `boards` - board scope, selected view, and board-level settings
- `boardTypes` - lifecycle statuses and default views
- `cardTypeRegistry` - card type manifests with schema plus semantic card policy
- `cards` - canonical typed work items
- `tagDefinitions` - workspace tags
- `workspaceExtensions` - workspace extension enablement/config state for plugin packages
- `boardViews` - per-board persisted view feature instances and view config; new rows carry `featureInstance` identity while legacy fields remain readable
- `behaviorPacks`, `behaviorBindings`, `automationRuns` - automation storage and logs

## Frontend flow

1. The board route loads workspace overview and board page data from Convex through `@convex-dev/react-query`.
2. The route derives active plugin packages from required builtins plus workspace extension state.
3. Active plugin package views, property editors, commands, and UI extension fills are assembled in the client.
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
