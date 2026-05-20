# Plugin Platform Improvements Overview

Last updated: 2026-05-20

## Purpose

This document consolidates architecture feedback from two sources:

- external feedback on Plank's plugin platform
- internal codebase audit aligned to current implementation

The goal is to create a practical overview grounded in the current codebase so each improvement can later be converted into a concrete execution plan.

This document uses the conceptual vocabulary from `docs/platform-conceptual-model.md`: plugin package, workspace extension, and feature instance. Domain `capabilities` keep their existing card/view semantic meaning; runtime permission checks are described as capability gates when needed.

## Current Baseline (What Is Already Strong)

Plank already has a strong plugin-first foundation:

- clean conceptual separation:
  - Card Type = schema contract
  - Card = data instance
  - Board Type = workflow semantics
  - View/Plugin = presentation and interactions
- split plugin authoring APIs through `defineClientPlugin` and `defineServerPlugin`
- folder-driven plugin discovery and deterministic registry generation via `scripts/sync-plugins.mjs`
- event lineage model with workflow events (`eventId`, `rootEventId`, `parentEventId`, `origin`, `depth`)
- recursive event propagation implemented in `convex/lib/plugins.ts` through `emitCardEvent(...)` and runtime-emitted child events
- architecture boundary tests that protect package layering

## Summary Evaluation of External Feedback

All six suggested improvements are valid in principle and technically implementable.

Priority and framing should be adjusted as follows:

1. split client/server plugin bundles: high priority
2. server hook execution context: high priority, but use a restricted API instead of raw Convex context
3. generalized slot/fill extension points: medium-high priority
4. typed plugin-owned config schemas: high priority and high ROI
5. runtime capability gates through mediated APIs: medium-high priority
6. sandboxing untrusted plugins: valid but phase-late unless remote/untrusted plugins are imminent

## Detailed Improvements

## 1) Split Plugin Runtime by Concern (Client vs Server)

Status: `Recommended`  
Priority: `P0`

### Why

Current plugin package registration mixes UI and server concerns in one plugin object, and the coupling already reaches runtime paths today. Convex server event dispatch goes through the builtin plugin registry, while the registry imports full plugin entrypoints that also contain React/UI registrations.

### Target

Introduce separate plugin entry contracts:

- `manifest` metadata (portable, lightweight)
- `client` module (views, editors, slots, commands UI)
- `server` module (event handlers, server-only behavior hooks)

### Suggested Shape

- `defineClientPlugin(...)`
- `defineServerPlugin(...)`
- shared plugin package manifest schema consumed by both

### Benefits

- removes current server-to-client runtime coupling
- hard boundary between React/browser code and Convex runtime code
- safer evolution toward third-party plugin ecosystem
- cleaner build and dependency graph

### Risks / Tradeoffs

- plugin authoring API migration required
- temporary dual support layer likely needed

### Feasibility

High. Can be rolled out incrementally with compatibility adapters, but should be framed as fixing an existing architectural seam rather than only future-proofing.

---

## 2) Add Restricted Server Hook Context (Do Not Expose Raw `ctx`)

Status: `Recommended`  
Priority: `P0`

### Why

Today plugin event dispatch uses `extra: {}`. Server hooks are therefore constrained and cannot perform useful backend operations unless core code is modified.

Passing raw Convex `MutationCtx` directly to plugin code is too permissive.

### Target

Expose a controlled server-side plugin API instead of direct `ctx`:

- read/write wrappers scoped to workspace and permissions
- explicit methods for allowed side effects
- optional scheduler access through guarded helpers
- typed audit/trace helpers

### Suggested Shape

`dispatchCardEvent(..., extra: { api: pluginServerApi })`

Where `pluginServerApi` is a capability-gated wrapper.

### Benefits

- enables meaningful server hooks
- preserves tenancy and auth invariants
- allows capability gates at runtime

### Risks / Tradeoffs

- requires careful API surface design
- wrapper maintenance overhead

### Feasibility

High. Natural extension of current event runtime.

---

## 3) Expand Extension Surfaces with Slot/Fill Architecture

Status: `Recommended`  
Priority: `P1`

### Why

Current extension points are strong but concentrated around board views, command-palette actions, property types, and card drawer slot surfaces. Broader product extensibility will need more formal UI anchor points.

### Target

Introduce named extensibility slots in app shell and feature areas. The first trusted-local slot set is:

- `shell.sidebar.navigation`
- `board.header.actions`
- `card.drawer.panels`
- `settings.workspace.panels`

Allow plugins to register fills against stable slot contracts. Fills are ordered deterministically by `order`, plugin package order, then fill id. Runtime permission filters use manifest permission strings such as `cards:read`; these are not domain card/view `capabilities`.

### Benefits

- predictable extension model for plugin authors
- reduced need for core app edits when adding plugin UX
- supports richer integrations (GitHub, chat, external workflows)

### Risks / Tradeoffs

- UI consistency can degrade without ordering and guardrails
- requires governance rules (priority, placement, permissions)

### Feasibility

Medium-high. Best introduced incrementally with a small strategic slot set first.

---

## 4) Introduce Typed Plugin-Owned Config Schemas and Versioned State

Status: `Recommended`  
Priority: `P0`

### Why

`workspaceExtensions.config` is currently untyped (`v.any()`), which blocks safe validation, migration, and typed plugin configuration UX.

That issue is broader than extension enablement state alone. Other plugin-adjacent persisted config surfaces are also untyped today, including view instance config and board/view defaults.

### Target

Allow plugin manifests and plugin-owned surfaces to declare configuration schema and version:

- schema definition (Convex validator shape and/or platform schema DSL)
- defaults
- config version
- migration handlers for version upgrades

Cover at least:

- extension config (`workspaceExtensions.config`)
- view instance config (`boardViews.config`)
- board/view plugin defaults where applicable

### Benefits

- safer plugin settings
- typed config access in runtime
- easier admin UX and automated settings forms

### Risks / Tradeoffs

- requires schema standardization across plugins
- migration semantics need policy (strict vs best-effort)

### Feasibility

High. Can start with manifest-declared schema + validation on enable/update, then extend to view-level persisted config.

---

## 5) Enforce Runtime Permission Gates (Not Just Metadata)

Status: `Recommended`  
Priority: `P1`

### Why

Capabilities are currently declared in plugin metadata and domain models, but enforcement appears mostly informational.

In the current architecture, the main value is not checking arbitrary plugin code after the fact. The leverage point is controlling the APIs and helpers the platform injects into plugins on both client and server.

### Target

Use runtime permission checks and mediated APIs for sensitive operations:

- server hook operations
- automation-triggered writes
- injected client command helpers
- cross-resource access attempts

### Benefits

- principle of least privilege
- safer plugin ecosystem
- stronger auditability and future marketplace readiness

### Risks / Tradeoffs

- runtime permission matrix design complexity
- developer ergonomics if too rigid

### Feasibility

Medium-high. Strongly complementary to Improvement #2, especially if capability gates are implemented through permission-scoped server wrappers and permission-scoped client helper injection.

---

## 6) Sandboxing for Untrusted/Remote Plugins

Status: `Valid but Phase-Late`  
Priority: `P2` (or `P1` only if remote plugin install is imminent)

### Why

Sandboxing becomes essential once untrusted third-party plugins are installable by workspace admins.

### Target

- client isolation (iframe/worker + RPC bridge)
- server isolation (VM/runtime constraints, execution budgets)
- strict tenancy guards in mediated data API

### Benefits

- meaningful security boundary for plugin code
- resilience against plugin crashes and abuse

### Risks / Tradeoffs

- significant engineering and operational cost
- performance and DX tradeoffs
- likely requires dedicated platform phase

### Feasibility

Technically feasible, strategically expensive. Sequence after plugin contract hardening.

## Suggested Phasing

## Phase 1: Foundation Hardening

- split client/server plugin contracts (with compatibility layer)
- add typed plugin-owned config schema + validation + version fields
- introduce restricted server plugin API wrapper
- update docs to reflect current event cascade behavior

## Phase 2: Platform Controls

- runtime capability gates
- expanded slot/fill extension points (initial set)
- plugin diagnostics and health metadata in workspace settings

## Phase 3: Ecosystem Readiness

- signed/distributed plugin catalog model
- trust tiers (builtin, trusted, untrusted)
- sandbox model for untrusted plugin execution

## Open Design Decisions to Resolve Before Planning

1. plugin contract format: TypeScript-only, manifest JSON, or hybrid
2. schema format for plugin-owned config: Convex validators, platform DSL, or both
3. runtime permission model granularity: coarse (`cards:write`) vs fine (`cards:update:status`)
4. migration policy: strict-blocking vs warn-and-continue
5. trust model timeline: local-only, curated catalog, or open marketplace

## Deliverables to Create Next (Planning Inputs)

For each improvement, produce:

- problem statement and success criteria
- API/schema proposal
- migration strategy
- test plan
- rollout plan (feature flags, compatibility window, deprecation date)

## Source References

- `packages/plugin-sdk/src/index.ts`
- `packages/plugin-runtime/src/index.ts`
- `packages/plugin-runtime/src/client.ts`
- `packages/plugin-runtime/src/server.ts`
- `packages/plugin-runtime/src/architecture-boundaries.test.ts`
- `scripts/sync-plugins.mjs`
- `convex/lib/plugins.ts`
- `convex/schema.ts`
- `docs/architecture.md`
- `docs/plugins.md`
