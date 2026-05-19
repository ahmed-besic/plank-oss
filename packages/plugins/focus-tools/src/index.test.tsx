import { describe, expect, it, vi } from "vitest";
import { focusBoardTemplate, focusToolsPlugin } from "./index";

describe("focus tools plugin", () => {
  it("registers deterministic template, property, slot, and wildcard handler contracts", () => {
    expect(focusBoardTemplate.defaultViewIds).toEqual(["focus-tools:focus-view"]);
    expect(focusToolsPlugin.manifest.id).toBe("focus-tools");
    expect(focusToolsPlugin.views.map((entry) => entry.id)).toEqual([
      "focus-tools:focus-view",
    ]);
    expect(focusToolsPlugin.propertyTypes.map((entry) => entry.id)).toEqual([
      "focus-tools:confidence",
    ]);
    expect(focusToolsPlugin.cardSlots.map((entry) => entry.id)).toEqual([
      "focus-tools:confidence-slot",
    ]);
    expect(focusToolsPlugin.cardChangeHandlers.map((entry) => entry.event)).toEqual([
      "*",
    ]);
  });

  it("keeps the add-confidence command behavior pinned", async () => {
    const command = focusToolsPlugin.commands.find(
      (entry) => entry.id === "focus-tools:add-confidence-property",
    );
    const addProperty = vi.fn(async () => {});
    const toast = vi.fn();

    if (!command) {
      throw new Error("Missing focus tools command");
    }

    await command.run({ addProperty, toast, workspaceSlug: "demo" });

    expect(addProperty).toHaveBeenCalledWith("Confidence", "focus-tools:confidence", {});
    expect(toast).toHaveBeenCalledWith("Confidence property added.");
  });
});
