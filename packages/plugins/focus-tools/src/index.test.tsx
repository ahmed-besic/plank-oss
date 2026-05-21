import { describe, expect, it, vi } from "vitest";
import type { PlatformClientServices } from "@plank/plugin-sdk";
import { focusBoardTemplate, focusToolsPlugin } from "./index";
import { focusToolsManifest } from "./manifest";
import { focusToolsServerPlugin } from "./server";

describe("focus tools plugin", () => {
  it("registers deterministic client and server contracts", () => {
    expect(focusBoardTemplate.defaultViewIds).toEqual(["focus-tools:focus-view"]);
    expect(focusToolsPlugin.manifest).toEqual(focusToolsManifest);
    expect(focusToolsServerPlugin.manifest).toEqual(focusToolsManifest);
    expect(focusToolsManifest.serverModule).toBe("./server");
    expect(focusToolsPlugin.views.map((entry) => entry.id)).toEqual([
      "focus-tools:focus-view",
    ]);
    expect(focusToolsPlugin.propertyTypes.map((entry) => entry.id)).toEqual([
      "focus-tools:confidence",
    ]);
    expect(focusToolsPlugin.uiExtensions.map((entry) => entry.id)).toEqual([
      "focus-tools:confidence-slot",
    ]);
    expect(focusToolsServerPlugin.boardTypeTemplates.map((entry) => entry.id)).toEqual([
      "focus-tools:default",
    ]);
    expect(focusToolsServerPlugin.cardChangeHandlers.map((entry) => entry.event)).toEqual([
      "*",
    ]);
  });

  it("keeps the add-confidence command behavior pinned", async () => {
    const command = focusToolsPlugin.commands.find(
      (entry) => entry.id === "focus-tools:add-confidence-property",
    );
    const addProperty = vi.fn(async () => {});
    const toast = vi.fn();
    const services: PlatformClientServices = {
      navigation: {
        openCard: vi.fn(),
        navigate: vi.fn(),
      },
      cards: {
        create: vi.fn(async () => undefined),
        update: vi.fn(async () => undefined),
        move: vi.fn(async () => {}),
        open: vi.fn(),
      },
      properties: {
        add: addProperty,
      },
      views: {
        updateConfig: vi.fn(async () => {}),
      },
      toast: {
        show: toast,
      },
    };

    if (!command) {
      throw new Error("Missing focus tools command");
    }

    await command.run({ addProperty, services, toast, workspaceSlug: "demo" });

    expect(addProperty).toHaveBeenCalledWith("Confidence", "focus-tools:confidence", {});
    expect(toast).toHaveBeenCalledWith("Confidence property added.");
  });
});
