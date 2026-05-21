# Plugin Package Template

Use this as the default shape for a new trusted-local Plank plugin.

## package.json

```json
{
  "name": "@plank/plugin-example-tools",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.tsx",
    "./manifest": "./src/manifest.ts",
    "./server": "./src/server.ts"
  },
  "scripts": {
    "lint": "echo \"No lint step for @plank/plugin-example-tools\"",
    "test": "vitest run --passWithNoTests",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "format": "prettier --check src",
    "check": "prettier --check src"
  },
  "dependencies": {
    "@plank/domain": "workspace:*",
    "@plank/plugin-sdk": "workspace:*",
    "react": "^19.2.0"
  }
}
```

Add `@plank/ui`, `@plank/board-views`, `lucide-react`, or DnD packages only when the plugin actually uses them.

## tsconfig.json

```json
{
  "extends": "../../../tsconfig.base.json",
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
```

## src/manifest.ts

```ts
import type { PluginManifest } from "@plank/domain";
import type { PlankBoardTypeTemplate } from "@plank/plugin-sdk";

export const exampleToolsManifest: PluginManifest = {
  id: "example-tools",
  name: "Example Tools",
  version: "1.0.0",
  hooks: [
    "registerView",
    "registerCommand",
    "registerUiExtension",
    "registerBoardTypeTemplate",
  ],
  capabilities: ["cards:read", "cards:write", "boardViews:read"],
  trustLevel: "trusted-local",
  description: "Example trusted-local plugin.",
  serverModule: "./server",
};

export const exampleBoardTemplate: PlankBoardTypeTemplate = {
  id: "example-tools:default",
  name: "Example Board",
  description: "A starter board provided by Example Tools.",
  defaultLifecycleStatuses: [
    { key: "todo", label: "To Do", category: "todo", orderKey: "a0" },
    { key: "doing", label: "Doing", category: "active", orderKey: "a1" },
    { key: "done", label: "Done", category: "done", orderKey: "a2" }
  ],
  defaultViewIds: ["example-tools:view"],
  version: 1,
};

export const exampleToolsClientSummaries = {
  views: [
    {
      id: "example-tools:view",
      label: "Example",
      description: "Example plugin view.",
      seedMode: "enabled" as const
    }
  ],
  commands: [
    {
      id: "example-tools:create-card",
      label: "Create example card",
      keywords: ["example", "create", "card"]
    }
  ],
  uiExtensions: [
    {
      id: "example-tools:card-panel",
      slot: "card.sidebar.panels" as const,
      label: "Example"
    }
  ]
};
```

## src/index.tsx

```tsx
import { defineClientPlugin } from "@plank/plugin-sdk";
import { exampleToolsManifest } from "./manifest";

function ExampleView() {
  return <div>Example view</div>;
}

export const exampleToolsPlugin = defineClientPlugin(
  exampleToolsManifest,
  ({ registerCommand, registerUiExtension, registerView }) => {
    registerView({
      id: "example-tools:view",
      label: "Example",
      description: "Example plugin view.",
      seedMode: "enabled",
      render: () => <ExampleView />,
    });

    registerCommand({
      id: "example-tools:create-card",
      label: "Create example card",
      keywords: ["example", "create", "card"],
      run: async ({ services }) => {
        await services.cards.create("Example card");
        services.toast.show("Example card created.");
      },
    });

    registerUiExtension({
      id: "example-tools:card-panel",
      slot: "card.sidebar.panels",
      label: "Example",
      requiredPermissions: ["cards:read"],
      render: ({ card }) => <div>{card?.title ?? "No card selected"}</div>,
    });
  },
);

export * from "./manifest";
```

## src/server.ts

```ts
import { defineServerPlugin } from "@plank/plugin-sdk";
import {
  exampleBoardTemplate,
  exampleToolsClientSummaries,
  exampleToolsManifest,
} from "./manifest";

export const exampleToolsServerPlugin = defineServerPlugin(
  exampleToolsManifest,
  ({ registerBoardTypeTemplate }) => {
    registerBoardTypeTemplate(exampleBoardTemplate);
  },
  {
    clientSummaries: exampleToolsClientSummaries,
  },
);
```

## src/index.test.tsx

```ts
import { describe, expect, it } from "vitest";
import { exampleToolsPlugin } from "./index";
import { exampleToolsManifest } from "./manifest";
import { exampleToolsServerPlugin } from "./server";

describe("example tools plugin", () => {
  it("shares manifest metadata across client and server entries", () => {
    expect(exampleToolsPlugin.manifest).toEqual(exampleToolsManifest);
    expect(exampleToolsServerPlugin.manifest).toEqual(exampleToolsManifest);
    expect(exampleToolsManifest.serverModule).toBe("./server");
  });
});
```
