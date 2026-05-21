# Platform And Future Marketplace Roadmap

Last updated: 2026-05-21

## Purpose

This document is the durable reference for the platform/plugin work completed so far and the future marketplace/sandbox work that should not be treated as implemented yet.

The project now has a hardened trusted-local plugin architecture. It can prepare for marketplace work, but a real marketplace still requires product, security, infrastructure, and operational decisions first.

## Current Implemented Baseline

### Vocabulary

- **Plugin Package**: code and manifests that exist in the app build under `packages/plugins/*`.
- **Workspace Extension**: workspace-scoped install, enablement, and config state for a plugin package, stored in `workspaceExtensions`.
- **Feature Instance**: a concrete mounted or persisted use of a feature. `boardViews.featureInstance` is the first persisted proof point for view instances.
- **Domain capabilities**: semantic card/view capabilities from the domain model, not install units and not runtime permission strings.

### Ownership Boundaries

- **Core platform** owns auth, tenancy, routing, layout primitives, persistence contracts, and mediated platform APIs.
- **Builtin features** own shipped product behavior such as collaboration, views, automations, notifications, comments, presence, activity, and feature-owned UI modules.
- **Plugin runtime** owns plugin package discovery, deterministic registry generation, registration, enablement filtering, trusted local execution, package policy validation, and client/server runtime seams.

### Trusted-Local Plugin Runtime

The current plugin model supports builtin and trusted-local plugin packages compiled with the app. It has:

- split client/server plugin contracts via `defineClientPlugin(...)` and `defineServerPlugin(...)`
- generated builtin client and server registries
- package policy validation before registry generation
- deterministic builtin ordering and required builtin ids
- shared manifest modules exposed through `./manifest`
- package exports for `.`, `./server`, and `./manifest`
- valid semver-like manifest versions, trust metadata, runtime permissions, hooks, and server module declarations
- architecture tests that prevent server builtin registries from importing client UI entrypoints

Current builtin/local plugins:

- `core-kanban`: required builtin default board view, property editors, commands, and status UI fill
- `calendar-board`: required builtin calendar view and board template
- `focus-tools`: workspace-toggleable focus view, confidence property, command, UI fill, board template, and card-change hook
- `task-board`: workspace-toggleable task board view, task card manifest, task board template, priority property, and task command

### Trust And Permissions

Plugin manifests declare:

- `trustLevel`: `builtin`, `trusted-local`, or reserved `restricted`
- runtime permissions: `cards:read`, `cards:write`, and `boardViews:read`
- `serverModule: "./server"` for packages with server entrypoints

Mediated client and server platform services enforce runtime permissions. Denied access and failed handlers produce structured diagnostics.

The `restricted` trust level is metadata only. It is not a real security boundary until sandboxing or equivalent isolation exists.

### Platform Services

Client plugins integrate through mediated `PlatformClientServices`:

- navigation
- cards
- properties
- views
- toast

Server plugins integrate through mediated `PlatformServerServices`:

- gated `cards.get(cardId)` as the current server proof point

Legacy direct plugin glue has been removed. Existing trusted plugins use the service boundary and split runtime contracts.

### UI Extension Surfaces

Trusted client plugins can register governed UI fills through `registerUiExtension(...)`.

Current slots:

- `shell.sidebar.navigation`
- `board.header.actions`
- `card.header`
- `card.metadata.primary`
- `card.body.tools`
- `card.sidebar.panels`
- `card.footer.activity`
- `settings.workspace.panels`

Fills are sorted by `order`, plugin order, then fill id. Fills may declare `requiredPermissions`, which are checked against manifest runtime permissions. UI slots are composition anchors only; they are not domain capabilities and not persisted feature instances.

### Feature Boundaries

The board route and shell have been slimmed toward composition:

- command assembly lives behind a board/plugin helper
- board search is a board feature component
- board activity/presence rendering is collaboration-owned
- board extension utility rendering is extension-owned
- `WorkspaceShell` owns layout/navigation placement rather than feature-specific behavior
- `CardDrawer` renders named card surface zones instead of one generic plugin panel seam

Collaboration is a shipped builtin feature boundary:

- comments, mentions, notifications, cleanup, presence/activity projections, and notification UI are feature-owned
- public Convex APIs remain stable
- route/search behavior such as `focus=comments` and `commentId` remains stable

### Persistence And Feature Instances

Persisted config/state now uses typed versioned envelopes for new writes while preserving legacy reads:

- `boardViews.config`
- `workspaceExtensions.config`
- `boards.boardSettings`
- `boardTypes.viewDefaults`

`boardViews` rows also carry additive `featureInstance` identity for new view instances while legacy fields remain readable. Public Convex query/mutation names and route contracts remain unchanged.

### Diagnostics And Admin Governance

Runtime diagnostics are persisted in Convex and surfaced to workspace managers. Admins can inspect:

- trust level
- package version
- declared permissions and hooks
- registered views, property types, commands, UI fills, templates, card type manifests, and handlers
- normalized workspace extension config
- recent permission/handler/admin diagnostics
- why disabled extensions do not contribute runtime features

Enable/disable controls still use existing workspace extension state. There is no marketplace install/uninstall UI.

## Current Hard Boundary

The app still does not support:

- remote plugin installation
- sandboxed untrusted plugin execution
- signed update channels
- public plugin submission or review
- marketplace billing or licensing

## Phase Overview

1. Phase M1: Marketplace preparation only
2. Phase M2: Marketplace and sandbox decision gate
3. Phase M3: Remote catalog and package distribution
4. Phase M4: Sandboxed client execution
5. Phase M5: Sandboxed or external server execution
6. Phase M6: Marketplace operations and governance

## Phase M1: Marketplace Preparation Only

### Goal

Prepare the codebase for a possible marketplace without shipping one or overstating the trust boundary.

### Can Be Partially Implemented Now

- reserve manifest metadata for publisher, homepage, support URL, license, categories, and compatibility ranges
- define a local catalog file format for bundled plugins
- document required review metadata for future external plugins
- keep `restricted` trust metadata conservative and visibly not sandboxed
- add package validation that would be useful for a future catalog

### Cannot Be Fully Implemented Yet

- remote plugin installation
- secure untrusted execution
- signed update channels
- public plugin review workflow

### Proof Point

The project has a documented marketplace-readiness checklist and local package metadata validation, but no runtime path claims to execute untrusted code safely.

## Phase M2: Marketplace And Sandbox Decision Gate

### Goal

Pause before implementation and make explicit product/security decisions required for a real marketplace.

### Blocked Until Decisions Are Made

- distribution model: bundled catalog, private workspace catalog, curated marketplace, or open marketplace
- client isolation model: same bundle, iframe, worker, or remote UI
- server execution model: no server code, hosted functions, isolated workers, or external webhooks
- signing and update model
- review, abuse, and support model
- billing/licensing model if commercial plugins exist
- data access and permission granularity beyond current coarse gates

### Does Not Include

- implementing sandboxing before the security model is chosen
- exposing install UI before update and rollback behavior exists

### Proof Point

A written marketplace architecture decision exists before any remote install or untrusted execution work begins.

## Phase M3: Remote Catalog And Package Distribution

### Goal

Define how plugin packages are discovered, verified, installed, updated, and removed.

### Blocked Until Decisions Are Made

- catalog hosting model
- package signing and verification
- workspace-level install and rollback behavior
- version compatibility guarantees
- review and approval workflow

### Future Includes

- remote catalog API
- signed plugin package metadata
- install/update/remove flows
- compatibility checks before install
- rollback strategy for failed plugin updates

### Proof Point

Workspace admins can install a reviewed plugin package from a trusted catalog, and the system can verify compatibility and rollback safely.

## Phase M4: Sandboxed Client Execution

### Goal

Execute untrusted or less-trusted plugin UI code without giving it direct access to the app runtime.

### Blocked Until Decisions Are Made

- iframe vs worker vs remote UI strategy
- RPC bridge design
- allowed UI APIs and event model
- performance and accessibility requirements
- asset loading and CSP rules

### Future Includes

- isolated client runtime
- mediated RPC bridge for platform services
- explicit permission prompts or admin review
- UI failure isolation
- resource and timeout controls

### Proof Point

A restricted plugin UI can render through a sandbox and interact only through mediated APIs.

## Phase M5: Sandboxed Or External Server Execution

### Goal

Allow third-party server-side plugin behavior without exposing raw Convex context or trusted app internals.

### Blocked Until Decisions Are Made

- whether external plugins can run server code at all
- hosted isolated worker model vs external webhook model
- execution budget and retry policy
- secret management
- tenancy and data access controls

### Future Includes

- isolated server execution environment or webhook contract
- signed event delivery
- scoped data access through platform APIs
- timeout, retry, and circuit-breaker policy
- persistent audit trail for all server plugin actions

### Proof Point

A restricted server plugin can respond to events through an isolated mechanism without blocking core product behavior or accessing raw database context.

## Phase M6: Marketplace Operations And Governance

### Goal

Support the non-code systems required for a healthy plugin marketplace.

### Blocked Until Decisions Are Made

- review standards
- abuse handling
- support ownership
- billing and revenue sharing
- marketplace visibility and ranking
- organizational policy controls

### Future Includes

- publisher accounts
- plugin review workflow
- admin install policies
- abuse reports and takedowns
- billing or licensing integration if needed
- marketplace analytics and health signals

### Proof Point

The marketplace can operate safely as a product surface, not only as a technical install mechanism.

## Recommended Next Step

Do not start M3-M6 until Phase M2 is complete.

Before then, only do M1-style preparation that improves local/builtin plugin quality without claiming remote or untrusted plugin safety.

## Documentation Retention Note

This file is intended to survive cleanup of earlier platform planning docs. It now includes the implemented trusted-local baseline plus future marketplace gates. If the repository deletes old execution-phase docs, keep this file as the single source of truth for:

- current plugin/platform vocabulary
- implemented trusted-local plugin architecture
- package policy and admin governance
- explicit marketplace and sandbox non-goals
- future marketplace decision phases
