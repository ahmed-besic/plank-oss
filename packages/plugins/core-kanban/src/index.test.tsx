import { describe, expect, it } from "vitest";
import { coreKanbanBoardTemplate, coreKanbanPlugin } from "./index";
import { coreKanbanServerPlugin } from "./server";

describe("core kanban plugin", () => {
  it("registers the default kanban template and board view contract", () => {
    expect(coreKanbanBoardTemplate.defaultViewIds).toEqual(["core-kanban:board"]);
    expect(coreKanbanPlugin.manifest.id).toBe("core-kanban");
    expect(coreKanbanServerPlugin.boardTypeTemplates.map((entry) => entry.id)).toEqual([
      "core-kanban:default",
    ]);
    expect(coreKanbanPlugin.views).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "core-kanban:board",
          seedMode: "always",
          defaultForBoard: true,
        }),
      ]),
    );
  });

  it("exposes builtin commands and the status summary panel fill", () => {
    expect(coreKanbanPlugin.commands.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([
        "core-kanban:create-card",
        "core-kanban:add-text-property",
      ]),
    );
    expect(coreKanbanPlugin.uiExtensions.map((entry) => entry.id)).toEqual([
      "core-kanban:status",
    ]);
    expect(coreKanbanPlugin.propertyTypes.length).toBeGreaterThan(0);
  });
});
