import { describe, expect, it } from "vitest";
import { compileBehaviorSource } from "./compiler";

function createCollectQuery<T>(rows: T[]) {
  return {
    withIndex(_name: string, _cb: (query: any) => any) {
      return {
        collect: async () => rows,
      };
    },
  };
}

function createCtx() {
  return {
    db: {
      query(table: string) {
        switch (table) {
          case "boardTypes":
            return createCollectQuery([
              {
                lifecycleConfig: {
                  statuses: [{ key: "todo" }, { key: "done" }],
                },
              },
            ]);
          case "cardTypeRegistry":
            return createCollectQuery([
              {
                manifest: {
                  fields: {
                    core: [{ key: "priority" }, { key: "owner" }],
                  },
                },
              },
            ]);
          case "workspaceCardTypeCustomFields":
            return createCollectQuery([{ key: "estimate", status: "active" }]);
          case "tagDefinitions":
            return createCollectQuery([{ key: "urgent" }]);
          case "workspaceMembers":
            return createCollectQuery([{ userId: "user_2" }]);
          default:
            throw new Error(`Unexpected table ${table}`);
        }
      },
    },
  } as any;
}

describe("compileBehaviorSource", () => {
  it("returns a compiled program for valid rules", async () => {
    const result = await compileBehaviorSource({
      ctx: createCtx(),
      workspaceId: "workspace-1" as never,
      source: `
rule Done
when card updated
if property priority equals "high"
move card to status done
notify owner: Ready
      `,
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.program).toEqual(
      expect.objectContaining({
        version: 1,
        rules: [
          expect.objectContaining({
            name: "Done",
            branches: [
              {
                condition: 'property priority equals "high"',
                actions: [
                  { type: "move_status", statusKey: "done" },
                  {
                    type: "notify",
                    recipientPropertyKey: "owner",
                    message: "Ready",
                  },
                ],
              },
            ],
          }),
        ],
      }),
    );
  });

  it("merges parser and validator diagnostics and omits the program on error", async () => {
    const result = await compileBehaviorSource({
      ctx: createCtx(),
      workspaceId: "workspace-1" as never,
      source: `
rule Delete
when card deleted
move card to status missing

rule
      `,
    });

    expect(result.program).toBeUndefined();
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: "error",
          message: "Unsupported action syntax: rule",
        }),
        expect.objectContaining({
          level: "error",
          message: "`when card deleted` only supports `notify` and `stop` actions",
        }),
        expect.objectContaining({
          level: "error",
          message: "Unknown status key: missing",
        }),
      ]),
    );
  });
});
