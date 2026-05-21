# Architecture

Last reviewed: 2026-05-21

## Mental model

Plank has one canonical card model. Board types define workflow semantics, views are interchangeable lenses over the same cards, trusted-local plugin packages extend UI/schema/runtime seams, and behavior packs react to normalized card events.

Shared platform vocabulary is defined in [`platform-conceptual-model.md`](platform-conceptual-model.md). In architecture planning, use "plugin package" for code and manifests, "workspace extension" for workspace-scoped enablement, and "feature instance" for concrete mounted or persisted uses of a feature.

## Repository layers

- `apps/web` - frontend routes, board shell, feature-owned UI modules, card drawer, command palette, settings UI
- `convex` - persistence, auth, access checks, search, collaboration helpers, presence, activity, plugin diagnostics, and automation runtime
- `packages/domain` - shared domain helpers and types
- `packages/plugin-sdk` - split client/server plugin registration contracts and platform service types
- `packages/plugin-runtime` - generated builtin registries, package policy validation, enablement filtering, permission gating, and event dispatch
- `packages/board-views` - shared drag-and-drop and grouping utilities for board-style views
- `packages/plugins/*` - builtin plugin implementations

## Target ownership boundaries

- Core platform - auth, tenancy, routing, layout primitives, persistence contracts, and mediated platform APIs
- Builtin features - shipped product behavior such as collaboration, views, automations, notifications, comments, presence, and activity
- Plugin runtime - plugin package discovery, deterministic registry generation, package policy validation, registration, enablement filtering, trusted local execution, split client/server registries, and permission diagnostics

## Core persisted model

- `workspaces` - tenant boundary
- `boards` - board scope, selected view, and board-level settings
- `boardTypes` - lifecycle statuses and default views
- `cardTypeRegistry` - card type manifests with schema plus semantic card policy
- `cards` - canonical typed work items
- `tagDefinitions` - workspace tags
- `workspaceExtensions` - workspace extension enablement/config state for plugin packages
- `boardViews` - per-board persisted view feature instances and view config; new rows carry `featureInstance` identity while legacy fields remain readable
- `pluginDiagnostics` - persisted plugin permission, handler, manifest, and admin-extension diagnostics
- `behaviorPacks`, `behaviorBindings`, `automationRuns` - automation storage and logs

Persisted config/state uses versioned envelopes for new writes on `boardViews.config`, `workspaceExtensions.config`, `boards.boardSettings`, and `boardTypes.viewDefaults`, while readers continue to tolerate legacy rows during rollout.

## Frontend flow

1. The board route loads workspace overview and board page data from Convex through `@convex-dev/react-query`.
2. The route derives active plugin packages from required builtins plus workspace extension state.
3. Active plugin package views, property editors, commands, and UI extension fills are assembled in the client through mediated platform services.
4. Board-style views receive derived columns from `boardType.lifecycleConfig.statuses`, where `column.id = status.key`.
5. The generic card drawer renders named card surface zones, while board views own card presentation inside each view.
6. The command palette exposes plugin commands on `Cmd/Ctrl+K`.

## Write path

Core board actions live in `apps/web/src/lib/use-board-actions.ts` and call Convex mutations in `convex/boards.ts`, `convex/cardTypes.ts`, `convex/tags.ts`, and related modules.

Important behavior of the write path:

- optimistic updates happen in the frontend
- authz stays in core Convex mutations
- normalized card events are emitted after core writes
- plugin card-change handlers and the behavior runtime both consume the same event seam
- plugin server handlers receive mediated server services instead of raw Convex context

## Plugin runtime

The builtin registry is generated in `packages/plugin-runtime` from local plugin packages. Each package exposes `.`, `./server`, and `./manifest`, and `scripts/sync-plugins.mjs` validates package policy before updating generated registries.

Current builtin plugins:

- `core-kanban`
- `calendar-board`
- `focus-tools`
- `task-board`

`core-kanban` and `calendar-board` are treated as required builtin plugins. Other builtin plugins are enabled or disabled per workspace through `workspaceExtensions`.

Client plugins use `defineClientPlugin(...)`; server plugins use `defineServerPlugin(...)`. Runtime permissions currently use `cards:read`, `cards:write`, and `boardViews:read`. Admins can inspect trust level, package version, permissions, hooks, registered features, config, and recent diagnostics in workspace settings.

Current UI extension slots:

- `shell.sidebar.navigation`
- `board.header.actions`
- `card.header`
- `card.metadata.primary`
- `card.body.tools`
- `card.sidebar.panels`
- `card.footer.activity`
- `settings.workspace.panels`

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
- comments, mentions, notifications, cleanup helpers, and notification center live behind collaboration feature boundaries

## Current gaps

- Behavior-triggered writes do not re-emit normalized card events yet, so cascaded automation chains are not closed.
- `notify` only records trace output; there is no external delivery integration yet.
- Plugins are local trusted code only; there is no remote install path or sandbox.
- `restricted` plugin trust is reserved metadata only; it is not sandboxed execution.
