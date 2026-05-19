# Plugin model

Last reviewed: 2026-05-19

## Trust model

Plank plugins are builtin, trusted local packages compiled with the app. They are not downloaded at runtime, and there is no sandbox or remote marketplace in the current implementation.

## Builtin plugins

| Plugin | Package | Purpose |
| --- | --- | --- |
| `core-kanban` | `packages/plugins/core-kanban` | Default board view, core property editors, starter commands, status summary slot |
| `calendar-board` | `packages/plugins/calendar-board` | Month calendar view over timestamp fields |
| `focus-tools` | `packages/plugins/focus-tools` | Focus view, confidence property type, card slot, example command, example card-change hook |
| `task-board` | `packages/plugins/task-board` | Task board view, task card manifest, task template, subtask workflow |

`core-kanban` and `calendar-board` are required builtins. `focus-tools` and `task-board` are workspace-toggleable through `workspaceExtensions`.

## Supported plugin surfaces

Plugins register through `definePlugin(manifest, register)`.

Supported surfaces today:

- `registerView`
- `registerPropertyType`
- `registerCommand`
- `registerCardSlot`
- `registerCardChange`
- `registerBoardTypeTemplate`

## How enablement works

1. Builtin plugin packages are imported into the registry at build time.
2. Convex merges required builtins with workspace extension records to compute active plugin ids.
3. The board route filters registry content to the active plugin set.
4. Only active plugin views, commands, property types, slots, and templates are exposed in the UI.

## Frontend integration points

- views are rendered from the active plugin list on the board route
- commands are collected into the command palette
- property types are used by board editing and the card drawer
- card slots are rendered inside the drawer side panels
- board views own card presentation directly

The runtime rejects duplicate board type template ids when the builtin registry is created.

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
