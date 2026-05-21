# Documentation

Last reviewed: 2026-05-21

## Current docs set

This repository intentionally keeps a minimal docs surface under `docs/`.

- [`architecture.md`](architecture.md) - current system architecture and runtime model
- [`plugins.md`](plugins.md) - plugin trust model, builtin plugins, and extension surfaces
- [`platform-conceptual-model.md`](platform-conceptual-model.md) - shared vocabulary for plugin packages, workspace extensions, feature instances, and platform boundaries
- [`platform-later-marketplace-phases.md`](platform-later-marketplace-phases.md) - durable platform baseline plus future marketplace and sandbox-gated work

## Additional references outside docs/

- [`../README.md`](../README.md) - repository overview and local setup
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) - contribution workflow and quality checks

## Maintenance rule

Keep `docs/` focused on stable reference material for implemented behavior. Avoid keeping superseded plans or one-off research notes in this folder. If old execution-phase docs are removed, keep `platform-later-marketplace-phases.md` as the durable record of the implemented trusted-local platform baseline and future marketplace gates.
