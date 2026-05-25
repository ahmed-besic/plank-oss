# Self-Owned Installation Plan

This plan is for making Plank easy to install, customize, test locally, and deploy as a self-owned internal platform. Plank should not become a centrally hosted SaaS in this model. Each team owns its own code, Convex backend, deployment account, data, and trusted-local plugins.

## Product Goal

The target user experience should eventually be:

```bash
npx plank init my-plank
cd my-plank
npx plank dev
npx plank plugin create hiring-pipeline
npx plank deploy
```

The user should not need to understand the monorepo layout, Convex codegen, plugin registry generation, Vercel CLI details, or package manager behavior before they can use Plank.

Important caveat: this flow is not ready until the fresh-install bootstrap path is proven end to end. A brand-new install must create or link a Convex deployment, write the required Convex env vars, initialize auth, run codegen, and guide the first workspace flow before `dev` or `deploy` can feel reliable.

## Recommended Model

Use a self-owned deployment model:

- GitHub or local project folder stores the user's Plank source code.
- Convex Cloud hosts the user's backend and database.
- A static/SSR hosting provider hosts the user's frontend. Vercel is the first candidate, but it must be proven against the current TanStack Start SSR app before it becomes the official target.
- Plugins remain trusted local packages under `packages/plugins/<plugin-id>/`.
- The Plank CLI hides most setup, validation, and deployment commands.

This avoids the cost and security burden of running one shared hosted Plank service for everyone while still giving non-technical users a guided install experience.

## What `npx` Means

`npx` is a command runner that comes with npm. It can download and run a package command without the user manually installing that package first.

For example:

```bash
npx plank init my-plank
```

means:

1. npm looks for a package on npm named `plank`, `@plank/cli`, or whichever package owns the `plank` binary.
2. npm downloads that package temporarily if it is not already installed.
3. npm runs the `plank` executable from the package.

To make this work, Plank needs a published npm package with a `bin` entry:

```json
{
  "name": "@plank/cli",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "plank": "./dist/index.js"
  }
}
```

Then users can run:

```bash
npx @plank/cli init my-plank
```

If the npm package name `plank` is available, the nicer command could be:

```bash
npx plank init my-plank
```

If not, use a scoped package:

```bash
npx @plank/cli init my-plank
```

## Package Strategy

Add two packages later:

```text
packages/create-plank-app/
packages/plank-cli/
```

The simpler option is one package:

```text
packages/plank-cli/
```

with these commands:

```bash
npx @plank/cli init my-plank
npx @plank/cli dev
npx @plank/cli plugin create hiring-pipeline
npx @plank/cli plugin remove hiring-pipeline
npx @plank/cli check
npx @plank/cli deploy
```

The package should expose the command name `plank`, so after installation users can also run:

```bash
plank dev
plank deploy
```

## Command Plan

### `plank init`

Purpose: create a new user-owned Plank project from the template.

Example:

```bash
npx @plank/cli init my-plank
```

Responsibilities:

- download or clone the Plank template
- copy files into `my-plank`
- remove development-only metadata if needed
- install dependencies with `pnpm install`
- run the existing `pnpm sync:plugins` script
- hand off to `plank bootstrap` or clearly tell the user how to connect Convex
- print the next command

Expected output:

```text
Plank project created.

Next:
  cd my-plank
  npx @plank/cli dev
```

Implementation notes:

- The current repo is a pnpm monorepo. Keep that; do not rewrite to npm for the app itself.
- The CLI can require Node.js 20+ and install pnpm through Corepack if missing.
- The template should include `apps/web`, `convex`, `packages`, `scripts`, root config files, and docs needed for users.
- The template source must be decided before implementation: GitHub release tarball, Git clone, or npm-packed template. A release tarball is the simplest for non-technical users because it does not require Git to be installed.
- Updating an existing user project should be a separate future command. Do not make `init` responsible for upgrades or merging user plugin changes.

### `plank bootstrap`

Purpose: make a fresh project actually runnable by connecting the required backend/auth pieces.

Example:

```bash
npx @plank/cli bootstrap
```

Responsibilities:

- check whether the current folder is a Plank project
- check Convex CLI availability
- ask whether to create a new Convex project or link an existing one
- run the appropriate Convex command to create/link the deployment
- write the real root `.env.local` values:
  - `CONVEX_DEPLOYMENT`
  - `CONVEX_URL`
  - `CONVEX_SITE_URL`
- run Convex codegen through the existing root script
- initialize Convex Auth for the local web URL
- verify that `apps/web/src/lib/providers.tsx` will see `CONVEX_URL` or `VITE_CONVEX_URL`
- start or point the user to the first workspace creation flow

Current app requirements this command must satisfy:

- the web app fails without `CONVEX_URL`
- auth config expects `CONVEX_SITE_URL`
- brand-new installs need the Convex Auth setup step
- the first usable workspace is created through the app's initial workspace flow

This phase should be implemented before treating `plank dev` as beginner-safe.

### `plank setup`

Purpose: prepare an existing cloned Plank project.

Example:

```bash
npx @plank/cli setup
```

Responsibilities:

- check Node.js version
- check pnpm availability
- run `pnpm install` if dependencies are missing
- run the existing root scripts instead of duplicating their behavior
- check whether `.env.local` has usable Convex values
- call `plank bootstrap` when Convex is missing
- run Convex codegen through the existing root script if possible

This command is useful when users download the project from GitHub instead of using `plank init`.

### `plank dev`

Purpose: start Plank locally for testing and plugin development.

Example:

```bash
npx @plank/cli dev
```

Responsibilities:

- rely on the existing `predev` hook or explicitly call the existing `pnpm sync:plugins` script
- verify Convex env vars exist before starting
- start Convex dev
- start the Vite/TanStack web app
- print the local URL

Current manual equivalent:

```bash
npx convex dev
pnpm dev
```

The CLI should run both processes and keep logs readable. It should not reimplement the behavior of root `package.json` scripts; it should be a friendly wrapper around the existing project commands.

### `plank plugin create`

Purpose: scaffold a valid trusted-local plugin package.

Example:

```bash
npx @plank/cli plugin create hiring-pipeline
```

Responsibilities:

- create `packages/plugins/hiring-pipeline`
- generate `package.json`
- generate `tsconfig.json`
- generate `src/manifest.ts`
- generate `src/index.tsx`
- generate `src/server.ts`
- optionally generate starter UI/view/card files based on prompts
- generate `PLUGIN_TASK.md` with AI-agent instructions
- run the existing `pnpm sync:plugins` script

The generated package must follow current repo policy:

- package name: `@plank/plugin-hiring-pipeline`
- exports: `.`, `./server`, `./manifest`
- client entry uses `defineClientPlugin(...)`
- server entry uses `defineServerPlugin(...)`
- UI uses `registerUiExtension(...)` slots
- manifest uses `serverModule: "./server"`
- manifest has valid `hooks`, `capabilities`, `trustLevel`, and semver-like `version`

The generated package must pass the same rules enforced by:

```text
scripts/plugin-package-policy.mjs
scripts/sync-plugins.mjs
```

Prompt options:

```text
What should this plugin include?
- Board view
- Card type
- Property editor
- Command
- Card drawer panel
- Board header action
- Workspace settings panel
- Server card-change hook
- Board type template
```

The starter plugin should be intentionally small. Its job is to be structurally correct so an AI coding agent can extend it safely.

### `plank plugin remove`

Purpose: remove a trusted-local plugin package and guide workspace extension/artifact cleanup.

Example:

```bash
npx @plank/cli plugin remove hiring-pipeline
```

Responsibilities:

- verify the plugin is not a required builtin
- remove `packages/plugins/hiring-pipeline`
- run the existing `pnpm sync:plugins` script
- run checks that the app still compiles
- explain that Convex may still contain workspace extension state and plugin-created artifacts
- offer to preview artifact cleanup for a workspace

Required guardrail:

Do not delete Convex rows directly from the CLI. Use the existing maintenance functions.

### `plank plugin cleanup`

Purpose: clean orphaned workspace extension state and plugin artifacts after package removal.

Example:

```bash
npx @plank/cli plugin cleanup --workspace my-workspace
```

This is workspace-level cleanup, not package removal. It should call the existing Convex maintenance functions.

Current cleanup commands:

```bash
pnpm exec convex run maintenance:previewPluginArtifactCleanup '{"workspaceSlug":"<workspace-slug>"}' --identity '{"tokenIdentifier":"<owner-token-identifier>","subject":"<owner-subject>"}'
pnpm exec convex run maintenance:cleanupPluginArtifacts '{"workspaceSlug":"<workspace-slug>"}' --identity '{"tokenIdentifier":"<owner-token-identifier>","subject":"<owner-subject>"}'
```

It should:

- call the preview function first
- show counts by table
- warn about blocked rows
- ask for explicit confirmation before cleanup
- call the cleanup mutation only after confirmation

The cleanup must preserve user content. The existing cleanup function already targets orphan plugin artifacts only:

- `workspaceExtensions`
- `pluginDiagnostics`
- safe `boardViews`
- safe `cardTypeRegistry` rows
- `behaviorPacks`
- `behaviorBindings`
- `automationRuns`

If blocked rows exist, the CLI should explain the reason and stop:

- `boardViews` blocked by scoped cards
- `cardTypeRegistry` blocked by cards using that `typeKey`

### `plank check`

Purpose: tell the user whether the project is ready to deploy.

Example:

```bash
npx @plank/cli check
```

Responsibilities:

- run the existing `pnpm sync:plugins` script
- run the existing `pnpm typecheck` script
- run focused plugin/runtime tests
- run the existing `pnpm build` script

This should become the user's "is it ready?" command.

Current manual equivalent:

```bash
pnpm sync:plugins
pnpm typecheck
pnpm test
pnpm build
```

For speed, the first CLI version can run:

```bash
pnpm sync:plugins
pnpm typecheck
pnpm build
```

and leave full tests as:

```bash
npx @plank/cli check --full
```

### `plank deploy`

Purpose: deploy the user's own Plank instance.

Example:

```bash
npx @plank/cli deploy
```

Candidate first target:

- Convex Cloud for backend
- Vercel for frontend
- direct deploy from the user's local machine

This is an implementation spike until proven. The current frontend is a TanStack Start SSR app, so the official deploy target must be validated for:

- SSR hosting adapter behavior
- production and preview env var injection
- `CONVEX_URL`/`VITE_CONVEX_URL` availability during build and runtime
- `CONVEX_SITE_URL` and auth callback URLs
- Convex production deploy flow
- Vercel preview deployments versus production deployments

Responsibilities:

- check Vercel CLI login
- check Convex CLI login
- run `plank bootstrap` or verify bootstrap has already completed
- run `plank check`
- deploy Convex backend
- set required frontend env vars
- deploy frontend to Vercel
- print final app URL

Current manual pieces may be:

```bash
npx convex deploy
pnpm build
npx vercel deploy --prod
```

The exact deploy script needs a proof-of-deploy before becoming a command contract.

The CLI should support two deploy modes eventually:

```bash
npx @plank/cli deploy --local
npx @plank/cli deploy --github
```

Start with `--local` because it avoids teaching users Git.

Later, `--github` can create or update a GitHub repo and let Vercel auto-deploy from pushes.

## Landing Page Plan

The public website should make the ownership model clear.

Suggested headline:

```text
Deploy your own internal workspace.
```

Suggested copy:

```text
Plank is a free, self-owned alternative to tools like Notion, Linear, and Trello.
Start with a working team workspace, customize it with trusted-local plugins, and deploy it to your own accounts.
```

Primary actions:

```text
Try locally
Deploy your own
Create a plugin
```

The landing page should not imply that Plank hosts everyone on one shared service.

## Documentation Plan

Add beginner-focused docs:

```text
INSTALL.md
DEPLOY.md
PLUGIN_GUIDE.md
docs/cli.md
```

`INSTALL.md` should have:

```text
Option 1: Try Plank locally
Option 2: Deploy Plank online
Option 3: Customize Plank with plugins
Option 4: Remove a plugin
```

`DEPLOY.md` should explain:

- required accounts
- Convex Cloud
- Vercel
- env vars
- common failure messages

`PLUGIN_GUIDE.md` should explain:

- plugins are code, not marketplace downloads
- plugin code lives in `packages/plugins/<plugin-id>`
- use `plank plugin create`
- ask an AI agent to modify the generated plugin folder
- run `plank check`
- deploy with `plank deploy`

## Repo Changes Needed

Phase 1 should avoid a published npm package and focus on proving the missing bootstrap/deploy paths. Any local scripts should be thin wrappers around existing root scripts:

- add `scripts/create-plugin.mjs`
- add `scripts/remove-plugin.mjs`
- add `scripts/plugin-cleanup.mjs`
- add root package scripts:

```json
{
  "scripts": {
    "plugin:create": "node scripts/create-plugin.mjs",
    "plugin:remove": "node scripts/remove-plugin.mjs",
    "plugin:cleanup": "node scripts/plugin-cleanup.mjs",
    "ready": "pnpm sync:plugins && pnpm typecheck && pnpm build"
  }
}
```

Do not create parallel setup/dev orchestration unless the script only delegates to existing root commands and adds beginner-friendly checks.

Phase 2 should wrap proven scripts and flows in `packages/plank-cli`.

Phase 3 should publish the CLI to npm.

## npm Publishing Plan

To make `npx @plank/cli ...` work:

1. Create `packages/plank-cli`.
2. Add a package manifest with a `bin` field.
3. Build the CLI to `dist/index.js`.
4. Add tests for command parsing and project detection.
5. Create an npm organization or use an existing npm account.
6. Publish the package:

```bash
npm publish --access public
```

7. Users can then run:

```bash
npx @plank/cli init my-plank
```

The app repo can stay pnpm-based. npm is only used as the public distribution channel for the CLI command.

## Important Risks

- Vercel + Convex deploy automation may need careful env var handling.
- The official deploy target is not chosen until the TanStack Start SSR deployment spike passes.
- Direct local deploy is simpler than hidden GitHub automation, but users may lose history if they do not back up the folder.
- Plugin removal can remove code immediately, but data cleanup must stay conservative.
- Non-technical users will still need accounts. The docs and CLI must use plain language and detect missing login states.
- The current auth warning in `README.md` says auth is not production-hardened. Before promoting one-command production deployment, auth and security posture need review.

## Recommended Build Order

1. Prove the fresh-install bootstrap path manually: create/link Convex, write env vars, initialize auth, run codegen, start local app, create first workspace.
2. Prove one production deploy target with the current TanStack Start SSR app and Convex Auth callback URLs.
3. Add `INSTALL.md` and `DEPLOY.md` based on the proven paths.
4. Add thin local repo scripts only where root scripts do not already cover the behavior.
5. Add plugin package create/remove helpers that rely on `plugin-package-policy.mjs` and `sync-plugins.mjs`.
6. Add workspace extension/artifact cleanup helper around the existing Convex maintenance functions.
7. Implement `packages/plank-cli` as a wrapper around existing scripts and proven flows.
8. Publish `@plank/cli` to npm.
9. Add landing page copy and screenshots around the final flow.
10. Add optional GitHub-backed deployment after local deploy works.

## Success Criteria

A non-technical user should be able to:

```bash
npx @plank/cli init my-plank
cd my-plank
npx @plank/cli dev
```

Then, after making or requesting plugin changes:

```bash
npx @plank/cli plugin create my-workflow
npx @plank/cli check
npx @plank/cli deploy
```

The final output should be a live URL to their own Plank deployment.
