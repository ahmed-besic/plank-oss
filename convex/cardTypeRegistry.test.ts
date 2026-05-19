import { describe, expect, it } from "vitest";
import {
  installCardTypeManifest,
  patchCoreFields,
  switchType,
} from "./cardTypeRegistry";
import { MockConvexDb, createMockCtx } from "./test_helpers";

function createBaseDb() {
  return new MockConvexDb({
    workspaces: [
      {
        _id: "workspace_1",
        name: "Acme",
        slug: "acme",
        ownerId: "user_1",
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    workspaceMembers: [
      {
        _id: "member_1",
        workspaceId: "workspace_1",
        userId: "user_1",
        email: "owner@example.com",
        role: "owner",
        createdAt: 1,
      },
    ],
    boardTypes: [
      {
        _id: "boardType_1",
        workspaceId: "workspace_1",
        key: "task-tracking",
        name: "Task tracking",
        lifecycleConfig: {
          statuses: [{ key: "backlog", label: "Backlog", category: "todo", orderKey: "a0" }],
          initialStatusKey: "backlog",
        },
        defaultViewIds: ["core-kanban:board"],
        defaultCardTypeKey: "core.todo",
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    boards: [
      {
        _id: "board_1",
        workspaceId: "workspace_1",
        boardTypeId: "boardType_1",
        name: "Team board",
        slug: "team-board",
        createdBy: "user_1",
        createdAt: 1,
        updatedAt: 1,
        columns: [{ id: "column-backlog", statusKey: "backlog", orderKey: "a0" }],
      },
    ],
    cardTypeRegistry: [
      {
        _id: "cardTypeRegistry_1",
        workspaceId: "workspace_1",
        pluginId: "core-cards",
        typeKey: "core.todo",
        schemaVersion: 1,
        manifest: {
          pluginId: "core-cards",
          typeKey: "core.todo",
          schemaVersion: 1,
          fields: {
            core: [
              {
                key: "priority",
                label: "Priority",
                valueType: "string",
              },
            ],
          },
          bodyPolicy: { allowEmpty: true },
          metaPolicy: { titleRequired: true },
          automationExposedFields: ["priority"],
          queryIndexHints: [],
          renderer: {
            tileRendererId: "todo.tile.v1",
            detailRendererId: "todo.detail.v1",
          },
        },
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      },
      {
        _id: "cardTypeRegistry_2",
        workspaceId: "workspace_1",
        pluginId: "core-cards",
        typeKey: "core.notes",
        schemaVersion: 1,
        manifest: {
          pluginId: "core-cards",
          typeKey: "core.notes",
          schemaVersion: 1,
          fields: {
            core: [
              {
                key: "summary",
                label: "Summary",
                valueType: "string",
                required: true,
              },
            ],
          },
          bodyPolicy: { allowEmpty: true },
          metaPolicy: { titleRequired: true },
          automationExposedFields: ["summary"],
          queryIndexHints: [],
          renderer: {
            tileRendererId: "notes.tile.v1",
            detailRendererId: "notes.detail.v1",
          },
        },
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    cards: [
      {
        _id: "card_1",
        workspaceId: "workspace_1",
        boardId: "board_1",
        typeKey: "core.todo",
        typeSchemaVersion: 1,
        meta: { title: "Ship plugin" },
        statusKey: "backlog",
        viewState: { kanban: { columnId: "column-backlog" } },
        orderKey: "a0",
        fields: {
          core: { priority: "high" },
          custom: {},
        },
        relations: [],
        tagIds: [],
        body: {
          type: "blocknote",
          content: [{ id: "p1", type: "paragraph" }],
        },
        createdAt: 1,
        updatedAt: 1,
        createdBy: "user_1",
      },
    ],
  });
}

describe("cardTypeRegistry lifecycle", () => {
  it("rejects duplicate typeKey installs", async () => {
    const db = createBaseDb();
    const ctx = createMockCtx({ db });

    await expect(
      (installCardTypeManifest as unknown as (ctx: unknown, args: unknown) => Promise<unknown>)(
        ctx,
        {
          workspaceSlug: "acme",
          pluginId: "core-cards",
          typeKey: "core.todo",
          schemaVersion: 2,
          manifest: {
            pluginId: "core-cards",
            typeKey: "core.todo",
            schemaVersion: 2,
            fields: { core: [] },
            bodyPolicy: { allowEmpty: true },
            metaPolicy: { titleRequired: true },
            automationExposedFields: [],
            queryIndexHints: [],
            renderer: {
              tileRendererId: "x",
              detailRendererId: "y",
            },
          },
        },
      ),
    ).rejects.toThrow(/typeKey already exists/i);
  });

  it("rejects invalid core field patches", async () => {
    const db = createBaseDb();
    const ctx = createMockCtx({ db });

    await expect(
      (patchCoreFields as unknown as (ctx: unknown, args: unknown) => Promise<unknown>)(ctx, {
        workspaceSlug: "acme",
        boardId: "board_1",
        cardId: "card_1",
        updates: {
          priority: 123,
        },
      }),
    ).rejects.toThrow(/Invalid core field value/i);
  });

  it("returns diagnostics for invalid switch mappings", async () => {
    const db = createBaseDb();
    const ctx = createMockCtx({ db });

    const result = await (switchType as unknown as (
      ctx: unknown,
      args: unknown,
    ) => Promise<{ ok: boolean; diagnostics: string[] }>)(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      cardId: "card_1",
      fromTypeKey: "core.todo",
      toTypeKey: "core.notes",
      coreFieldMapping: {},
      customFieldPolicy: "drop",
      bodyPolicy: "keep",
      metaPolicy: "keep",
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]).toContain("Missing required core field mapping");
  });
});
