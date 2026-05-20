# Platform Refactor Opportunities

Last updated: 2026-05-20

## Purpose

This document identifies refactor opportunities beyond the existing plugin-platform improvements plan.

The goal is to move Plank closer to a minimal collaboration platform with:

- a small, stable core
- optional builtin features
- plugin-owned feature growth
- fewer product assumptions baked into the shell, queries, and persisted model

This document is intentionally architecture-first. It is meant to help decide where to reduce coupling before turning ideas into implementation plans.

Shared vocabulary for plugin packages, workspace extensions, feature instances, and boundary ownership lives in `docs/platform-conceptual-model.md`. Domain `capabilities` keep their current card/view semantic meaning; this document uses "builtin features" for shipped product modules.

## Design Goal

The target product shape is:

- core platform: auth, tenancy, routing, layout primitives, platform APIs, persistence contracts
- builtin features: collaboration, views, automations, notifications, comments, presence, activity
- plugins: optional extensions that compose through stable contracts rather than app-specific seams

The core should feel more like a base system that teams can shape, and less like a fixed board app with extension points.

## Current Strengths

The current codebase already has several strong foundations:

- clean domain separation between card type, card, board type, and view/plugin
- deterministic builtin plugin registry
- normalized workflow event model with lineage
- behavior runtime built on top of canonical card events
- architecture boundary tests protecting package layering

These are the right ingredients for a plugin-first system. The main remaining issue is that several important product surfaces are still owned by the app shell and page queries instead of the platform.

## Summary Recommendation

The next phase should focus less on the plugin registry itself and more on reducing non-plugin coupling in the rest of the app.

Highest-value opportunities:

1. extract a true platform shell from board/workspace product UI
2. break monolithic page queries into composable internal feature loaders
3. turn collaboration features into optional builtin features
4. convert the card drawer into a slot-based card surface
5. separate plugin package, workspace extension, and feature instance in the data model
6. replace broad untyped config/state surfaces with typed, versioned platform-owned contracts
7. introduce mediated platform services for plugins on client and server

## Detailed Opportunities

## 1) Extract a True Platform Shell

Status: `Recommended`  
Priority: `P0`

### Why

The current board route still acts as the product brain.

It owns:

- board data loading
- overview loading
- search
- presence
- activity feed loading
- command palette assembly
- extension toggling
- active plugin composition
- card-open and board navigation state

See:

- `apps/web/src/routes/w.$workspaceSlug/boards.$boardId.tsx`
- `apps/web/src/components/workspace-shell.tsx`

This makes the platform harder to extend because new features naturally get added to the main shell rather than plugged into it.

### Target

Reduce the core shell to a small set of responsibilities:

- auth and session
- workspace context
- routing
- layout slots
- feature registration
- platform services

Everything else should mount through stable feature surfaces.

### Suggested Shape

- `PlatformShell`
- `WorkspaceShellFeatureSlot`
- `BoardSurfaceFeatureSlot`
- `CommandSurface`
- `PlatformNavigationApi`

### Benefits

- clearer minimal core
- easier to add or remove collaboration features
- less pressure on a single route component to understand the entire app
- cleaner path to alternative workspace experiences beyond the current board-centric product

### Risks / Tradeoffs

- some current UI logic will need to be broken apart before the benefit is visible
- shell extraction can feel slower than feature work if done without clear boundaries

## 2) Split Page Queries into Composable Internal Feature Loaders

Status: `Recommended`  
Priority: `P0`

### Why

`getBoardPage` and `getOverview` are broad page-shaped queries.

They mix together:

- core board/workspace data
- plugin enablement resolution
- view filtering and selection
- seen-state and unread derivation
- extension state
- members and invites
- UI-oriented denormalization

See:

- `convex/boards.ts`
- `convex/workspaces.ts`

This creates a fixed app contract. Every feature wants to join the same payload rather than own a feature-specific API.

### Target

The first move should be internal decomposition, not necessarily immediate client-query fragmentation.

Start by breaking large page-shaped loaders into smaller internal feature-owned loaders while preserving the current public query shape where that still helps with subscription behavior, caching, and board-page ergonomics.

Only after those seams are clean should the public query surface itself be reconsidered.

### Target

Refactor large page payload builders into composable internal feature loaders such as:

- core workspace resource
- core board resource
- views feature resource
- collaboration feature resource
- automation feature resource
- extension management feature resource

### Suggested Shape

- `getWorkspaceCore`
- `getBoardCore`
- `getBoardViewsFeature`
- `getBoardCollaborationFeature`
- `getWorkspaceExtensionsFeature`

Or the equivalent internal loaders even if the public query surface remains aggregated.

### Benefits

- better separation of concerns without forcing premature query fragmentation
- smaller, more reusable contracts
- easier feature isolation
- easier plugin and builtin feature ownership

### Risks / Tradeoffs

- query count, reactivity, and data loading strategy need to be managed carefully
- some view models may temporarily duplicate derivation logic during migration

## 3) Treat Collaboration Features as Builtin Features, Not Permanent Core

Status: `Recommended`  
Priority: `P0`

### Why

Comments, mentions, notifications, presence, and activity are currently woven into core product flows.

Examples:

- comments directly create mention notifications
- workspace shell directly owns notifications UI
- board route directly owns presence and activity side panels

See:

- `convex/comments.ts`
- `convex/notifications.ts`
- `apps/web/src/components/workspace-shell.tsx`
- `apps/web/src/routes/w.$workspaceSlug/boards.$boardId.tsx`

These are useful features, but they are not the minimal core itself.

This extraction must include backend service ownership and event boundaries, not only UI ownership.

For example, comments currently trigger mention-notification side effects directly in mutation flows. Moving panels and menus behind slots would improve composition, but it would not by itself decouple the collaboration feature unless the write-path and side-effect boundaries are also separated.

### Target

Reframe collaboration features as builtin features that ship with the platform but depend on platform contracts across both frontend and backend layers.

Candidate builtin features:

- comments
- mentions
- notifications
- presence
- activity

### Benefits

- the platform core becomes smaller and more general
- easier to evolve or replace collaboration surfaces independently
- makes the product more honest about what is core infrastructure versus shipped opinionated behavior

### Risks / Tradeoffs

- some users may still expect these features to feel “always there”
- feature extraction adds indirection if the boundaries are too fine-grained
- backend side effects need explicit ownership or the coupling will simply move instead of shrinking

## 4) Refactor the Card Drawer into a Slot-Based Card Surface

Status: `Recommended`  
Priority: `P1`

### Why

The card drawer already accepts plugin property types and plugin slots, but the drawer itself still owns many concrete product semantics:

- metadata popovers
- due date presentation
- relation UX
- comments panel placement
- body editing orchestration
- slash menu behavior

See:

- `apps/web/src/components/card-drawer.tsx`

This limits how far plugins can really reshape the card experience.

### Target

Turn the drawer into a composable card surface with stable zones:

- header
- metadata rail
- body surface
- related items
- collaboration panel
- extension panels

### Suggested Shape

- `card.header`
- `card.metadata.primary`
- `card.body.tools`
- `card.sidebar.panels`
- `card.footer.activity`

### Benefits

- stronger plugin and builtin feature composition
- easier to evolve card UX without centralizing every interaction in one component
- supports different card experiences for different product modes

### Risks / Tradeoffs

- card UX can become inconsistent without conventions
- slot contracts need ordering, fallback, and empty-state rules

## 5) Separate Plugin Package, Workspace Extension, and Feature Instance

Status: `Recommended`  
Priority: `P1`

### Why

Today the data model mostly distinguishes between:

- plugin package metadata in code
- workspace extension enablement in `workspaceExtensions`
- view instances in `boardViews`

But the conceptual model is still blurred.

Examples:

- enabling an extension also seeds card manifests and board views
- extension state and plugin-owned config share the same row
- view instances act as both a plugin artifact and a board-level persisted object

### Target

Use clearer concepts:

- `Plugin Package`: what code and manifests exist
- `Workspace Extension`: installation and workspace-level enablement/config
- `Feature Instance`: a concrete mounted or persisted instance such as a view, settings panel, or workflow tool

Current Phase 8 proof point: `boardViews.featureInstance` stores a versioned view feature-instance identity for new rows while legacy board-view fields remain for compatibility. `workspaceExtensions` should be read as enablement state, not plugin package metadata.

### Benefits

- cleaner lifecycle model
- easier upgrades and migrations
- better support for multiple instances of the same feature
- better future fit for marketplace and remote install models

### Risks / Tradeoffs

- may require multiple migrations
- naming and ownership boundaries must be carefully documented

## 6) Create Typed, Versioned State Contracts Across Platform Surfaces

Status: `Recommended`  
Priority: `P0`

### Why

Untyped persistence is still a major source of coupling and risk.

Current examples include:

- `workspaceExtensions.config`
- `boardTypes.viewDefaults`
- `boards.boardSettings`
- `boardViews.config`

See:

- `convex/schema.ts`

This is bigger than plugin config alone. It affects the platform’s ability to safely persist feature state.

### Target

Introduce typed and versioned state contracts for:

- workspace extension config
- board-level feature settings
- board view instance config
- board type defaults
- plugin-owned persisted state where applicable

### Benefits

- safer migrations
- better settings UX
- stronger runtime guarantees
- fewer ambiguous `Record<string, unknown>` seams

### Risks / Tradeoffs

- schema design can get heavy if over-generalized
- migration policy needs to be defined early

## 7) Introduce a Platform Service Layer for Plugins

Status: `Recommended`  
Priority: `P1`

### Why

The plugin document already identifies the server-side need for a restricted API.

That should be extended into a broader platform service model on both client and server.

Current limitations:

- server event handlers are dispatched with `extra: {}`
- client command context is useful but narrow and ad hoc

See:

- `packages/plugin-runtime/src/index.ts`
- `convex/lib/plugins.ts`
- `packages/plugin-sdk/src/index.ts`

### Target

Provide explicit mediated services that plugins consume instead of reaching through app-specific seams.

Candidate service areas:

- navigation
- card writes
- settings
- search
- notifications
- scheduling
- audit/logging
- runtime permission checks

### Benefits

- cleaner contracts
- stronger runtime permission enforcement
- easier testing
- better future support for third-party plugins

### Risks / Tradeoffs

- service design can sprawl if the core keeps absorbing feature-specific helpers
- ergonomics matter or plugin authors will bypass the intended layer

## 8) Rebalance the Plugin SDK Around Features, Not Just UI Surfaces

Status: `Recommended`  
Priority: `P1`

### Why

The current split plugin APIs still register several feature concerns:

- views
- property editors
- commands
- card slots
- card-change handlers
- board type templates
- card type manifests

See:

- `packages/plugin-sdk/src/index.ts`

This reinforces the idea that a plugin is one big registration blob rather than a package composed of features.

### Target

Move toward a feature-oriented registration model.

Examples:

- `definePluginManifest(...)`
- `defineViewFeature(...)`
- `defineCardSchemaFeature(...)`
- `defineAutomationFeature(...)`
- `defineCollaborationFeature(...)`

This complements the existing client/server split work rather than replacing it.

### Benefits

- better separation inside plugin packages
- easier partial adoption of plugin features
- cleaner runtime loading story

### Risks / Tradeoffs

- migration cost for builtin plugins
- plugin authoring may feel more complex before better tooling exists

## Priority Order

Recommended implementation order:

1. extract platform shell boundaries
2. split page queries into feature-shaped loaders
3. type and version persisted config/state surfaces
4. move collaboration features behind builtin feature boundaries
5. introduce platform service APIs for plugins
6. refactor the card drawer into slot-based card composition
7. separate plugin package, extension install, and feature instance models
8. evolve the plugin SDK toward feature registration

## How This Relates to the Existing Plugin Plan

This document does not replace `docs/plugin-platform-improvements-overview.md`.

Instead:

- that document focuses on plugin runtime architecture
- this document focuses on broader platform architecture around the runtime

Together they suggest a combined direction:

- smaller core
- stronger boundaries
- typed persisted state
- feature-oriented composition
- plugins and builtin features using the same platform seams

## Final Recommendation

If only one guiding principle is carried into the next phase, it should be this:

The core should provide stable platform contracts, and almost everything user-facing should become a feature layered on top.

That is the shift that will make Plank feel like a minimal collaboration base that can grow into many shapes instead of a fixed board product with extension hooks.
