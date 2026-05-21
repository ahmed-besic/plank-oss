<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

## Plank plugin authoring

When asked to create, modify, or review a Plank plugin, use the local
`.agents/skills/plank-plugin-author` skill. It documents this repo's trusted-local
plugin architecture, package policy, split client/server entrypoints, manifests,
UI extension slots, runtime permissions, and validation commands.

Important plugin guardrails:

- Plugins live under `packages/plugins/<plugin-id>/`.
- Each plugin package exposes `.`, `./server`, and `./manifest`.
- Use `defineClientPlugin(...)` and `defineServerPlugin(...)`; do not reintroduce
  legacy combined plugin APIs.
- Use `registerUiExtension(...)` named slots; do not use legacy card slots.
- Run `pnpm node scripts/sync-plugins.mjs` after adding or renaming plugin
  packages.
