# Platform Later Marketplace Phases

Last updated: 2026-05-20

## Purpose

This document captures future marketplace and sandbox work that should not be treated as fully implementable inside the current trusted-local plugin architecture.

The project can prepare for this work, but a real marketplace requires product, security, infrastructure, and operational decisions first.

## Current Boundary

The current plugin model supports builtin and trusted-local plugin packages compiled with the app. It does not support:

- remote plugin installation
- sandboxed untrusted plugin execution
- signed update channels
- public plugin submission or review
- marketplace billing or licensing

The `restricted` trust level is reserved metadata. It is not a real security boundary until sandboxing or equivalent isolation exists.

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
