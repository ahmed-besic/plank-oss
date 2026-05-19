import { describe, expect, it } from "vitest";
import { validateHierarchy } from "./cards";

function createCtx({
  cards,
  registry,
}: {
  cards: Record<string, any>;
  registry: Record<string, any>;
}) {
  return {
    db: {
      async get(id: string) {
        return cards[id] ?? null;
      },
      query() {
        return {
          withIndex(_name: string, cb: (query: any) => any) {
            let typeKey: string | undefined;
            cb({
              eq(_field: string, value: string) {
                typeKey = value;
                return this;
              },
            });
            return {
              unique: async () => (typeKey ? registry[typeKey] ?? null : null),
            };
          },
        };
      },
    },
  } as any;
}

describe("validateHierarchy", () => {
  it("returns null when no parent is provided", async () => {
    await expect(
      validateHierarchy(createCtx({ cards: {}, registry: {} }), {
        workspaceId: "workspace-1" as never,
        boardId: "board-1" as never,
        childTypeKey: "task",
      }),
    ).resolves.toBeNull();
  });

  it("rejects disallowed child types", async () => {
    const ctx = createCtx({
      cards: {
        parent: {
          _id: "parent",
          workspaceId: "workspace-1",
          boardId: "board-1",
          typeKey: "task",
          parentId: null,
        },
      },
      registry: {
        task: {
          status: "active",
          manifest: {
            hierarchyPolicy: {
              supportsChildren: true,
              allowedChildTypeKeys: ["task"],
            },
          },
        },
      },
    });

    await expect(
      validateHierarchy(ctx, {
        workspaceId: "workspace-1" as never,
        boardId: "board-1" as never,
        parentId: "parent" as never,
        childTypeKey: "bug",
      }),
    ).rejects.toThrow("Child card type is not allowed by parent hierarchy policy");
  });

  it("enforces max depth and detects hierarchy cycles", async () => {
    const depthCtx = createCtx({
      cards: {
        parent: {
          _id: "parent",
          workspaceId: "workspace-1",
          boardId: "board-1",
          typeKey: "task",
          parentId: "grandparent",
        },
        grandparent: {
          _id: "grandparent",
          workspaceId: "workspace-1",
          boardId: "board-1",
          typeKey: "task",
          parentId: null,
        },
      },
      registry: {
        task: {
          status: "active",
          manifest: {
            hierarchyPolicy: {
              supportsChildren: true,
              maxDepth: 1,
            },
          },
        },
      },
    });

    await expect(
      validateHierarchy(depthCtx, {
        workspaceId: "workspace-1" as never,
        boardId: "board-1" as never,
        parentId: "parent" as never,
        childTypeKey: "task",
      }),
    ).rejects.toThrow("Card hierarchy depth limit exceeded");

    const cycleCtx = createCtx({
      cards: {
        parent: {
          _id: "parent",
          workspaceId: "workspace-1",
          boardId: "board-1",
          typeKey: "task",
          parentId: "child",
        },
        child: {
          _id: "child",
          workspaceId: "workspace-1",
          boardId: "board-1",
          typeKey: "task",
          parentId: "parent",
        },
      },
      registry: {
        task: {
          status: "active",
          manifest: {
            hierarchyPolicy: {
              supportsChildren: true,
              maxDepth: 4,
            },
          },
        },
      },
    });

    await expect(
      validateHierarchy(cycleCtx, {
        workspaceId: "workspace-1" as never,
        boardId: "board-1" as never,
        parentId: "parent" as never,
        childTypeKey: "task",
      }),
    ).rejects.toThrow("Card hierarchy cycle detected");
  });
});
