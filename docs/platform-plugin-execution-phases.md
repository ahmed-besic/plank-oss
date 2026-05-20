# Platform And Plugin Execution Phases

Last updated: 2026-05-20

## Purpose

This document turns the following two architecture notes into an execution order:

- `docs/plugin-platform-improvements-overview.md`
- `docs/platform-refactor-opportunities.md`

It is meant to answer one question:

In what order should the refactor happen so each step improves the architecture without forcing premature rewrites?

This is not a detailed implementation plan. It is a phased roadmap. Each phase is intentionally shaped so it can later be expanded into its own concrete task plan.

Shared vocabulary for plugin packages, workspace extensions, feature instances, and target ownership boundaries is defined in `docs/platform-conceptual-model.md`.

## Guiding Principles

The phases below follow these rules:

- reduce coupling before redesigning public APIs
- prefer internal decomposition before client-facing fragmentation
- keep the current product working while architecture improves underneath it
- move built-in features onto platform seams before asking third-party plugins to rely on them
- type and stabilize persisted contracts before expanding extensibility
- avoid naming or modeling changes that conflict with existing domain language

## Phase Overview

1. Phase 1: Stabilize vocabulary and architectural boundaries
2. Phase 2: Decompose internal loaders and runtime seams
3. Phase 3: Type persisted config and state contracts
4. Phase 4: Introduce platform service APIs
5. Phase 5: Separate client and server plugin runtime
6. Phase 6: Extract collaboration into builtin features
7. Phase 7: Expand UI extension surfaces
8. Phase 8: Evolve the plugin model and feature-instance model
9. Phase 9: Hardening and marketplace readiness

## Phase 1: Stabilize Vocabulary And Architectural Boundaries

### Goal

Make sure the architecture language is clean and the desired boundaries are explicit before deeper refactors begin.

### Why First

This phase is cheap compared to the others and prevents churn later.

It also reduces the chance of leaking unstable concepts into:

- schema names
- SDK names
- internal helpers
- docs and ADRs

### Main Outcomes

- consistent terminology across docs
- clear distinction between:
  - plugin package
  - workspace extension
  - feature instance
- explicit rule that current semantic domain “capabilities” keep their existing meaning
- written target boundaries for:
  - core platform
  - builtin features
  - plugin runtime

### Includes

- reconcile wording across the two architecture docs
- document the minimal core responsibilities
- document the responsibilities that should move into builtin features over time
- identify names that must not be reused in code migrations

### Does Not Include

- schema migrations
- SDK rewrites
- UI extraction work

### Exit Criteria

- vocabulary is stable enough to use in code and planning
- both architecture docs read as complementary, not overlapping
- future phases can refer to a shared conceptual model

### Phase Invariant

No production-facing schema or plugin contract changes are required in this phase.

### Proof Point

A short architecture note or ADR exists that defines the minimal conceptual model for:

- plugin package
- workspace extension
- feature instance

And that note is referenced by later phases when ownership or persistence decisions are made.

Current proof point: `docs/platform-conceptual-model.md`.

## Phase 2: Decompose Internal Loaders And Runtime Seams

### Goal

Break apart monolithic internal loading and orchestration logic without forcing an immediate change to the public client-query shape.

### Why Here

This creates the internal seams that nearly every later phase depends on.

It should happen before:

- platform service extraction
- collaboration extraction
- plugin runtime splitting

### Main Outcomes

- `getBoardPage` and `getOverview` become composition layers over smaller internal loaders
- plugin resolution, view resolution, unread derivation, and collaboration loading stop living in one broad page-shaped body of logic
- internal ownership becomes clearer even if the client still consumes aggregated queries

### Includes

- split board-page loading into internal modules by concern
- split workspace overview loading into internal modules by concern
- isolate plugin/view enablement and filtering logic
- isolate collaboration-oriented derivations from core board loading
- identify reusable server-side “feature loaders”

### Does Not Include

- immediate fan-out into many client queries
- broad UI rewrites
- plugin SDK changes

### Exit Criteria

- large page queries are internally decomposed
- derived data has clearer ownership boundaries
- later phases can plug into internal loaders instead of editing giant handlers

### Phase Invariant

The public client-query surface may remain aggregated even while internal loader ownership changes.

### Proof Point

At least one major page query is internally decomposed into smaller concern-owned loaders without requiring a broad client data-loading rewrite.

## Phase 3: Type Persisted Config And State Contracts

### Goal

Replace broad untyped state surfaces with typed, versioned contracts.

### Why Here

Typed state is a prerequisite for safe extensibility.

If plugin runtime work happens before persisted state is stabilized, the system will gain extension power faster than it gains migration safety.

This phase should use the minimal conceptual model established earlier, especially the distinction between:

- plugin package
- workspace extension
- feature instance

The goal is not to complete the full model refactor here, but to avoid typing persisted ownership around blurred concepts.

### Main Outcomes

- typed extension config
- typed board-view config
- typed board defaults and settings
- versioned migration story for plugin-owned and feature-owned state

### Includes

- confirm persisted ownership decisions against the minimal install/runtime/feature-instance model
- define ownership of persisted state surfaces
- replace `v.any()` config seams where practical
- introduce version fields where needed
- document migration policy for config/state upgrades
- prepare typed settings surfaces for builtin features and plugins

### Does Not Include

- full plugin runtime split
- remote marketplace support
- sandboxing

### Exit Criteria

- important persisted configuration surfaces are typed
- config ownership is explicit
- state migration expectations are documented

### Phase Invariant

Typed state work should reduce ambiguity, not expand the number of persisted concepts in circulation.

### Proof Point

At least one important persisted surface is migrated from broad untyped storage to a typed, versioned contract with migration coverage or documented upgrade handling.

## Phase 4: Introduce Platform Service APIs

### Goal

Create mediated platform APIs that builtin features and plugins can consume on both client and server.

### Why Here

This gives later phases a stable way to interact with the system without reaching through app-specific seams.

It also sets up runtime capability gates more naturally than ad hoc context passing.

It comes before runtime contract splitting because service boundaries should shape the split. Otherwise the project risks producing separate client/server plugin contracts that still depend on unstable or overly app-specific integration seams.

### Main Outcomes

- explicit client platform services
- explicit server platform services
- basic enforceable capability gates on mediated APIs for trusted builtin/local plugins
- builtin features and plugins begin to depend on platform APIs instead of direct shell/runtime assumptions

### Includes

- define service boundaries for:
  - navigation
  - card writes
  - search
  - settings
  - notifications
  - audit/logging
  - scheduling if needed
- define server-side restricted plugin API shape
- define client-side plugin service/context shape
- establish where runtime permission checks happen
- implement basic enforceable gates for sensitive mediated operations

### Does Not Include

- final marketplace permission model
- complete plugin API redesign

### Exit Criteria

- there is a clear mediated API for feature and plugin interactions
- raw app glue is no longer the primary integration method
- runtime capability gates have a natural insertion point

### Phase Invariant

Services should become the default integration seam before plugin power is expanded further.

### Proof Point

At least one sensitive operation is no longer reached through ad hoc app glue and instead goes through a mediated API with an enforceable gate.

## Phase 5: Separate Client And Server Plugin Runtime

### Goal

Split plugin runtime concerns so browser/UI registrations and server behavior registrations no longer travel as one object.

### Why Here

This phase depends on typed state and platform services.

Doing it earlier would risk replacing one coupled plugin object with two coupled plugin objects that still depend on unstable app seams.

### Main Outcomes

- client plugin contract
- server plugin contract
- shared manifest contract
- compatibility path for builtin plugins during migration

### Includes

- split plugin entry contracts by concern
- update registry generation and loading model
- move server hook registration onto restricted server APIs
- preserve or extend the basic enforceable capability gates introduced earlier
- preserve deterministic builtin discovery
- add compatibility adapters if needed

### Does Not Include

- remote plugin install
- sandboxed untrusted execution

### Exit Criteria

- server runtime does not depend on UI/plugin browser code
- plugin loading model is cleaner by execution environment
- builtin plugins can migrate incrementally

### Phase Invariant

Runtime separation must not reintroduce hidden coupling through duplicated service glue.

### Proof Point

At least one builtin plugin is migrated to the split client/server contract and runs through the mediated service boundary.

## Phase 6: Extract Collaboration Into Builtin Features

### Goal

Move collaboration concerns off the app core and onto explicit builtin feature boundaries across both UI and backend layers.

### Why Here

This phase becomes much easier once:

- internal loaders are decomposed
- platform services exist
- plugin/server runtime boundaries are clearer

### Main Outcomes

- comments, mentions, notifications, presence, and activity stop behaving like inseparable shell logic
- backend side effects gain clearer ownership
- collaboration can evolve more independently from the minimal core

### Includes

- extract collaboration feature boundaries in queries and mutations
- separate side-effect ownership for comments and mentions
- define collaboration event/service contracts
- introduce the minimal builtin-only shell/card slots required for collaboration extraction
- move collaboration UI surfaces onto those slots where appropriate
- reduce direct shell ownership of notifications and related surfaces

### Does Not Include

- removal of collaboration from the shipped product
- remote integrations unless needed by the extraction

### Exit Criteria

- collaboration features are builtin features, not ambient core assumptions
- backend coupling is reduced, not merely moved
- UI and write-path ownership both reflect the new boundaries

### Phase Invariant

Collaboration extraction must reduce backend coupling as well as UI coupling.

### Proof Point

At least one collaboration feature is extracted end-to-end, including:

- UI ownership
- service/event contract
- backend side-effect ownership

## Phase 7: Expand UI Extension Surfaces

### Goal

Broaden the stable UI slots and extension anchors across the shell and card experience.

### Why Here

Once platform services and feature boundaries exist, UI slots become much more meaningful and less risky.

This phase should not happen too early, or the UI slots will just reflect today’s coupled structure.

### Main Outcomes

- shell extension slots
- board header/action slots
- card drawer/card surface slots
- settings panel extension slots

### Includes

- slot/fill surfaces in shell and board pages
- slot/fill surfaces in the card surface
- ordering and guardrail rules
- capability-aware placement rules
- migration of existing plugin surfaces onto new slots where useful

### Does Not Include

- total redesign of every current screen
- broad visual refresh work unrelated to extensibility

### Exit Criteria

- plugins and builtin features can extend more of the UI without patching core components
- extension surfaces are named, documented, and governed

### Phase Invariant

General-purpose slots should extend proven seams, not formalize accidental structure from the current UI.

### Proof Point

A documented set of named extension surfaces exists, and at least one existing builtin or plugin surface has been migrated onto them.

## Phase 8: Evolve The Plugin Model And Feature-Instance Model

### Goal

Refine the conceptual and data model so plugin package, workspace extension, and feature instance are clearly separated.

### Why Here

This phase benefits from the earlier runtime, service, and state work.

At this point the system should be stable enough to improve the model without guessing at future seams.

The minimal conceptual clarification should already exist by this point. This phase is for deeper schema, SDK, and lifecycle refinement, not for inventing the core concepts for the first time.

### Main Outcomes

- cleaner distinction between install-time and runtime concepts
- feature-oriented plugin authoring model
- improved lifecycle handling for mounted/persisted feature instances

### Includes

- clarify data ownership around extension install records
- refine the model for persisted view-like feature instances
- evolve SDK contracts toward more composable registration
- revisit plugin package structure after the client/server split is proven

### Does Not Include

- untrusted remote plugin execution by default
- full external marketplace operations

### Exit Criteria

- model boundaries are reflected in both docs and code
- plugin authoring contracts are more modular
- install/config/mounted-instance concepts are no longer blurred

### Phase Invariant

This phase should refine and codify previously clarified concepts, not reopen the foundational vocabulary.

### Proof Point

At least one persisted runtime concept is cleanly represented using the clarified model, and at least one SDK or schema surface reflects the improved separation.

## Phase 9: Hardening And Marketplace Readiness

### Goal

Prepare the platform for a more open plugin ecosystem if and when that becomes a product goal.

### Why Last

This work is valuable, but it should come after the trusted local plugin architecture is clean.

Otherwise the project risks solving ecosystem-scale problems on top of unstable internals.

### Main Outcomes

- stronger runtime capability gates
- improved auditability
- better packaging and compatibility guarantees
- optional sandboxing path for less-trusted plugin code

### Includes

- stronger trust-tier-aware permission enforcement through mediated APIs
- plugin compatibility/versioning policy
- lifecycle and failure isolation strategy
- sandbox exploration if needed
- packaging and validation tooling

### Does Not Include

- assumption that a remote marketplace must ship immediately

### Exit Criteria

- the platform is ready for a broader plugin ecosystem if desired
- trust and runtime permission boundaries are enforceable, not just documented

### Phase Invariant

Late hardening should build on earlier enforcement, not replace the earlier model.

### Proof Point

There is a documented trust model with concrete enforcement behavior for at least two plugin trust levels or execution contexts.

## Dependency Notes

Important phase dependencies:

- Phase 2 should happen before any major public API or shell redesign
- Phase 3 should happen before deep extensibility expansion
- Phase 4 should happen before serious server-hook/plugin-power growth
- Phase 5 should happen before major third-party plugin ambitions
- Phase 6 should happen before calling the core “minimal”
- Phase 7 should happen after the main boundaries are real, not just planned
- Phase 8 should happen after the earlier seams have proved themselves in practice

## Suggested Usage

When using this roadmap for implementation planning:

1. pick one phase only
2. define the concrete scope for that phase
3. identify required migrations, tests, and compatibility constraints
4. avoid pulling later-phase concerns into the current phase unless strictly necessary

## Recommended Starting Point

If the goal is to make steady architectural progress without destabilizing the product, start with:

1. Phase 1
2. Phase 2
3. Phase 3

Those three phases provide the foundation that makes the rest of the roadmap much safer.
