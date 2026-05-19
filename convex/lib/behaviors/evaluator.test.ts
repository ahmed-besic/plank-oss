import { describe, expect, it } from "vitest";
import { evaluateProgram } from "./evaluator";

const eventBase = {
  eventId: "event-1",
  actorId: "user-1",
  boardId: "board-1",
  cardId: "card-1",
  workspaceId: "workspace-1",
  timestamp: 1,
};

describe("evaluateProgram", () => {
  it("matches supported conditions and returns planned actions with trace", () => {
    const result = evaluateProgram({
      event: {
        ...eventBase,
        name: "card.updated",
        statusKey: "todo",
        changedPropertyKeys: ["priority"],
        patch: {
          priority: "high",
          estimate: 3,
        },
        tagIds: ["urgent"],
      },
      program: {
        version: 1,
        rules: [
          {
            id: "rule-1",
            name: "Priority changed",
            trigger: { eventName: "card.updated" },
            branches: [
              {
                condition: 'property priority equals "high"',
                actions: [{ type: "move_status", statusKey: "done" }],
              },
            ],
          },
          {
            id: "rule-2",
            name: "Tag match",
            trigger: { eventName: "card.updated" },
            branches: [
              {
                condition: "has tag urgent",
                actions: [{ type: "notify", message: "Tag matched" }],
              },
            ],
          },
        ],
      },
    });

    expect(result.matchedRuleIds).toEqual(["rule-1", "rule-2"]);
    expect(result.actions.map((entry) => entry.action.type)).toEqual([
      "move_status",
      "notify",
    ]);
    expect(result.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "move card to status done",
          status: "skipped",
        }),
        expect.objectContaining({
          action: "notify Tag matched",
          status: "skipped",
        }),
      ]),
    );
  });

  it("ignores property.changed rules when the property key was not changed", () => {
    const result = evaluateProgram({
      event: {
        ...eventBase,
        name: "property.changed",
        changedPropertyKeys: ["estimate"],
      },
      program: {
        version: 1,
        rules: [
          {
            id: "rule-1",
            name: "Priority only",
            trigger: { eventName: "property.changed", propertyKey: "priority" },
            branches: [{ actions: [{ type: "stop" }] }],
          },
        ],
      },
    });

    expect(result.matchedRuleIds).toEqual([]);
    expect(result.actions).toEqual([]);
    expect(result.trace).toEqual([]);
  });
});
