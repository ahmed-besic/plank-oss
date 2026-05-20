import { describe, expect, it } from "vitest";
import {
  defineBoardTypeTemplateFeature,
  defineCardTypeFeature,
  defineClientPlugin,
  defineServerPlugin,
  defineUiExtensionFeature,
  defineViewFeature,
} from "./index";

describe("plugin SDK", () => {
  it("collects client registrations into a client-only plugin contract", () => {
    const plugin = defineClientPlugin(
      {
        id: "client-plugin",
        name: "Client plugin",
        version: "1.0.0",
        hooks: ["registerView", "registerCommand", "registerUiExtension"],
        capabilities: [],
        trustLevel: "restricted",
      },
      ({ registerCommand, registerFeature, registerUiExtension, registerView }) => {
        registerView({
          id: "client:view",
          label: "Client view",
          render: () => null,
        });
        registerFeature(
          defineViewFeature({
            id: "client:feature-view",
            label: "Feature view",
            render: () => null,
          }),
        );
        registerCommand({
          id: "client:command",
          label: "Client command",
          run: () => {},
        });
        registerFeature(
          defineUiExtensionFeature({
            id: "client:shell-nav",
            slot: "shell.sidebar.navigation",
            label: "Client shell nav",
            render: () => null,
          }),
        );
        registerUiExtension({
          id: "client:direct-shell-nav",
          slot: "shell.sidebar.navigation",
          label: "Direct shell nav",
          render: () => null,
        });
      },
    );

    expect(plugin.views.map((entry) => entry.id)).toEqual([
      "client:view",
      "client:feature-view",
    ]);
    expect(plugin.commands.map((entry) => entry.id)).toEqual(["client:command"]);
    expect(plugin.uiExtensions.map((entry) => entry.id)).toEqual([
      "client:shell-nav",
      "client:direct-shell-nav",
    ]);
    expect(plugin.manifest.trustLevel).toBe("restricted");
    expect(plugin.features.map((entry) => [entry.kind, entry.id])).toEqual([
      ["view", "client:view"],
      ["view", "client:feature-view"],
      ["command", "client:command"],
      ["uiExtension", "client:shell-nav"],
      ["uiExtension", "client:direct-shell-nav"],
    ]);
    expect("cardChangeHandlers" in plugin).toBe(false);
  });

  it("collects server registrations into a server-only plugin contract", () => {
    const plugin = defineServerPlugin(
      {
        id: "server-plugin",
        name: "Server plugin",
        version: "1.0.0",
        hooks: ["registerBoardTypeTemplate", "registerCardChange"],
        capabilities: ["cards:read"],
      },
      ({ registerBoardTypeTemplate, registerCardChange, registerFeature }) => {
        registerFeature(
          defineBoardTypeTemplateFeature({
            id: "server:feature-template",
            name: "Feature template",
            defaultLifecycleStatuses: [],
            defaultViewIds: ["client:view"],
            version: 1,
          }),
        );
        registerBoardTypeTemplate({
          id: "server:template",
          name: "Server template",
          defaultLifecycleStatuses: [],
          defaultViewIds: ["client:view"],
          version: 1,
        });
        registerFeature(
          defineCardTypeFeature({
            pluginId: "server-plugin",
            typeKey: "server:card",
            schemaVersion: 1,
            fields: { core: [] },
            bodyPolicy: { allowEmpty: true },
            metaPolicy: { titleRequired: true },
            automationExposedFields: [],
            queryIndexHints: [],
          }),
        );
        registerCardChange({
          id: "server:change",
          event: "*",
          handle: () => {},
        });
      },
    );

    expect(plugin.boardTypeTemplates.map((entry) => entry.id)).toEqual([
      "server:feature-template",
      "server:template",
    ]);
    expect(plugin.cardTypeManifests.map((entry) => entry.typeKey)).toEqual([
      "server:card",
    ]);
    expect(plugin.cardChangeHandlers.map((entry) => entry.id)).toEqual([
      "server:change",
    ]);
    expect(plugin.features.map((entry) => [entry.kind, entry.id])).toEqual([
      ["boardTypeTemplate", "server:feature-template"],
      ["boardTypeTemplate", "server:template"],
      ["cardType", "server:card"],
      ["cardChangeHandler", "server:change"],
    ]);
    expect("views" in plugin).toBe(false);
  });
});
