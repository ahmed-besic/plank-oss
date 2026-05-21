import { describe, expect, it } from "vitest";
import { calendarBoardPlugin, calendarBoardTemplate } from "./index";
import { calendarBoardManifest } from "./manifest";
import { calendarBoardServerPlugin } from "./server";

describe("calendar board plugin", () => {
  it("registers a deterministic calendar template and month view", () => {
    expect(calendarBoardTemplate).toMatchObject({
      id: "calendar-board:default",
      defaultViewIds: ["calendar-board:month"],
      version: 1,
    });
    expect(calendarBoardPlugin.manifest).toEqual(calendarBoardManifest);
    expect(calendarBoardServerPlugin.manifest).toEqual(calendarBoardManifest);
    expect(calendarBoardManifest.serverModule).toBe("./server");
    expect(calendarBoardServerPlugin.boardTypeTemplates.map((entry) => entry.id)).toEqual([
      "calendar-board:default",
    ]);
    expect(calendarBoardPlugin.views.map((entry) => entry.id)).toEqual([
      "calendar-board:month",
    ]);
  });
});
