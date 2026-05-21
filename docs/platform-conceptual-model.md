# Platform conceptual model

Last reviewed: 2026-05-20

## Purpose

This note defines the vocabulary used by the platform and plugin refactor plans. It is intentionally conceptual: it does not rename existing tables, fields, package exports, or plugin contracts.

## Core terms

**Plugin Package**:
Code and manifests that exist in the app build. A plugin package can register views, card types, property types, commands, card slots, board type templates, and event hooks through the current trusted local plugin runtime.
_Current examples_: packages under `packages/plugins/*`.
_Avoid_: using this term for a workspace's installed or enabled state.

Client plugin packages may also register UI extension fills for named platform slots. These fills are runtime UI composition points, not persisted feature instances by themselves.

**Workspace Extension**:
A workspace-scoped installation and enablement record for a plugin package. Workspace extensions answer whether a workspace can use a plugin package and may hold workspace-level configuration for that package.
_Current implementation_: `workspaceExtensions`.
_Avoid_: using "plugin" alone when referring to the workspace-scoped enabled or disabled record.

Code should normalize these records as `WorkspaceExtensionState`: `pluginPackageId`, `status`, optional config, and install/update timestamps. The row is not the plugin package manifest and should not be treated as a runtime feature instance.

**Feature Instance**:
A concrete mounted or persisted use of a feature inside a workspace or board. A feature instance may be created by core code, a builtin feature, or a plugin package.
_Current examples_: `boardViews` rows, future settings panels, future workflow tools, or other mounted feature surfaces.
_Avoid_: "Capability Instance"; `capabilities` already has a semantic domain meaning for card/view behavior.

`boardViews.featureInstance` is the first persisted proof point. New board view writes store a versioned feature-instance identity with `kind: "view"`, the owning `pluginPackageId`, the registered view `featureId`, the concrete `instanceId`, and the `instanceMode`. Legacy board view identity fields remain during rollout and readers normalize old rows into the same in-memory shape.

## Boundary targets

**Core platform** owns auth, tenancy, routing, layout primitives, persistence contracts, and mediated platform APIs. It should stay small and avoid owning product-specific behavior when that behavior can live behind a stable seam.

**Builtin features** own shipped product behavior such as collaboration, views, automations, notifications, comments, presence, and activity. Builtin features are trusted and can ship with Plank, but they should depend on platform contracts instead of ambient app-shell assumptions over time.

**Plugin runtime** owns plugin package discovery, deterministic registry generation, registration, enablement filtering, trusted local execution, and future client/server split seams. It should not become the place where product feature ownership is hidden.

## Trust and runtime permissions

Plugin package manifests declare a trust level and runtime permissions. Missing trust metadata defaults to `trusted-local` for compatibility.

- `builtin`: shipped product code that is part of Plank's trusted bundle.
- `trusted-local`: locally bundled plugin package code that is trusted by the deployment but not part of the required core builtin set.
- `restricted`: reserved metadata for future marketplace or sandboxed execution. Restricted remote execution is not implemented in this phase.

Runtime permissions currently use the coarse strings `cards:read`, `cards:write`, and `boardViews:read`. Access to sensitive client and server operations should flow through mediated platform services so permission denials can be enforced consistently and reported as structured diagnostics.

Local plugin packages must pass package policy validation before generated registries are updated. The current policy requires explicit client, server, and manifest exports, semver-like manifest versions, valid trust and permission metadata, and shared manifest usage across client/server entrypoints. This is trusted-local hardening, not marketplace security or sandboxing.

Workspace managers can inspect extension trust level, permissions, registered features, normalized config, enablement state, and recent diagnostics in workspace settings. Disabled non-required extensions do not contribute views, commands, UI fills, templates, or handlers until re-enabled.

## Reserved language

Domain `capabilities` keep their current meaning: semantic card/view capabilities such as deadline, priority, completion, assignee, body, title, subtasks, status, and progress. They describe what a card type provides and what a view can use.

Runtime permission gates may still use capability-style strings such as `cards:write`, but docs should call those "runtime permissions" or "capability gates" when needed to avoid confusing them with semantic card/view capabilities.

UI extension fill placement uses runtime permission gates such as `cards:read` when a fill declares `requiredPermissions`. Slot names such as `card.sidebar.panels` and `card.body.tools` describe platform UI anchors only; they do not create new domain capabilities.

## Migration rule

Later phases may introduce new schema or SDK names, but those migrations should use this conceptual model as their source of truth. Phase 1 itself is documentation-only and must not require production-facing schema, SDK, runtime, or UI changes.

## Persisted config ownership

`boardViews.config` is feature-instance state. Its owner is the view definition's plugin package or builtin feature, not the board core itself.

Writers should persist board view config as a versioned envelope:

- `schemaVersion`: the config contract version
- `viewId`: the view definition that owns the config
- `value`: the view-owned config payload

Readers should unwrap versioned envelopes before passing config to existing UI and plugin render props. During rollout, readers must also tolerate legacy unversioned config rows. A later cleanup migration can backfill legacy rows and narrow read compatibility once all persisted rows use envelopes.

Known next targets for the same policy are `workspaceExtensions.config`, `boards.boardSettings`, and `boardTypes.viewDefaults`.

`workspaceExtensions.config` is workspace extension state owned by the plugin package for workspace-level enablement/configuration. New writes should use a versioned envelope keyed by `pluginPackageId`; readers should unwrap legacy scalar-record config during rollout.

`boards.boardSettings` is core board persistence state. New board writes should use a versioned board settings envelope even when the value is currently empty, so future board-level feature settings have a stable migration path.

`boardTypes.viewDefaults` is board type/template state. New board type writes should persist a versioned envelope that mirrors the default view ids and any future view default config, while existing `defaultViewIds` remains the compatibility field used by current loaders.

## Feature-oriented authoring

Plugin packages use `defineClientPlugin` for browser/UI behavior and `defineServerPlugin` for backend-safe behavior. Code may use feature helpers such as `defineViewFeature`, `defineCardTypeFeature`, `defineUiExtensionFeature`, and `defineBoardTypeTemplateFeature`, then register them with `registerFeature`.

These helpers make plugin package contents introspectable as features while preserving the existing arrays consumed by the runtime (`views`, `commands`, `uiExtensions`, `cardTypeManifests`, and related collections).
