import { describe, expect, it, vi } from "vitest";
import { defineClientPlugin, defineServerPlugin } from "@plank/plugin-sdk";
import {
  createClientPluginRegistry,
  createPluginSecurityContext,
  createPermissionedClientServices,
  createPermissionedServerServices,
  createServerPluginRegistry,
  dispatchCardEvent,
  getEnabledPluginIds,
  getEnabledPlugins,
  getEnabledUiExtensions,
  getPluginTrustLevel,
  validatePluginManifest,
} from "./index";

describe("plugin runtime", () => {
  it("resolves and validates plugin trust metadata", () => {
    const builtin = defineClientPlugin(
      {
        id: "builtin",
        name: "Builtin",
        version: "1.0.0",
        hooks: [],
        capabilities: ["cards:read"],
        trustLevel: "builtin",
      },
      () => {},
    );
    const defaultTrusted = defineClientPlugin(
      {
        id: "default",
        name: "Default",
        version: "1.0.0",
        hooks: [],
        capabilities: [],
      },
      () => {},
    );

    expect(getPluginTrustLevel(builtin)).toBe("builtin");
    expect(getPluginTrustLevel(defaultTrusted)).toBe("trusted-local");
    expect(createPluginSecurityContext(builtin)).toMatchObject({
      pluginId: "builtin",
      trustLevel: "builtin",
      permissions: ["cards:read"],
      diagnostics: [],
    });
    expect(
      validatePluginManifest({
        id: "bad",
        name: "Bad",
        version: "1.0.0",
        hooks: [],
        capabilities: ["cards:explode"],
        trustLevel: "outer-space",
      } as any).map((entry) => entry.kind),
    ).toEqual(["invalid-trust-level", "permission-denied"]);
  });

  it("creates separate client and server registries", () => {
    const clientPlugin = defineClientPlugin(
      {
        id: "split",
        name: "Split",
        version: "1.0.0",
        hooks: ["registerView"],
        capabilities: [],
      },
      ({ registerView }) => {
        registerView({
          id: "split:view",
          label: "Split view",
          render: () => null,
        });
      },
    );
    const serverPlugin = defineServerPlugin(
      clientPlugin.manifest,
      ({ registerBoardTypeTemplate }) => {
        registerBoardTypeTemplate({
          id: "split:template",
          name: "Split template",
          defaultLifecycleStatuses: [],
          defaultViewIds: ["split:view"],
          version: 1,
        });
      },
    );

    const clientRegistry = createClientPluginRegistry([clientPlugin]);
    const serverRegistry = createServerPluginRegistry([serverPlugin]);

    expect(clientRegistry.pluginMap.get("split")?.views[0]?.id).toBe(
      "split:view",
    );
    expect(serverRegistry.pluginMap.get("split")?.boardTypeTemplates[0]?.id).toBe(
      "split:template",
    );
    expect(
      clientRegistry.features.map((entry) => [
        entry.pluginId,
        entry.feature.kind,
        entry.feature.id,
      ]),
    ).toEqual([["split", "view", "split:view"]]);
    expect(
      serverRegistry.features.map((entry) => [
        entry.pluginId,
        entry.feature.kind,
        entry.feature.id,
      ]),
    ).toEqual([["split", "boardTypeTemplate", "split:template"]]);
  });

  it("rejects duplicate ids in split registries", () => {
    const createClient = (name: string) =>
      defineClientPlugin(
        {
          id: "duplicate",
          name,
          version: "1.0.0",
          hooks: [],
          capabilities: [],
        },
        () => {},
      );
    const createServer = (name: string) =>
      defineServerPlugin(
        {
          id: "duplicate",
          name,
          version: "1.0.0",
          hooks: [],
          capabilities: [],
        },
        () => {},
      );

    expect(() =>
      createClientPluginRegistry([createClient("First"), createClient("Second")]),
    ).toThrowError(/duplicate plugin id/i);
    expect(() =>
      createServerPluginRegistry([createServer("First"), createServer("Second")]),
    ).toThrowError(/duplicate plugin id/i);
  });

  it("rejects duplicate template ids in server registries", () => {
    const first = defineServerPlugin(
      {
        id: "first",
        name: "First",
        version: "1.0.0",
        hooks: ["registerBoardTypeTemplate"],
        capabilities: [],
      },
      ({ registerBoardTypeTemplate }) => {
        registerBoardTypeTemplate({
          id: "shared:template",
          name: "Shared",
          defaultLifecycleStatuses: [],
          defaultViewIds: ["core-kanban:board"],
          version: 1,
        });
      },
    );
    const duplicateTemplate = defineServerPlugin(
      {
        id: "duplicate-template",
        name: "Duplicate template",
        version: "1.0.0",
        hooks: ["registerBoardTypeTemplate"],
        capabilities: [],
      },
      ({ registerBoardTypeTemplate }) => {
        registerBoardTypeTemplate({
          id: "shared:template",
          name: "Shared again",
          defaultLifecycleStatuses: [],
          defaultViewIds: ["core-kanban:board"],
          version: 1,
        });
      },
    );

    expect(() =>
      createServerPluginRegistry([first, duplicateTemplate]),
    ).toThrowError(/duplicate board type template id/i);
  });

  it("rejects duplicate card type manifest keys in server registries", () => {
    const createPlugin = (id: string) =>
      defineServerPlugin(
        {
          id,
          name: id,
          version: "1.0.0",
          hooks: ["registerCardTypeManifest"],
          capabilities: [],
        },
        ({ registerCardTypeManifest }) => {
          registerCardTypeManifest({
            pluginId: id,
            typeKey: "shared:task",
            schemaVersion: 1,
            fields: { core: [] },
            bodyPolicy: { allowEmpty: true },
            metaPolicy: { titleRequired: true },
            automationExposedFields: [],
            queryIndexHints: [],
          });
        },
      );

    expect(() =>
      createServerPluginRegistry([createPlugin("first"), createPlugin("second")]),
    ).toThrowError(/duplicate card type manifest key/i);
  });

  it("filters dispatch to enabled server plugins", async () => {
    const calls: string[] = [];
    const plugin = defineServerPlugin<{ calls: string[] }>(
      {
        id: "focus-tools",
        name: "Focus tools",
        version: "1.0.0",
        hooks: ["registerCardChange"],
        capabilities: ["cards:read"],
      },
      ({ registerCardChange }) => {
        registerCardChange({
          id: "track-card-create",
          event: "card.created",
          handle: ({ extra, event }) => {
            extra.calls.push(event.name);
          },
        });
      },
    );

    await dispatchCardEvent({
      registry: createServerPluginRegistry([plugin]),
      enabledPluginIds: ["focus-tools"],
      event: {
        name: "card.created",
        eventId: "event_1",
        actorId: "user_1",
        boardId: "board_1",
        cardId: "card_1",
        workspaceId: "workspace_1",
        timestamp: Date.now(),
      },
      extra: { calls },
    });

    expect(calls).toEqual(["card.created"]);
  });

  it("supports wildcard handlers and preserves handler order", async () => {
    const calls: string[] = [];
    const first = defineServerPlugin<{ calls: string[] }>(
      {
        id: "first",
        name: "First",
        version: "1.0.0",
        hooks: ["registerCardChange"],
        capabilities: [],
      },
      ({ registerCardChange }) => {
        registerCardChange({
          id: "first:a",
          event: "*",
          handle: ({ extra }) => {
            extra.calls.push("first:a");
          },
        });
        registerCardChange({
          id: "first:b",
          event: "*",
          handle: ({ extra }) => {
            extra.calls.push("first:b");
          },
        });
      },
    );
    const second = defineServerPlugin<{ calls: string[] }>(
      {
        id: "second",
        name: "Second",
        version: "1.0.0",
        hooks: ["registerCardChange"],
        capabilities: [],
      },
      ({ registerCardChange }) => {
        registerCardChange({
          id: "second:a",
          event: "*",
          handle: ({ extra }) => {
            extra.calls.push("second:a");
          },
        });
      },
    );

    await dispatchCardEvent({
      registry: createServerPluginRegistry([first, second]),
      enabledPluginIds: ["first", "second"],
      event: {
        name: "card.updated",
        eventId: "event_2",
        actorId: "user_1",
        boardId: "board_1",
        cardId: "card_1",
        workspaceId: "workspace_1",
        timestamp: Date.now(),
      },
      extra: { calls },
    });

    expect(calls).toEqual(["first:a", "first:b", "second:a"]);
  });

  it("uses the fallback status when records omit a status", () => {
    expect(
      getEnabledPluginIds(
        [
          { pluginId: "focus-tools", status: undefined },
          { pluginId: "calendar-board", status: "disabled" },
        ],
        "enabled",
      ),
    ).toEqual(["focus-tools"]);

    expect(
      getEnabledPluginIds([{ pluginId: "focus-tools", status: undefined }], "disabled"),
    ).toEqual([]);
  });

  it("returns only enabled plugins from the registry", () => {
    const focus = defineClientPlugin(
      {
        id: "focus-tools",
        name: "Focus tools",
        version: "1.0.0",
        hooks: [],
        capabilities: [],
      },
      () => {},
    );
    const calendar = defineClientPlugin(
      {
        id: "calendar-board",
        name: "Calendar board",
        version: "1.0.0",
        hooks: [],
        capabilities: [],
      },
      () => {},
    );

    const registry = createClientPluginRegistry([focus, calendar]);
    expect(
      getEnabledPlugins(registry, [
        { pluginId: "focus-tools", status: "enabled" },
        { pluginId: "calendar-board", status: "disabled" },
      ]).map((plugin) => plugin.manifest.id),
    ).toEqual(["focus-tools"]);
  });

  it("collects enabled UI extensions with deterministic ordering", () => {
    const first = defineClientPlugin(
      {
        id: "first",
        name: "First",
        version: "1.0.0",
        hooks: [],
        capabilities: [],
      },
      ({ registerUiExtension }) => {
        registerUiExtension({
          id: "first:later",
          slot: "board.header.actions",
          label: "Later",
          order: 20,
          render: () => null,
        });
        registerUiExtension({
          id: "first:early",
          slot: "board.header.actions",
          label: "Early",
          order: -10,
          render: () => null,
        });
      },
    );
    const second = defineClientPlugin(
      {
        id: "second",
        name: "Second",
        version: "1.0.0",
        hooks: [],
        capabilities: [],
      },
      ({ registerUiExtension }) => {
        registerUiExtension({
          id: "second:middle",
          slot: "board.header.actions",
          label: "Middle",
          render: () => null,
        });
      },
    );

    expect(
      getEnabledUiExtensions({
        registry: createClientPluginRegistry([first, second]),
        enabledPluginIds: ["first", "second"],
        slot: "board.header.actions",
      }).map((entry) => [entry.extension.id, entry.source]),
    ).toEqual([
      ["first:early", "native"],
      ["second:middle", "native"],
      ["first:later", "native"],
    ]);
  });

  it("filters UI extensions by enabled plugin and required permissions", () => {
    const plugin = defineClientPlugin(
      {
        id: "permissions",
        name: "Permissions",
        version: "1.0.0",
        hooks: [],
        capabilities: ["cards:read"],
      },
      ({ registerUiExtension }) => {
        registerUiExtension({
          id: "permissions:allowed",
          slot: "shell.sidebar.navigation",
          label: "Allowed",
          requiredPermissions: ["cards:read"],
          render: () => null,
        });
        registerUiExtension({
          id: "permissions:denied",
          slot: "shell.sidebar.navigation",
          label: "Denied",
          requiredPermissions: ["cards:write"],
          render: () => null,
        });
      },
    );

    expect(
      getEnabledUiExtensions({
        registry: createClientPluginRegistry([plugin]),
        enabledPluginIds: ["permissions"],
        slot: "shell.sidebar.navigation",
      }).map((entry) => entry.extension.id),
    ).toEqual(["permissions:allowed"]);
    expect(
      getEnabledUiExtensions({
        registry: createClientPluginRegistry([plugin]),
        enabledPluginIds: [],
        slot: "shell.sidebar.navigation",
      }),
    ).toEqual([]);
  });

  it("does nothing when no server plugins are enabled", async () => {
    const handler = vi.fn(async () => {});
    const plugin = defineServerPlugin(
      {
        id: "focus-tools",
        name: "Focus tools",
        version: "1.0.0",
        hooks: ["registerCardChange"],
        capabilities: [],
      },
      ({ registerCardChange }) => {
        registerCardChange({
          id: "noop",
          event: "*",
          handle: handler,
        });
      },
    );

    const result = await dispatchCardEvent({
      registry: createServerPluginRegistry([plugin]),
      enabledPluginIds: [],
      event: {
        name: "card.created",
        eventId: "event_3",
        actorId: "user_1",
        boardId: "board_1",
        cardId: "card_1",
        workspaceId: "workspace_1",
        timestamp: Date.now(),
      },
      extra: {},
    });

    expect(handler).not.toHaveBeenCalled();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        kind: "handler-skipped",
        pluginId: "focus-tools",
      }),
    ]);
  });

  it("passes plugin-scoped extra to card event handlers", async () => {
    const calls: string[] = [];
    const plugin = defineServerPlugin<{ api: { pluginId: string } }>(
      {
        id: "reader",
        name: "Reader",
        version: "1.0.0",
        hooks: ["registerCardChange"],
        capabilities: ["cards:read"],
      },
      ({ registerCardChange }) => {
        registerCardChange({
          id: "use-api",
          event: "*",
          handle: ({ extra }) => {
            calls.push(extra.api.pluginId);
          },
        });
      },
    );

    await dispatchCardEvent({
      registry: createServerPluginRegistry([plugin]),
      enabledPluginIds: ["reader"],
      event: {
        name: "card.updated",
        eventId: "event_5",
        actorId: "user_1",
        boardId: "board_1",
        cardId: "card_1",
        workspaceId: "workspace_1",
        timestamp: Date.now(),
      },
      extra: { api: { pluginId: "fallback" } },
      getExtraForPlugin: (plugin) => ({ api: { pluginId: plugin.manifest.id } }),
    });

    expect(calls).toEqual(["reader"]);
  });

  it("isolates card event handler failures and continues later handlers", async () => {
    const calls: string[] = [];
    const failing = defineServerPlugin<{ calls: string[] }>(
      {
        id: "failing",
        name: "Failing",
        version: "1.0.0",
        hooks: ["registerCardChange"],
        capabilities: [],
      },
      ({ registerCardChange }) => {
        registerCardChange({
          id: "explode",
          event: "*",
          handle: () => {
            throw new Error("Plugin exploded");
          },
        });
      },
    );
    const healthy = defineServerPlugin<{ calls: string[] }>(
      {
        id: "healthy",
        name: "Healthy",
        version: "1.0.0",
        hooks: ["registerCardChange"],
        capabilities: [],
      },
      ({ registerCardChange }) => {
        registerCardChange({
          id: "record",
          event: "*",
          handle: ({ extra }) => {
            extra.calls.push("healthy");
          },
        });
      },
    );

    const result = await dispatchCardEvent({
      registry: createServerPluginRegistry([failing, healthy]),
      enabledPluginIds: ["failing", "healthy"],
      event: {
        name: "card.updated",
        eventId: "event_fail",
        actorId: "user_1",
        boardId: "board_1",
        cardId: "card_1",
        workspaceId: "workspace_1",
        timestamp: Date.now(),
      },
      extra: { calls },
    });

    expect(calls).toEqual(["healthy"]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        kind: "handler-failed",
        pluginId: "failing",
        handlerId: "explode",
        message: "Plugin exploded",
      }),
    ]);
  });

  it("supports fail-fast card event dispatch", async () => {
    const plugin = defineServerPlugin(
      {
        id: "failing",
        name: "Failing",
        version: "1.0.0",
        hooks: ["registerCardChange"],
        capabilities: [],
      },
      ({ registerCardChange }) => {
        registerCardChange({
          id: "explode",
          event: "*",
          handle: () => {
            throw new Error("Plugin exploded");
          },
        });
      },
    );

    await expect(
      dispatchCardEvent({
        registry: createServerPluginRegistry([plugin]),
        enabledPluginIds: ["failing"],
        event: {
          name: "card.updated",
          eventId: "event_fail_fast",
          actorId: "user_1",
          boardId: "board_1",
          cardId: "card_1",
          workspaceId: "workspace_1",
          timestamp: Date.now(),
        },
        failFast: true,
      }),
    ).rejects.toThrow("Plugin exploded");
  });

  it("denies client writes without matching runtime permissions", async () => {
    const plugin = defineClientPlugin(
      {
        id: "readonly",
        name: "Readonly",
        version: "1.0.0",
        hooks: [],
        capabilities: ["cards:read"],
      },
      () => {},
    );
    const create = vi.fn(async () => "card_1");
    const services = createPermissionedClientServices({
      plugin,
      services: {
        navigation: {
          openCard: vi.fn(),
          navigate: vi.fn(),
        },
        cards: {
          create,
          update: vi.fn(async () => undefined),
          move: vi.fn(async () => {}),
          open: vi.fn(),
        },
        properties: {
          add: vi.fn(async () => {}),
        },
        views: {
          updateConfig: vi.fn(async () => {}),
        },
        toast: {
          show: vi.fn(),
        },
      },
    });

    await expect(async () => services.cards.create("Card")).rejects.toThrow(
      /runtime permission cards:write/,
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("denies server card reads without cards:read", async () => {
    const plugin = defineServerPlugin(
      {
        id: "no-reader",
        name: "No reader",
        version: "1.0.0",
        hooks: [],
        capabilities: [],
      },
      () => {},
    );
    const services = createPermissionedServerServices({
      plugin,
      services: {
        cards: {
          get: async () => ({
            id: "card_1",
            workspaceId: "workspace_1",
            boardId: "board_1",
            typeKey: "core.todo",
            statusKey: "todo",
            title: "Card",
            properties: {},
            updatedAt: 1,
          }),
        },
      },
    });

    await expect(services.cards.get("card_1")).rejects.toThrow(
      /runtime permission cards:read/,
    );
  });

  it("allows server card reads with cards:read", async () => {
    const plugin = defineServerPlugin(
      {
        id: "reader",
        name: "Reader",
        version: "1.0.0",
        hooks: [],
        capabilities: ["cards:read"],
      },
      () => {},
    );
    const services = createPermissionedServerServices({
      plugin,
      services: {
        cards: {
          get: async (cardId) => ({
            id: cardId,
            workspaceId: "workspace_1",
            boardId: "board_1",
            typeKey: "core.todo",
            statusKey: "todo",
            title: "Card",
            properties: {},
            updatedAt: 1,
          }),
        },
      },
    });

    await expect(services.cards.get("card_1")).resolves.toMatchObject({
      id: "card_1",
    });
  });
});
