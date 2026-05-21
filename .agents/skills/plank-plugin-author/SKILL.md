---
name: plank-plugin-author
description: Use when creating, modifying, or reviewing Plank trusted-local plugins in this repo, including plugin manifests, client/server entrypoints, views, commands, UI extensions, card type manifests, board type templates, card-change handlers, package policy, registry sync, and plugin tests.
---

# Plank Plugin Author

Use this skill whenever the user asks to build, scaffold, modify, or diagnose a Plank plugin.

## First Reads

Before editing plugin code, read:

- `docs/plugins.md`
- `docs/architecture.md`
- `docs/platform-later-marketplace-phases.md`
- `packages/plugin-sdk/src/index.ts`
- `packages/plugin-runtime/src/index.ts`
- `scripts/plugin-package-policy.mjs`

If the plugin touches Convex code, also read `convex/_generated/ai/guidelines.md`.

## Current Plugin Model

Plank supports trusted-local and builtin plugin packages compiled with the app. It does not support remote install, untrusted sandboxing, signed updates, or marketplace distribution.

Each plugin package lives under `packages/plugins/<plugin-id>/` and must expose:

- `.` -> client plugin entrypoint, usually `./src/index.tsx`
- `./server` -> server plugin entrypoint, usually `./src/server.ts`
- `./manifest` -> shared manifest/template metadata, usually `./src/manifest.ts`

Current package policy is enforced by `scripts/sync-plugins.mjs` and architecture tests.

## Naming Rules

- Package name: `@plank/plugin-<plugin-id>`
- Manifest id: `<plugin-id>`
- Shared manifest export: `<camelPluginId>Manifest` or `<camelPluginId>PluginManifest`
- Client plugin export: `<camelPluginId>Plugin`
- Server plugin export: `<camelPluginId>ServerPlugin`
- Server module: `serverModule: "./server"`
- Package version may remain `0.0.0`; manifest version should be semver-like, normally `1.0.0`.

## Implementation Workflow

1. Pick a plugin id, feature scope, and whether it needs client, server, or both.
2. Create/update `package.json`, `tsconfig.json`, `src/manifest.ts`, `src/index.tsx`, and `src/server.ts`.
3. Put all shared manifest/template/card-type metadata in `src/manifest.ts`; do not duplicate manifest literals in client/server files.
4. Use `defineClientPlugin(...)` for browser/UI registrations.
5. Use `defineServerPlugin(...)` for board type templates, card type manifests, and card-change handlers.
6. Use mediated services only; do not reach into app glue, raw Convex context, or private runtime internals.
7. Register UI through named `registerUiExtension(...)` slots, not legacy card slots.
8. Add package tests proving client/server/manifest metadata agree and registrations are deterministic.
9. Run registry sync and validation commands.

For exact file shapes, read [plugin-package-template.md](references/plugin-package-template.md).

## Supported Client Registrations

- `registerView(...)`
- `registerPropertyType(...)`
- `registerCommand(...)`
- `registerUiExtension(...)`
- `registerFeature(...)`

Current UI slots:

- `shell.sidebar.navigation`
- `board.header.actions`
- `card.header`
- `card.metadata.primary`
- `card.body.tools`
- `card.sidebar.panels`
- `card.footer.activity`
- `settings.workspace.panels`

## Supported Server Registrations

- `registerBoardTypeTemplate(...)`
- `registerCardTypeManifest(...)`
- `registerCardChange(...)`
- `registerFeature(...)`

Server handlers receive mediated `extra.api` services. They must not import app UI or Convex route internals.

## Runtime Permissions

Declare only known runtime permissions in `manifest.capabilities`:

- `cards:read`
- `cards:write`
- `boardViews:read`

These are runtime permission gates, not domain card/view capabilities.

## Required Validation

After plugin changes, run the relevant subset:

```bash
pnpm node scripts/sync-plugins.mjs
pnpm --filter @plank/plugin-runtime test
pnpm --filter @plank/plugin-sdk test
pnpm --filter @plank/plugin-<plugin-id> test
pnpm typecheck
```

If Convex behavior changed, also run:

```bash
pnpm exec vitest run --config vitest.root.config.ts convex/functions.test.ts
```

If web UI changed, add/run focused web tests.

## Convex Artifact Cleanup

When a local plugin experiment is removed from `packages/plugins/*`, Convex may
still contain rows created while the plugin was installed or tested. Do not clean
those rows by deleting broad tables manually.

Use the owner-only maintenance functions instead:

```bash
pnpm exec convex run maintenance:previewPluginArtifactCleanup '{"workspaceSlug":"<workspace-slug>"}' --identity '{"tokenIdentifier":"<owner-token-identifier>","subject":"<owner-subject>"}'
pnpm exec convex run maintenance:cleanupPluginArtifacts '{"workspaceSlug":"<workspace-slug>"}' --identity '{"tokenIdentifier":"<owner-token-identifier>","subject":"<owner-subject>"}'
```

The preview is required before cleanup. The cleanup targets orphan plugin IDs not
present in the current builtin server plugin registry and removes only plugin
artifacts: workspace extension rows, plugin diagnostics, safe board views, safe
card type registry rows, behavior packs/bindings, and automation runs. It
preserves user content, including boards, cards, tags, comments, members, invites,
and notifications.

If the preview reports blocked rows, treat them as a migration decision. A blocked
`boardViews` row still has scoped cards; a blocked `cardTypeRegistry` row still
has cards using its `typeKey`. Migrate/delete the referencing content first, then
rerun cleanup.

Important caveat: older dev databases may have `core.todo` registered under
`pluginId: "core-cards"`. `core.todo` is the normal default card type, so do not
delete those cards as plugin trash. Repair or migrate the registry owner instead.

## Guardrails

- Do not add marketplace, remote install, sandbox, billing, package signing, or public review flows.
- Do not reintroduce `definePlugin`, `registerCardSlot`, combined registries, or `card.drawer.panels`.
- Do not change public Convex function names unless explicitly requested.
- Keep required builtins `core-kanban` and `calendar-board` explicit and trusted.
