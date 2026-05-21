# Plugin model

Last reviewed: 2026-05-21

## Trust model

Plank plugins are builtin or trusted local packages compiled with the app. They are not downloaded at runtime, and there is no sandbox or remote marketplace in the current implementation.

For architecture planning, [`platform-conceptual-model.md`](platform-conceptual-model.md) distinguishes plugin packages from workspace extensions and feature instances. [`platform-later-marketplace-phases.md`](platform-later-marketplace-phases.md) records the implemented trusted-local baseline and future marketplace gates. This document describes the current trusted local plugin-package implementation.

Plugin manifests may declare `trustLevel`:

- `builtin`: shipped product code with elevated trust. Required builtin plugin packages declare this explicitly.
- `trusted-local`: locally bundled plugin package code. This is the compatibility default when a manifest omits `trustLevel`.
- `restricted`: reserved for future marketplace or sandboxed execution. It is valid metadata today, but remote restricted execution is not implemented yet.

Runtime permissions are declared in `manifest.capabilities` using the current coarse gates: `cards:read`, `cards:write`, and `boardViews:read`. Mediated client and server platform services enforce those gates and return structured runtime diagnostics when access is denied or handlers fail.

Client plugins receive `PlatformClientServices` for navigation, cards, properties, views, and toast. Server plugins receive `PlatformServerServices`; the current server proof point is gated `cards.get(cardId)`.

## Builtin plugins

| Plugin | Package | Purpose |
| --- | --- | --- |
| `core-kanban` | `packages/plugins/core-kanban` | Default board view, core property editors, starter commands, status summary UI fill |
| `calendar-board` | `packages/plugins/calendar-board` | Month calendar view over timestamp fields |
| `focus-tools` | `packages/plugins/focus-tools` | Focus view, confidence property type, card drawer panel fill, example command, example card-change hook |
| `task-board` | `packages/plugins/task-board` | Task board view, task card manifest, task template, subtask workflow |

`core-kanban` and `calendar-board` are required builtins. `focus-tools` and `task-board` are workspace-toggleable through `workspaceExtensions`.

## Package policy

Local plugin packages must expose the same three package entrypoints:

- `.` for the client plugin entrypoint
- `./server` for the server plugin entrypoint
- `./manifest` for shared manifest, template, and package metadata

Package names must follow `@plank/plugin-${manifest.id}`. Client and server entries must import the shared manifest from `./manifest`; they should not duplicate manifest literals. Current manifests use semver-like `version` values, explicit `trustLevel`, explicit runtime permissions, and `serverModule: "./server"` when the package has a server export.

`scripts/sync-plugins.mjs` validates this policy before generating builtin registries. Architecture tests also enforce valid package exports, trust levels, permissions, hooks, deterministic registry order, and the server/client import boundary.

Plugin authors should include migration notes with SDK/runtime changes that affect manifests, feature registrations, persisted config, or permission requirements. A short package-local changelog entry is enough for trusted-local packages until an external distribution model exists.

## Supported plugin surfaces

Client plugin packages register browser/UI behavior through `defineClientPlugin(...)`. Server plugin packages register backend-safe behavior through `defineServerPlugin(...)`.

Supported surfaces today:

- `registerView`
- `registerPropertyType`
- `registerCommand`
- `registerUiExtension`
- `registerFeature`
- `registerCardChange`
- `registerBoardTypeTemplate`
- `registerCardTypeManifest`

Plugin package code may use feature helpers such as `defineViewFeature`, `defineCardTypeFeature`, `defineUiExtensionFeature`, and `defineBoardTypeTemplateFeature` with `registerFeature`. The runtime exposes arrays for views, commands, UI fills, templates, card type manifests, and handlers.

`registerUiExtension` is the preferred client UI extension API for new plugin package UI. The current trusted local runtime supports these named slots:

- `shell.sidebar.navigation`
- `board.header.actions`
- `card.header`
- `card.metadata.primary`
- `card.body.tools`
- `card.sidebar.panels`
- `card.footer.activity`
- `settings.workspace.panels`

Fills are ordered by optional `order`, then builtin plugin package order, then fill id. Fills may declare `requiredPermissions`; the runtime only renders them when the plugin package manifest includes those runtime permission strings. These runtime permission gates are separate from domain card/view `capabilities`.

## How enablement works

1. Builtin plugin packages are imported into the registry at build time.
2. Convex normalizes workspace extension records as enablement state and merges them with required builtins to compute active plugin package ids.
3. The board route and settings route filter registry content to the active plugin package set.
4. Only active plugin package views, commands, property types, UI extension fills, templates, card type manifests, and handlers are exposed through mediated runtime surfaces.
5. Disabled non-required extensions do not contribute runtime features until re-enabled.

Persisted board views are view feature instances. New rows include `featureInstance` identity alongside legacy view fields; readers continue to tolerate and normalize older rows.

Workspace extension config, board settings, board type view defaults, and board view config use versioned envelopes for new writes while preserving legacy reads.

## Frontend integration points

- views are rendered from the active plugin list on the board route
- commands are collected into the command palette
- property types are used by board editing and the card drawer
- UI extension fills are rendered in shell, board header, named card surface, and workspace settings slots
- board views own card presentation directly

The runtime rejects duplicate board type template ids when the builtin registry is created.

## Admin governance

Workspace managers can inspect extension metadata in settings:

- trust level and package version
- declared runtime permissions and registration hooks
- registered views, property types, commands, UI fills, board type templates, card type manifests, and card-change handlers
- normalized workspace extension config
- recent plugin diagnostics
- disabled-extension explanations

The settings UI only manages trusted-local enablement/config inspection today. It does not install remote plugins, uninstall packages, browse a marketplace, or sandbox restricted code.

## Board type templates

Plugins can register versioned board type templates. When a template is used, Convex copies the template's statuses and default views into a workspace-owned `boardTypes` row and stores only template source metadata.

This keeps templates as trusted starting points while allowing the resulting board type to evolve independently inside the workspace.

## Event hooks

Plugin card-change hooks receive the same normalized event stream that drives automations:

- `card.created`
- `card.updated`
- `card.moved`
- `card.deleted`
- `tag.applied`
- `property.changed`

The current event payload includes canonical identifiers plus change metadata such as status transitions, changed property keys, and tag deltas.

## Current limits

- plugin code is bundled locally; there is no remote install mechanism
- plugin server behavior is limited to what the core app exposes through normalized events and Convex logic
- cascaded automation writes do not currently re-emit card events, so hook chains only see direct core mutation emissions
