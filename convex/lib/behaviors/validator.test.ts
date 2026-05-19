import { describe, expect, it } from "vitest";
import { validateParsedRules } from "./validator";

const context = {
  workspaceId: "workspace-1" as never,
  statusKeys: new Set(["todo", "done"]),
  propertyKeys: new Set(["priority", "owner"]),
  tagKeys: new Set(["urgent"]),
  memberUserIds: new Set(["user_2"]),
};

describe("validateParsedRules", () => {
  it("reports unknown references and deleted-trigger incompatibilities", () => {
    const diagnostics = validateParsedRules({
      context,
      rules: [
        {
          id: "rule-1",
          name: "Delete rule",
          trigger: { eventName: "card.deleted" },
          branches: [
            {
              actions: [
                { type: "move_status", statusKey: "missing" },
                { type: "set_property", propertyKey: "estimate", value: 3 },
                { type: "add_tag", tagKey: "missing" },
                {
                  type: "notify",
                  recipientPropertyKey: "missingOwner",
                  message: "Heads up",
                },
              ],
            },
          ],
        },
      ],
    });

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "error",
          message: "`when card deleted` only supports `notify` and `stop` actions",
          ruleName: "Delete rule",
        }),
        expect.objectContaining({
          level: "error",
          message: "Unknown status key: missing",
        }),
        expect.objectContaining({
          level: "error",
          message: "Unknown property key: estimate",
        }),
        expect.objectContaining({
          level: "error",
          message: "Unknown tag key: missing",
        }),
        expect.objectContaining({
          level: "error",
          message: "Unknown property key: missingOwner",
        }),
      ]),
    );
  });

  it("warns on duplicate names and empty branches", () => {
    const diagnostics = validateParsedRules({
      context,
      rules: [
        {
          id: "rule-1",
          name: "Duplicate",
          trigger: { eventName: "card.updated" },
          branches: [{ actions: [] }],
        },
        {
          id: "rule-2",
          name: "Duplicate",
          trigger: { eventName: "property.changed" },
          branches: [{ actions: [] }],
        },
      ],
    });

    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "warning",
          message: "Duplicate rule name: Duplicate",
        }),
        expect.objectContaining({
          level: "warning",
          message: "Branch has no actions",
        }),
        expect.objectContaining({
          level: "error",
          message: "`when property changed` requires a property key",
        }),
      ]),
    );
  });
});
