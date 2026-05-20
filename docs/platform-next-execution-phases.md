# Platform Next Execution Phases

Last updated: 2026-05-20

## Purpose

This document captures platform/plugin work that can be fully implemented within the current trusted-local and builtin plugin architecture.

It is intentionally not a full implementation plan. Each phase below is shaped so it can later be expanded into a concrete task plan with files, migrations, compatibility constraints, and tests.

## Current Baseline

The platform now has:

- shared vocabulary for plugin packages, workspace extensions, and feature instances
- decomposed internal Convex loaders
- typed board view config envelopes with legacy read compatibility
- mediated client and server platform services
- split client/server plugin registries
- collaboration feature boundaries
- governed UI extension slots
- board view feature-instance identity
- trust metadata, runtime permission gates, diagnostics, and failure isolation

## Phase Overview

1. Phase 10: Compatibility cleanup and runtime consolidation
2. Phase 11: Typed persisted state expansion
3. Phase 12: Persistent diagnostics and audit trail
4. Phase 13: Platform shell and board route slimming
5. Phase 14: Card surface slot expansion
6. Phase 15: Plugin packaging and version policy
7. Phase 16: Admin-facing extension management

## Phase 10: Compatibility Cleanup And Runtime Consolidation

### Goal

Remove temporary compatibility paths now that the split plugin runtime, platform services, UI fills, and feature-instance model exist.

### Can Be Fully Implemented Now

- migrate remaining builtin plugin code away from legacy combined runtime assumptions
- reduce direct use of compatibility exports such as combined registries where client/server-specific registries are available
- migrate remaining builtin UI surfaces from legacy card slots to `registerUiExtension(...)` where appropriate
- keep only intentionally supported compatibility APIs in `packages/plugin-sdk`
- add tests that prevent Convex/server code from importing client entrypoints

### Does Not Include

- removing public compatibility APIs before downstream callers have a migration window
- changing Convex public function names
- schema narrowing migrations

### Proof Point

The app and Convex runtime use client/server-specific registries by default, and compatibility paths are isolated, documented, and test-covered.

## Phase 11: Typed Persisted State Expansion

### Goal

Extend the typed, versioned persisted state pattern beyond `boardViews.config`.

### Can Be Fully Implemented Now

- type `workspaceExtensions.config` with a versioned envelope
- type `boards.boardSettings` with a versioned envelope
- type `boardTypes.viewDefaults` with a versioned envelope
- add read normalizers that tolerate legacy unversioned rows
- add mutation-boundary validators for known builtin config surfaces
- document ownership for each persisted state surface

### Does Not Include

- removing legacy read compatibility immediately
- a remote plugin config schema marketplace
- arbitrary third-party config migrations

### Proof Point

At least two additional persisted config/state surfaces use typed versioned envelopes for new writes while legacy rows continue to read correctly.

## Phase 12: Persistent Diagnostics And Audit Trail

### Goal

Move runtime diagnostics from in-memory/test-only surfaces into durable platform-owned audit records where useful.

### Can Be Fully Implemented Now

- add Convex tables for plugin runtime diagnostics or audit events
- persist denied permissions, skipped handlers, invalid manifests, failed handlers, and admin-visible extension actions
- expose manager-only queries for recent plugin diagnostics
- render diagnostics in workspace extension settings
- add retention or pruning policy if needed

### Does Not Include

- marketplace abuse review workflows
- billing/security compliance audit guarantees
- external SIEM integrations

### Proof Point

Admins can see recent plugin permission denials and handler failures for their workspace without inspecting logs.

## Phase 13: Platform Shell And Board Route Slimming

### Goal

Reduce the board route and shell from product-brain components into composition layers over feature-owned modules.

### Can Be Fully Implemented Now

- extract command palette assembly into a feature/runtime helper
- extract extension management panels out of board route utility state
- move board activity panel ownership behind collaboration or activity feature modules
- move search state and rendering into a board search feature module
- keep `WorkspaceShell` responsible for layout placement, not feature behavior

### Does Not Include

- route/search-param redesign
- broad visual redesign
- splitting public Convex page queries into many client queries by default

### Proof Point

`boards.$boardId.tsx` becomes primarily routing, composition, and local view state, while feature behavior lives in dedicated modules.

## Phase 14: Card Surface Slot Expansion

### Goal

Evolve the card drawer from one extension panel seam into a governed card surface with named zones.

### Can Be Fully Implemented Now

- add card surface slots such as `card.header`, `card.metadata.primary`, `card.body.tools`, `card.sidebar.panels`, and `card.footer.activity`
- adapt existing `card.drawer.panels` fills into the richer surface model where useful
- move collaboration, relation, metadata, and plugin panel placement through named card slots
- document ordering, empty states, permission filtering, and visual ownership rules

### Does Not Include

- total card drawer redesign
- arbitrary plugin control of core destructive actions
- untrusted iframe/plugin UI rendering

### Proof Point

At least two existing card drawer areas render through named card surface slots without changing user-facing behavior.

## Phase 15: Plugin Packaging And Version Policy

### Goal

Make local/builtin plugin packages stricter and easier to evolve before any external ecosystem is considered.

### Can Be Fully Implemented Now

- define required package exports for client, server, and manifest modules
- validate manifest versions, trust metadata, permissions, hooks, and server module declarations
- add compatibility policy docs for SDK/runtime version changes
- fail generated registry builds on invalid package structure
- add changelog or migration note conventions for plugin package authors

### Does Not Include

- signed package distribution
- remote install or update channels
- public submission/review process

### Proof Point

Invalid local plugin package structure fails fast in tests or generation scripts before runtime.

## Phase 16: Admin-Facing Extension Management

### Goal

Turn extension settings into a richer local governance surface for workspace admins.

### Can Be Fully Implemented Now

- show trust level, permissions, registered features, UI fills, and server handlers
- show recent diagnostics if Phase 12 is complete
- expose typed config forms for surfaces completed in Phase 11
- explain why disabled, denied, or unavailable features are hidden
- add manager-only controls for local extension enablement and config

### Does Not Include

- marketplace browsing
- purchase/install flows
- external plugin reviews or ratings

### Proof Point

Workspace managers can inspect what a local/builtin extension can do, how it is configured, and whether it has recently failed.

## Recommended Next Step

Start with Phase 10 or Phase 11.

Phase 10 is best if the goal is to reduce temporary compatibility debt after the previous roadmap.

Phase 11 is best if the goal is to make future feature and plugin state safer before adding more surfaces.

Phase 12 is a strong follow-up once permission enforcement and handler isolation are stable enough that admins need visibility into denials and failures.
