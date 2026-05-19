import { describe, expect, it } from "vitest";
import {
  taskBoardPluginId,
  taskBoardTemplate,
  taskCardManifest,
  taskCardTypeKey,
  taskPriorityOptions,
} from "./manifest";

describe("task board manifest", () => {
  it("pins the task card manifest shape and defaults", () => {
    expect(taskBoardPluginId).toBe("task-board");
    expect(taskCardTypeKey).toBe("task-board:task");
    expect(taskCardManifest.pluginId).toBe(taskBoardPluginId);
    expect(taskCardManifest.fields.core.map((field) => field.key)).toEqual([
      "description",
      "dueDate",
      "priority",
      "completed",
    ]);
    expect(taskCardManifest.automationExposedFields).toEqual([
      "dueDate",
      "priority",
      "completed",
    ]);
    expect(taskCardManifest.fields.core.find((field) => field.key === "priority"))
      .toMatchObject({
        defaultValue: "medium",
        enumValues: ["low", "medium", "high"],
        enumOptions: [
          { label: "Low", value: "low", color: "green" },
          { label: "Medium", value: "medium", color: "amber" },
          { label: "High", value: "high", color: "red" },
        ],
        indexed: true,
      });
  });

  it("pins capability declarations and hierarchy policy", () => {
    expect(taskCardManifest.capabilities?.provides).toMatchObject({
      hasDeadline: { kind: "field", path: "fields.core.dueDate" },
      hasPriority: { kind: "field", path: "fields.core.priority" },
      hasCompletion: { kind: "field", path: "fields.core.completed" },
      hasSubtasks: { kind: "system", path: "parentId" },
      hasStatus: { kind: "system", path: "statusKey" },
    });
    expect(taskCardManifest.hierarchyPolicy).toEqual({
      supportsChildren: true,
      maxDepth: 1,
      allowedChildTypeKeys: [taskCardTypeKey],
    });
  });

  it("pins the default board template and priority ordering", () => {
    expect(taskBoardTemplate).toMatchObject({
      id: "task-board:default",
      defaultViewIds: ["task-board:board"],
      defaultCardTypeKey: taskCardTypeKey,
      version: 1,
    });
    expect(taskBoardTemplate.defaultLifecycleStatuses.map((status) => status.key))
      .toEqual(["backlog", "todo", "in_progress", "done"]);
    expect(taskPriorityOptions).toEqual([
      { label: "Low", value: "low", color: "green" },
      { label: "Medium", value: "medium", color: "amber" },
      { label: "High", value: "high", color: "red" },
    ]);
  });
});
