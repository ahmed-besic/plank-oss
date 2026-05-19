import { describe, expect, it } from "vitest";
import { parseBehaviorSource } from "./parser";

describe("parseBehaviorSource", () => {
  it("parses literals, triggers, and multiple actions", () => {
    const result = parseBehaviorSource(`
rule Ship it
when property changed priority
if property priority equals "high"
set estimate to 3.5
set approved to true
set note to null
notify owner: Review this
    `);

    expect(result.diagnostics).toEqual([]);
    expect(result.rules).toEqual([
      expect.objectContaining({
        name: "Ship it",
        trigger: {
          eventName: "property.changed",
          propertyKey: "priority",
        },
        branches: [
          {
            condition: 'property priority equals "high"',
            actions: [
              { type: "set_property", propertyKey: "estimate", value: 3.5 },
              { type: "set_property", propertyKey: "approved", value: true },
              { type: "set_property", propertyKey: "note", value: null },
              {
                type: "notify",
                recipientPropertyKey: "owner",
                message: "Review this",
              },
            ],
          },
        ],
      }),
    ]);
  });

  it("reports unsupported triggers and missing actions outside a rule", () => {
    const result = parseBehaviorSource(`
when unsupported
rule
do something
    `);

    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          line: 2,
          message: "Expected `rule <Name>` before this line",
        }),
        expect.objectContaining({
          line: 3,
          message: "Expected `rule <Name>` before this line",
        }),
        expect.objectContaining({
          line: 4,
          message: "Expected `rule <Name>` before this line",
        }),
      ]),
    );
  });
});
