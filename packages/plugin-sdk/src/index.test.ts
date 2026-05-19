import { describe, expect, it } from "vitest";
import { definePlugin } from "./index";

describe("definePlugin", () => {
  it("collects registered definitions into the plugin contract", () => {
    const plugin = definePlugin(
      {
        id: "test-plugin",
        name: "Test plugin",
        version: "1.0.0",
        hooks: [
          "registerView",
          "registerPropertyType",
          "registerCommand",
          "registerCardSlot",
          "registerCardChange",
          "registerBoardTypeTemplate",
        ],
        capabilities: ["cards:read"],
      },
      ({
        registerBoardTypeTemplate,
        registerCardChange,
        registerCardSlot,
        registerCommand,
        registerPropertyType,
        registerView,
      }) => {
        registerView({
          id: "test:view",
          label: "Test view",
          render: () => null,
        });
        registerPropertyType({
          id: "test:property",
          label: "Test property",
          renderEditor: () => null,
        });
        registerCommand({
          id: "test:command",
          label: "Test command",
          run: () => {},
        });
        registerCardSlot({
          id: "test:slot",
          title: "Test slot",
          render: () => null,
        });
        registerCardChange({
          id: "test:change",
          event: "*",
          handle: async () => {},
        });
        registerBoardTypeTemplate({
          id: "test:template",
          name: "Template",
          defaultLifecycleStatuses: [],
          defaultViewIds: ["test:view"],
          version: 1,
        });
      },
    );

    expect(plugin.manifest.id).toBe("test-plugin");
    expect(plugin.views.map((entry) => entry.id)).toEqual(["test:view"]);
    expect(plugin.propertyTypes.map((entry) => entry.id)).toEqual([
      "test:property",
    ]);
    expect(plugin.commands.map((entry) => entry.id)).toEqual(["test:command"]);
    expect(plugin.cardSlots.map((entry) => entry.id)).toEqual(["test:slot"]);
    expect(plugin.cardChangeHandlers.map((entry) => entry.id)).toEqual([
      "test:change",
    ]);
    expect(plugin.boardTypeTemplates.map((entry) => entry.id)).toEqual([
      "test:template",
    ]);
  });
});
