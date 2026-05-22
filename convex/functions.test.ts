import { describe, expect, it } from "vitest";
import {
  compareOrderKeys,
  createDefaultLifecycleStatuses,
  createKeyAfter,
  type WorkspaceRole,
} from "@plank/domain";
import { builtinServerPluginRegistry } from "@plank/plugin-runtime/server";
import { createBoardType, deleteStatus } from "./boardTypes";
import {
  addBoardView,
  deleteBoard,
  getBoardActivityPage,
  getBoardPage,
  heartbeatBoardPresence,
  listBoardPresence,
  markBoardSeen,
  renameBoard,
  updateBoardViewConfig,
} from "./boards";
import {
  addCardRelation,
  createCard,
  createSubTask,
  deleteCard,
  getCardRelations,
  listSubTasks,
  markCardSeen,
  removeCardRelation,
  updateCard,
} from "./cards";
import { createProperty } from "./cardTypes";
import {
  create as createComment,
  deleteComment,
  toggleReaction,
  update as updateComment,
} from "./comments";
import { searchBoardTitles, searchWorkspaceCardTitles } from "./search";
import {
  acceptInvite,
  backfillInviteMetadata,
  createBoard,
  createInvite,
  getOverview,
  removeMember,
  resendInvite,
  revokeInvite,
  setExtensionStatus,
  updateMemberRole,
} from "./workspaces";
import { MockConvexDb, createMockCtx } from "./test_helpers";

const taskBoardPlugin = builtinServerPluginRegistry.pluginMap.get("task-board");
if (!taskBoardPlugin?.cardTypeManifests[0]) {
  throw new Error("Missing task-board card type manifest");
}
const taskCardManifest = taskBoardPlugin.cardTypeManifests[0];

function createBaseDb() {
  const statuses = createDefaultLifecycleStatuses();

  return new MockConvexDb({
    boardTypes: [
      {
        _id: "boardType_1",
        workspaceId: "workspace_1",
        key: "task-tracking",
        name: "Task tracking",
        lifecycleConfig: {
          statuses,
          initialStatusKey: statuses[0]?.key ?? "backlog",
        },
        defaultViewIds: ["core-kanban:board"],
        defaultCardTypeKey: "core.todo",
        createdAt: 1,
        updatedAt: 1,
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
                key: "focus",
                label: "Focus",
                valueType: "string",
              },
              {
                key: "dueDate",
                label: "Due date",
                valueType: "timestamp",
              },
            ],
          },
          bodyPolicy: { allowEmpty: true },
          metaPolicy: { titleRequired: true },
          automationExposedFields: ["focus", "dueDate"],
          queryIndexHints: [],
        },
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    workspaceExtensions: [
      {
        _id: "workspaceExtension_1",
        workspaceId: "workspace_1",
        pluginId: "task-board",
        status: "enabled",
        installedBy: "user_1",
        installedAt: 1,
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
      },
    ],
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
      {
        _id: "member_2",
        workspaceId: "workspace_1",
        userId: "user_2",
        email: "teammate@example.com",
        role: "member",
        createdAt: 1,
      },
      {
        _id: "member_3",
        workspaceId: "workspace_1",
        userId: "user_3",
        email: "reviewer@example.com",
        role: "member",
        createdAt: 1,
      },
    ],
  });
}

describe("board functions", () => {
  it("creates, updates, and deletes cards", async () => {
    const db = createBaseDb();
    const ctx = createMockCtx({ db });

    const created = await (
      createCard as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      title: "Ship core plugin",
      typeKey: "core.todo",
    });

    expect(created.cardId).toBeDefined();
    expect(db.rows("cards")).toHaveLength(1);
    expect(db.rows("cards")[0]?.meta).toMatchObject({
      title: "Ship core plugin",
    });
    expect(db.rows("workflowEvents")).toHaveLength(1);
    expect(db.rows("workflowEvents")[0]).toMatchObject({
      eventName: "card.created",
      cardId: created.cardId,
    });
    expect(db.rows("cardChangeEvents")).toMatchObject([
      expect.objectContaining({
        cardId: created.cardId,
        kind: "new_card",
      }),
    ]);

    await (
      updateCard as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      cardId: created.cardId,
      title: "Ship the core plugin",
      propertyUpdates: {
        focus: "high",
      },
    });

    expect(db.rows("cards")[0]?.meta).toMatchObject({
      title: "Ship the core plugin",
    });
    expect(db.rows("cards")[0]?.fields).toMatchObject({
      core: { focus: "high" },
    });
    expect(db.rows("workflowEvents")).toHaveLength(3);
    expect(db.rows("workflowEvents").map((event) => event.eventName)).toEqual([
      "card.created",
      "card.updated",
      "property.changed",
    ]);
    expect(db.rows("cardChangeEvents").map((event) => event.kind)).toEqual([
      "new_card",
      "title",
      "property",
    ]);

    await (
      updateCard as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      cardId: created.cardId,
      propertyUpdates: {
        dueDate: Date.UTC(2026, 4, 16),
      },
    });
    expect((db.rows("cards")[0] as any)?.fields.core).toMatchObject({
      dueDate: Date.UTC(2026, 4, 16),
    });

    await (
      updateCard as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      cardId: created.cardId,
      propertyUpdates: {
        dueDate: null,
      },
    });
    expect((db.rows("cards")[0] as any)?.fields.core).toMatchObject({
      dueDate: null,
    });

    await expect(
      (updateCard as unknown as (ctx: unknown, args: unknown) => Promise<any>)(
        ctx,
        {
          workspaceSlug: "acme",
          boardId: "board_1",
          cardId: created.cardId,
          propertyUpdates: {
            dueDate: "2026-05-16",
          },
        },
      ),
    ).rejects.toThrow(/invalid field value: dueDate/i);

    await (
      deleteCard as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      cardId: created.cardId,
    });

    expect(db.rows("cards")).toHaveLength(0);
    expect(db.rows("workflowEvents").at(-1)).toMatchObject({
      eventName: "card.deleted",
      cardId: created.cardId,
    });
    expect(db.rows("cardChangeEvents").at(-1)).toMatchObject({
      cardId: created.cardId,
      kind: "delete",
    });
  });

  it("allows custom user properties to store multiple assignees", async () => {
    const db = createBaseDb();
    const ctx = createMockCtx({ db });

    await (
      createProperty as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      typeKey: "core.todo",
      name: "Assignees",
      type: "user",
      config: { allowMultiple: true },
    });

    const created = await (
      createCard as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      title: "Coordinate work",
      typeKey: "core.todo",
    });

    await (
      updateCard as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      cardId: created.cardId,
      propertyUpdates: {
        assignees: ["user_1", "user_2"],
      },
    });

    expect(db.rows("cards")[0]?.fields).toMatchObject({
      custom: { assignees: ["user_1", "user_2"] },
    });
  });

  it("creates, edits, reacts to, and deletes comments with mention notifications", async () => {
    const db = createBaseDb();
    const ownerCtx = createMockCtx({ db });
    const teammateCtx = createMockCtx({
      db,
      email: "teammate@example.com",
      tokenIdentifier: "user_2",
    });

    const created = await (
      createCard as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ownerCtx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      title: "Discuss launch",
      typeKey: "core.todo",
    });

    const comment = await (
      createComment as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ownerCtx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      cardId: created.cardId,
      bodyText: "Please review this @Teammate",
      mentions: [
        {
          userId: "user_2",
          label: "Teammate",
          start: 19,
          end: 28,
        },
      ],
    });

    expect(db.rows("cardComments")).toHaveLength(1);
    expect(db.rows("notifications")).toEqual([
      expect.objectContaining({
        kind: "mention_comment",
        commentId: comment.commentId,
        recipientUserId: "user_2",
      }),
    ]);

    await (
      updateComment as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ownerCtx, {
      workspaceSlug: "acme",
      commentId: comment.commentId,
      bodyText: "Please review this @Teammate and @Reviewer",
      mentions: [
        {
          userId: "user_2",
          label: "Teammate",
          start: 19,
          end: 28,
        },
        {
          userId: "user_3",
          label: "Reviewer",
          start: 33,
          end: 42,
        },
      ],
    });

    expect(db.rows("notifications")).toHaveLength(2);
    expect(db.rows("notifications")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recipientUserId: "user_2",
          kind: "mention_comment",
        }),
        expect.objectContaining({
          recipientUserId: "user_3",
          kind: "mention_comment",
        }),
      ]),
    );

    await (
      toggleReaction as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(teammateCtx, {
      workspaceSlug: "acme",
      commentId: comment.commentId,
      emoji: "thumbs_up",
    });

    expect(db.rows("commentReactions")).toHaveLength(1);
    expect((db.rows("cardComments")[0] as any)?.reactionCounts).toMatchObject({
      thumbs_up: 1,
    });

    await (
      toggleReaction as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(teammateCtx, {
      workspaceSlug: "acme",
      commentId: comment.commentId,
      emoji: "thumbs_up",
    });

    expect(db.rows("commentReactions")).toHaveLength(0);
    expect((db.rows("cardComments")[0] as any)?.reactionCounts).toEqual({});

    await (
      deleteComment as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ownerCtx, {
      workspaceSlug: "acme",
      commentId: comment.commentId,
    });

    expect(db.rows("cardComments")).toHaveLength(0);
    expect(db.rows("notifications")).toHaveLength(0);
  });

  it("sends body mention notifications only for newly added teammates", async () => {
    const db = createBaseDb();
    const ctx = createMockCtx({ db });

    const created = await (
      createCard as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      title: "Follow up with team",
      typeKey: "core.todo",
    });

    await (
      updateCard as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      cardId: created.cardId,
      body: {
        type: "blocknote",
        content: [
          {
            id: "paragraph-1",
            type: "paragraph",
            content: [
              { type: "text", text: "Hello " },
              {
                type: "mention",
                props: {
                  userId: "user_2",
                  label: "Teammate",
                },
              },
            ],
          },
        ],
      },
    });

    expect(db.rows("notifications")).toEqual([
      expect.objectContaining({
        recipientUserId: "user_2",
        kind: "mention_body",
      }),
    ]);

    await (
      updateCard as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      cardId: created.cardId,
      body: {
        type: "blocknote",
        content: [
          {
            id: "paragraph-1",
            type: "paragraph",
            content: [
              { type: "text", text: "Hello " },
              {
                type: "mention",
                props: {
                  userId: "user_2",
                  label: "Teammate",
                },
              },
              { type: "text", text: " and " },
              {
                type: "mention",
                props: {
                  userId: "user_3",
                  label: "Reviewer",
                },
              },
            ],
          },
        ],
      },
    });

    expect(db.rows("notifications")).toHaveLength(2);
    expect(db.rows("notifications")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recipientUserId: "user_2",
          kind: "mention_body",
        }),
        expect.objectContaining({
          recipientUserId: "user_3",
          kind: "mention_body",
        }),
      ]),
    );
  });

  it("moves cards to a new status through updateCard and appends them to the destination status", async () => {
    const db = createBaseDb();
    const ctx = createMockCtx({ db });

    const first = await (
      createCard as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      title: "First card",
      typeKey: "core.todo",
    });

    const destination = await (
      createCard as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      title: "Existing done card",
      typeKey: "core.todo",
      statusKey: "done",
    });

    await (
      updateCard as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      cardId: first.cardId,
      statusKey: "done",
      propertyUpdates: {
        focus: "high",
      },
    });

    const movedCard = db
      .rows("cards")
      .find((card) => card._id === first.cardId);
    const destinationCard = db
      .rows("cards")
      .find((card) => card._id === destination.cardId);

    expect(movedCard).toMatchObject({
      statusKey: "done",
      fields: {
        core: {
          focus: "high",
        },
      },
    });
    expect(destinationCard).toBeDefined();
    expect(
      compareOrderKeys(
        String(destinationCard?.orderKey ?? ""),
        String(movedCard?.orderKey ?? ""),
      ),
    ).toBeLessThan(0);
    expect(db.rows("workflowEvents").map((event) => event.eventName)).toEqual([
      "card.created",
      "card.created",
      "card.updated",
      "property.changed",
      "card.moved",
    ]);
    expect(db.rows("cardChangeEvents").at(-1)).toMatchObject({
      cardId: first.cardId,
      kind: "move",
    });
  });

  it("updates persisted board view config with a versioned envelope", async () => {
    const db = createBaseDb();
    db.rows("boardViews").push({
      _id: "boardView_1",
      workspaceId: "workspace_1",
      boardId: "board_1",
      viewId: "calendar-board:month",
      instanceId: "calendar-board:month:shared",
      definitionViewId: "calendar-board:month",
      instanceMode: "shared",
      pluginId: "calendar-board",
      kind: "core",
      label: "Calendar",
      orderKey: "a0",
      isDefault: false,
    });
    const ctx = createMockCtx({ db });

    await (
      updateBoardViewConfig as unknown as (
        ctx: unknown,
        args: unknown,
      ) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      instanceId: "calendar-board:month:shared",
      config: {
        dateFieldKey: "dueDate",
      },
    });

    expect(db.rows("boardViews")[0]).toMatchObject({
      viewId: "calendar-board:month",
      label: "Calendar",
      config: {
        schemaVersion: 1,
        viewId: "calendar-board:month",
        value: {
          dateFieldKey: "dueDate",
        },
      },
    });
  });

  it("persists typed state envelopes for new board types and boards", async () => {
    const db = createBaseDb();
    const ctx = createMockCtx({ db });

    const boardTypeResult = await (
      createBoardType as unknown as (
        ctx: unknown,
        args: unknown,
      ) => Promise<{ boardTypeId: string }>
    )(ctx, {
      workspaceSlug: "acme",
      name: "Focus board",
      templateRef: {
        pluginId: "task-board",
        templateId: "task-board:default",
        version: 1,
      },
    });

    const boardResult = await (
      createBoard as unknown as (
        ctx: unknown,
        args: unknown,
      ) => Promise<{ boardId: string }>
    )(ctx, {
      workspaceSlug: "acme",
      name: "Typed state board",
      boardTypeId: boardTypeResult.boardTypeId,
    });

    expect(db.rows("boardTypes").at(-1)).toMatchObject({
      viewDefaults: {
        schemaVersion: 1,
        value: {
          defaultViewIds: ["task-board:board"],
        },
      },
    });
    expect(
      db.rows("boards").find((board) => board._id === boardResult.boardId),
    ).toMatchObject({
      boardSettings: {
        schemaVersion: 1,
        value: {},
      },
    });
  });

  it("persists extension config envelopes and admin diagnostics when toggling extensions", async () => {
    const db = createBaseDb();
    const ctx = createMockCtx({ db });

    await (
      setExtensionStatus as unknown as (
        ctx: unknown,
        args: unknown,
      ) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      pluginId: "focus-tools",
      status: "enabled",
    });

    expect(db.rows("workspaceExtensions").at(-1)).toMatchObject({
      pluginId: "focus-tools",
      config: {
        schemaVersion: 1,
        pluginPackageId: "focus-tools",
        value: {},
      },
    });
    expect(db.rows("pluginDiagnostics").at(-1)).toMatchObject({
      pluginId: "focus-tools",
      kind: "extension-status-changed",
      severity: "info",
      actorId: "user_1",
      nextStatus: "enabled",
    });
  });

  it("exposes extension feature metadata, normalized config, and unavailable reasons in overview", async () => {
    const db = createBaseDb();
    const ctx = createMockCtx({ db });

    await (
      setExtensionStatus as unknown as (
        ctx: unknown,
        args: unknown,
      ) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      pluginId: "focus-tools",
      status: "enabled",
    });

    const overview = await (
      getOverview as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
    });

    const core = overview.extensions.find(
      (extension: any) => extension.manifest.id === "core-kanban",
    );
    const focus = overview.extensions.find(
      (extension: any) => extension.manifest.id === "focus-tools",
    );
    const calendar = overview.extensions.find(
      (extension: any) => extension.manifest.id === "calendar-board",
    );

    expect(core).toMatchObject({
      installed: true,
      status: "enabled",
      features: {
        commands: expect.arrayContaining([
          expect.objectContaining({ id: "core-kanban:create-card" }),
        ]),
        uiExtensions: expect.arrayContaining([
          expect.objectContaining({ id: "core-kanban:status" }),
        ]),
        boardTypeTemplates: expect.arrayContaining([
          expect.objectContaining({ id: "core-kanban:default" }),
        ]),
      },
    });
    expect(focus).toMatchObject({
      config: {},
      features: {
        cardChangeHandlers: [
          expect.objectContaining({ id: "focus-tools:card-change-audit" }),
        ],
      },
      status: "enabled",
    });
    expect(calendar?.unavailableReason).toBeUndefined();
  });

  it("rejects unsupported board view config keys for known views", async () => {
    const db = createBaseDb();
    db.rows("boardViews").push({
      _id: "boardView_1",
      workspaceId: "workspace_1",
      boardId: "board_1",
      viewId: "calendar-board:month",
      instanceId: "calendar-board:month:shared",
      definitionViewId: "calendar-board:month",
      instanceMode: "shared",
      pluginId: "calendar-board",
      kind: "core",
      label: "Calendar",
      orderKey: "a0",
      isDefault: false,
    });
    const ctx = createMockCtx({ db });

    await expect(
      (
        updateBoardViewConfig as unknown as (
          ctx: unknown,
          args: unknown,
        ) => Promise<any>
      )(ctx, {
        workspaceSlug: "acme",
        boardId: "board_1",
        instanceId: "calendar-board:month:shared",
        config: {
          dateFieldKey: "dueDate",
          inboxVisible: true,
        },
      }),
    ).rejects.toThrow("Unsupported board view config key");
  });

  it("rejects invalid kanban board view config value types", async () => {
    const db = createBaseDb();
    db.rows("boardViews").push({
      _id: "boardView_1",
      workspaceId: "workspace_1",
      boardId: "board_1",
      viewId: "core-kanban:board",
      instanceId: "core-kanban:board:shared",
      definitionViewId: "core-kanban:board",
      instanceMode: "shared",
      pluginId: "core-kanban",
      kind: "core",
      label: "Board",
      orderKey: "a0",
      isDefault: true,
    });
    const ctx = createMockCtx({ db });

    await expect(
      (
        updateBoardViewConfig as unknown as (
          ctx: unknown,
          args: unknown,
        ) => Promise<any>
      )(ctx, {
        workspaceSlug: "acme",
        boardId: "board_1",
        instanceId: "core-kanban:board:shared",
        config: {
          inboxVisible: "yes",
        },
      }),
    ).rejects.toThrow("inboxVisible must be a boolean");
  });

  it("unwraps legacy board view config when loading the board page", async () => {
    const db = createBaseDb();
    db.rows("boardViews").push({
      _id: "boardView_1",
      workspaceId: "workspace_1",
      boardId: "board_1",
      viewId: "calendar-board:month",
      instanceId: "calendar-board:month:shared",
      definitionViewId: "calendar-board:month",
      instanceMode: "shared",
      pluginId: "calendar-board",
      kind: "core",
      label: "Calendar",
      orderKey: "a0",
      isDefault: true,
      config: {
        dateFieldKey: "dueDate",
      },
    });
    const ctx = createMockCtx({ db });

    const boardPage = await (
      getBoardPage as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
    });

    expect(boardPage.views[0]?.config).toEqual({
      dateFieldKey: "dueDate",
    });
    expect(boardPage.views[0]?.featureInstance).toEqual({
      schemaVersion: 1,
      kind: "view",
      pluginPackageId: "calendar-board",
      featureId: "calendar-board:month",
      instanceId: "calendar-board:month:shared",
      instanceMode: "shared",
    });
  });

  it("tracks server-backed seen state and board presence", async () => {
    const db = createBaseDb();
    db.rows("cards").push({
      _id: "card_1",
      workspaceId: "workspace_1",
      boardId: "board_1",
      typeKey: "core.todo",
      typeSchemaVersion: 1,
      meta: { title: "Ship phase 6" },
      statusKey: "backlog",
      orderKey: createKeyAfter(),
      fields: { core: {}, custom: {} },
      relations: [],
      tagIds: [],
      body: {
        type: "blocknote",
        content: [{ id: "paragraph-1", type: "paragraph" }],
      },
      createdAt: 1,
      updatedAt: 1,
      createdBy: "user_1",
    });
    const ctx = createMockCtx({ db });

    await (
      markBoardSeen as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      seenAt: 50,
    });
    await (
      markCardSeen as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      cardId: "card_1",
      seenAt: 60,
    });
    await (
      heartbeatBoardPresence as unknown as (
        ctx: unknown,
        args: unknown,
      ) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
    });

    const boardPage = await (
      getBoardPage as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
    });
    expect(boardPage.cards[0]?.viewerSeenAt).toBe(60);

    const presence = await (
      listBoardPresence as unknown as (
        ctx: unknown,
        args: unknown,
      ) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
    });
    expect(presence.items).toEqual([
      expect.objectContaining({
        userId: "user_1",
        isViewer: true,
      }),
    ]);
  });

  it("returns paginated board activity with actor and card metadata", async () => {
    const db = createBaseDb();
    const ctx = createMockCtx({ db });

    const created = await (
      createCard as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      title: "Track board activity",
      typeKey: "core.todo",
    });

    await (
      updateCard as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      cardId: created.cardId,
      title: "Track activity carefully",
      propertyUpdates: {
        focus: "high",
      },
    });

    const firstPage = await (
      getBoardActivityPage as unknown as (
        ctx: unknown,
        args: unknown,
      ) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      limit: 2,
    });

    expect(firstPage.items).toHaveLength(2);
    expect(firstPage.items[0]).toMatchObject({
      actorLabel: "owner@example.com",
      cardId: created.cardId,
      cardTitle: "Track activity carefully",
    });
    expect(firstPage.nextCursor).toBeTruthy();

    const secondPage = await (
      getBoardActivityPage as unknown as (
        ctx: unknown,
        args: unknown,
      ) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      limit: 2,
      cursor: firstPage.nextCursor,
    });
    expect(secondPage.items.length).toBeGreaterThanOrEqual(1);
  });

  it("returns empty collaboration reads for stale deleted board ids", async () => {
    const db = createBaseDb();
    const boardIndex = db
      .rows("boards")
      .findIndex((board) => board._id === "board_1");
    db.rows("boards").splice(boardIndex, 1);
    const ctx = createMockCtx({ db });

    const presence = await (
      listBoardPresence as unknown as (
        ctx: unknown,
        args: unknown,
      ) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
    });
    expect(presence).toEqual({ items: [] });

    const activity = await (
      getBoardActivityPage as unknown as (
        ctx: unknown,
        args: unknown,
      ) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
    });
    expect(activity).toEqual({ items: [], nextCursor: null });

    const relations = await (
      getCardRelations as unknown as (
        ctx: unknown,
        args: unknown,
      ) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      cardId: "card_1",
    });
    expect(relations).toEqual({ outgoing: [], incoming: [] });
  });

  it("rehomes cards when deleting a status", async () => {
    const db = createBaseDb();
    db.rows("cards").push(
      {
        _id: "card_1",
        workspaceId: "workspace_1",
        boardId: "board_1",
        typeKey: "core.todo",
        typeSchemaVersion: 1,
        meta: { title: "Spec Phase 1" },
        statusKey: "backlog",
        orderKey: createKeyAfter(),
        fields: { core: {}, custom: {} },
        relations: [],
        tagIds: [],
        body: {
          type: "blocknote",
          content: [{ id: "paragraph-1", type: "paragraph" }],
        },
        createdAt: 1,
        updatedAt: 1,
        createdBy: "user_1",
      },
      {
        _id: "card_2",
        workspaceId: "workspace_1",
        boardId: "board_1",
        typeKey: "core.todo",
        typeSchemaVersion: 1,
        meta: { title: "Ship it" },
        statusKey: "done",
        orderKey: createKeyAfter(),
        fields: { core: {}, custom: {} },
        relations: [],
        tagIds: [],
        body: {
          type: "blocknote",
          content: [{ id: "paragraph-2", type: "paragraph" }],
        },
        createdAt: 1,
        updatedAt: 1,
        createdBy: "user_1",
      },
    );
    const ctx = createMockCtx({ db });

    const result = await (
      deleteStatus as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardTypeId: "boardType_1",
      statusKey: "backlog",
      destinationStatusKey: "done",
    });

    expect(result.destinationStatusKey).toBe("done");
    expect(
      db.rows("cards").find((card) => card._id === "card_1"),
    ).toMatchObject({
      statusKey: "done",
    });
  });

  it("rejects board mutations for non-members", async () => {
    const db = createBaseDb();
    const ctx = createMockCtx({
      db,
      email: "outsider@example.com",
      tokenIdentifier: "outsider_1",
    });

    await expect(
      (createCard as unknown as (ctx: unknown, args: unknown) => Promise<any>)(
        ctx,
        {
          workspaceSlug: "acme",
          boardId: "board_1",
          title: "Should fail",
        },
      ),
    ).rejects.toThrow(/not authorized/i);
  });

  it("creates first-class subtasks and keeps them out of the board page", async () => {
    const db = createBaseDb();
    db.rows("cardTypeRegistry").push({
      _id: "cardTypeRegistry_task",
      workspaceId: "workspace_1",
      pluginId: taskCardManifest.pluginId,
      typeKey: taskCardManifest.typeKey,
      schemaVersion: taskCardManifest.schemaVersion,
      manifest: taskCardManifest as any,
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const ctx = createMockCtx({ db });

    const parent = await (
      createCard as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      title: "Parent task",
      typeKey: taskCardManifest.typeKey,
    });
    const subtask = await (
      createSubTask as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      parentId: parent.cardId,
      title: "Child task",
    });

    expect(
      db.rows("cards").find((card) => card._id === subtask.cardId),
    ).toMatchObject({
      parentId: parent.cardId,
      typeKey: taskCardManifest.typeKey,
    });

    const subtasks = await (
      listSubTasks as unknown as (ctx: unknown, args: unknown) => Promise<any[]>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      parentId: parent.cardId,
    });
    expect(subtasks).toHaveLength(1);
    expect(subtasks[0]?.parentId).toBe(parent.cardId);

    const boardPage = await (
      getBoardPage as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
    });
    expect(boardPage.cards.map((card: any) => card.id)).toEqual([
      parent.cardId,
    ]);
    expect(boardPage.cards[0]?.subtaskStats).toEqual({
      total: 1,
      completed: 0,
    });
  });

  it("enforces hierarchy policy depth and allowed child types", async () => {
    const db = createBaseDb();
    db.rows("cardTypeRegistry").push({
      _id: "cardTypeRegistry_task",
      workspaceId: "workspace_1",
      pluginId: taskCardManifest.pluginId,
      typeKey: taskCardManifest.typeKey,
      schemaVersion: taskCardManifest.schemaVersion,
      manifest: taskCardManifest as any,
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const ctx = createMockCtx({ db });
    const parent = await (
      createCard as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      title: "Parent task",
      typeKey: taskCardManifest.typeKey,
    });
    const child = await (
      createSubTask as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      parentId: parent.cardId,
      title: "Child task",
    });

    await expect(
      (
        createSubTask as unknown as (
          ctx: unknown,
          args: unknown,
        ) => Promise<any>
      )(ctx, {
        workspaceSlug: "acme",
        boardId: "board_1",
        parentId: child.cardId,
        title: "Too deep",
      }),
    ).rejects.toThrow(/depth limit/i);

    await expect(
      (
        createSubTask as unknown as (
          ctx: unknown,
          args: unknown,
        ) => Promise<any>
      )(ctx, {
        workspaceSlug: "acme",
        boardId: "board_1",
        parentId: parent.cardId,
        title: "Wrong type",
        typeKey: "core.todo",
      }),
    ).rejects.toThrow(/not allowed/i);
  });

  it("creates board types from trusted enabled templates", async () => {
    const db = createBaseDb();
    const ctx = createMockCtx({ db });

    const result = await (
      createBoardType as unknown as (
        ctx: unknown,
        args: unknown,
      ) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      name: "Tasks",
      templateRef: {
        pluginId: "task-board",
        templateId: "task-board:default",
        version: 1,
      },
    });

    expect(
      db.rows("boardTypes").find((row) => row._id === result.boardTypeId),
    ).toMatchObject({
      name: "Tasks",
      defaultViewIds: ["task-board:board"],
      defaultCardTypeKey: taskCardManifest.typeKey,
      templateSource: {
        pluginId: "task-board",
        templateId: "task-board:default",
        version: 1,
      },
    });

    const board = await (
      createBoard as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      name: "Tasks",
      boardTypeId: result.boardTypeId,
    });
    const card = await (
      createCard as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: board.boardId,
      title: "Shared card",
      typeKey: "core.todo",
    });
    const boardPage = await (
      getBoardPage as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: board.boardId,
    });

    expect(
      db
        .rows("boardViews")
        .filter((view) => view.boardId === board.boardId)
        .map((view) => ({ viewId: view.viewId, isDefault: view.isDefault })),
    ).toEqual([{ viewId: "task-board:board", isDefault: true }]);
    expect(boardPage.views.map((view: any) => view.viewId)).toEqual([
      "task-board:board",
    ]);
    expect(boardPage.cards.map((entry: any) => entry.id)).toEqual([
      card.cardId,
    ]);

    await (
      addBoardView as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: board.boardId,
      definitionViewId: "core-kanban:board",
      instanceMode: "shared",
    });
    const boardPageWithKanban = await (
      getBoardPage as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: board.boardId,
    });

    expect(boardPageWithKanban.views.map((view: any) => view.viewId)).toEqual([
      "task-board:board",
      "core-kanban:board",
    ]);
    expect(boardPageWithKanban.views.at(-1)?.featureInstance).toMatchObject({
      schemaVersion: 1,
      kind: "view",
      pluginPackageId: "core-kanban",
      featureId: "core-kanban:board",
      instanceMode: "shared",
    });
    expect(
      db
        .rows("boardViews")
        .find((view) => view.definitionViewId === "core-kanban:board")
        ?.featureInstance,
    ).toMatchObject({
      schemaVersion: 1,
      kind: "view",
      pluginPackageId: "core-kanban",
      featureId: "core-kanban:board",
      instanceMode: "shared",
    });
    expect(boardPageWithKanban.cards.map((entry: any) => entry.id)).toEqual([
      card.cardId,
    ]);
  });

  it("creates calendar board templates and seeds only the calendar view", async () => {
    const db = createBaseDb();
    const ctx = createMockCtx({ db });

    const boardType = await (
      createBoardType as unknown as (
        ctx: unknown,
        args: unknown,
      ) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      name: "Calendar",
      templateRef: {
        pluginId: "calendar-board",
        templateId: "calendar-board:default",
        version: 1,
      },
    });
    const board = await (
      createBoard as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      name: "Calendar",
      boardTypeId: boardType.boardTypeId,
    });

    const boardViews = db
      .rows("boardViews")
      .filter((view) => view.boardId === board.boardId)
      .map((view) => ({
        viewId: view.viewId,
        isDefault: view.isDefault,
        featureInstance: view.featureInstance,
      }));

    expect(boardViews).toEqual([
      {
        viewId: "calendar-board:month",
        isDefault: true,
        featureInstance: expect.objectContaining({
          schemaVersion: 1,
          kind: "view",
          pluginPackageId: "calendar-board",
          featureId: "calendar-board:month",
          instanceMode: "shared",
        }),
      },
    ]);
  });

  it("renames boards and deletes their board-scoped data", async () => {
    const db = createBaseDb();
    const ctx = createMockCtx({ db });

    await (
      renameBoard as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      name: "Roadmap",
    });
    expect(
      db.rows("boards").find((board) => board._id === "board_1"),
    ).toMatchObject({
      name: "Roadmap",
    });

    const card = await (
      createCard as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      title: "Delete me with board",
      typeKey: "core.todo",
    });
    await (
      addBoardView as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      definitionViewId: "core-kanban:board",
      instanceMode: "shared",
    });

    await (
      deleteBoard as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
    });

    expect(db.rows("boards").some((board) => board._id === "board_1")).toBe(
      false,
    );
    expect(db.rows("cards").some((row) => row._id === card.cardId)).toBe(false);
    expect(
      db.rows("boardViews").some((view) => view.boardId === "board_1"),
    ).toBe(false);
  });
});

describe("workspace and search functions", () => {
  function addWorkspaceMember(
    db: MockConvexDb,
    {
      createdAt,
      email,
      id,
      role,
      userId,
    }: {
      createdAt: number;
      email: string;
      id: string;
      role: WorkspaceRole;
      userId: string;
    },
  ) {
    db.rows("workspaceMembers").push({
      _id: id,
      workspaceId: "workspace_1",
      userId,
      email,
      role,
      createdAt,
    });
  }

  it("creates invites with normalized email and exposes pending invites in workspace overview", async () => {
    const db = createBaseDb();
    const ownerCtx = createMockCtx({ db });

    const invite = await (
      createInvite as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ownerCtx, {
      workspaceSlug: "acme",
      email: "teammate@example.com",
      role: "member",
    });

    expect(db.rows("workspaceInvites")[0]).toMatchObject({
      email: "teammate@example.com",
      emailNormalized: "teammate@example.com",
      role: "member",
      token: invite.token,
    });
    expect(
      Number(db.rows("workspaceInvites")[0]?.expiresAt ?? 0),
    ).toBeGreaterThan(Number(db.rows("workspaceInvites")[0]?.createdAt ?? 0));

    const overview = await (
      getOverview as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ownerCtx, {
      workspaceSlug: "acme",
    });

    expect(overview.pendingInvites).toEqual([
      expect.objectContaining({
        email: "teammate@example.com",
        role: "member",
      }),
    ]);
  });

  it("accepts matching invites into the workspace", async () => {
    const db = createBaseDb();
    const ownerCtx = createMockCtx({ db });

    const invite = await (
      createInvite as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ownerCtx, {
      workspaceSlug: "acme",
      email: "teammate@example.com",
      role: "member",
    });

    const memberCtx = createMockCtx({
      db,
      email: "teammate@example.com",
      tokenIdentifier: "user_2",
    });

    const accepted = await (
      acceptInvite as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(memberCtx, {
      token: invite.token,
    });

    expect(accepted.workspaceSlug).toBe("acme");
    expect(
      db.rows("workspaceMembers").find((member) => member.userId === "user_2"),
    ).toMatchObject({
      email: "teammate@example.com",
      role: "member",
    });
    expect(db.rows("workspaceInvites")[0]).toMatchObject({
      acceptedByUserId: "user_2",
    });
  });

  it("rejects invite acceptance when the email does not match", async () => {
    const db = createBaseDb();
    const ownerCtx = createMockCtx({ db });

    const invite = await (
      createInvite as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ownerCtx, {
      workspaceSlug: "acme",
      email: "teammate@example.com",
      role: "member",
    });

    const otherUserCtx = createMockCtx({
      db,
      email: "other@example.com",
      tokenIdentifier: "user_2",
    });

    await expect(
      (
        acceptInvite as unknown as (ctx: unknown, args: unknown) => Promise<any>
      )(otherUserCtx, { token: invite.token }),
    ).rejects.toThrow(/different email/i);
  });

  it("rejects expired, revoked, and already accepted invites", async () => {
    const db = createBaseDb();

    db.rows("workspaceInvites").push(
      {
        _id: "invite_expired",
        workspaceId: "workspace_1",
        email: "expired@example.com",
        emailNormalized: "expired@example.com",
        role: "member",
        token: "expired-token",
        createdBy: "user_1",
        createdAt: 1,
        expiresAt: 2,
      },
      {
        _id: "invite_revoked",
        workspaceId: "workspace_1",
        email: "revoked@example.com",
        emailNormalized: "revoked@example.com",
        role: "member",
        token: "revoked-token",
        createdBy: "user_1",
        createdAt: 1,
        expiresAt: Date.now() + 10_000,
        revokedAt: 2,
        revokedBy: "user_1",
      },
      {
        _id: "invite_used",
        workspaceId: "workspace_1",
        email: "used@example.com",
        emailNormalized: "used@example.com",
        role: "member",
        token: "used-token",
        createdBy: "user_1",
        createdAt: 1,
        expiresAt: Date.now() + 10_000,
        acceptedAt: 2,
        acceptedByUserId: "user_2",
      },
    );

    const ctx = createMockCtx({
      db,
      email: "expired@example.com",
      tokenIdentifier: "user_2",
    });

    await expect(
      (
        acceptInvite as unknown as (ctx: unknown, args: unknown) => Promise<any>
      )(ctx, { token: "expired-token" }),
    ).rejects.toThrow(/expired/i);

    await expect(
      (
        acceptInvite as unknown as (ctx: unknown, args: unknown) => Promise<any>
      )(
        createMockCtx({
          db,
          email: "revoked@example.com",
          tokenIdentifier: "user_2",
        }),
        { token: "revoked-token" },
      ),
    ).rejects.toThrow(/revoked/i);

    await expect(
      (
        acceptInvite as unknown as (ctx: unknown, args: unknown) => Promise<any>
      )(
        createMockCtx({
          db,
          email: "used@example.com",
          tokenIdentifier: "user_2",
        }),
        { token: "used-token" },
      ),
    ).rejects.toThrow(/already been used/i);
  });

  it("revokes an existing pending invite when resending", async () => {
    const db = createBaseDb();
    const ownerCtx = createMockCtx({ db });

    const firstInvite = await (
      createInvite as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ownerCtx, {
      workspaceSlug: "acme",
      email: "teammate@example.com",
      role: "member",
    });

    const secondInvite = await (
      resendInvite as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ownerCtx, {
      workspaceSlug: "acme",
      inviteId: firstInvite.inviteId,
    });

    const invites = db.rows("workspaceInvites");
    expect(firstInvite.token).not.toBe(secondInvite.token);
    expect(
      invites.find((invite) => invite._id === firstInvite.inviteId),
    ).toMatchObject({
      revokedAt: expect.any(Number),
      revokedBy: "user_1",
    });
    expect(
      invites.find((invite) => invite._id === secondInvite.inviteId),
    ).toMatchObject({
      email: "teammate@example.com",
    });
    expect(
      invites.find((invite) => invite._id === secondInvite.inviteId),
    ).not.toHaveProperty("revokedAt");
  });

  it("lets admins invite members but not admins", async () => {
    const db = createBaseDb();
    addWorkspaceMember(db, {
      id: "member_admin",
      userId: "user_admin",
      email: "admin@example.com",
      role: "admin",
      createdAt: 2,
    });
    const adminCtx = createMockCtx({
      db,
      email: "admin@example.com",
      tokenIdentifier: "user_admin",
    });

    await expect(
      (
        createInvite as unknown as (ctx: unknown, args: unknown) => Promise<any>
      )(adminCtx, {
        workspaceSlug: "acme",
        email: "member-invite@example.com",
        role: "member",
      }),
    ).resolves.toMatchObject({
      inviteId: expect.any(String),
    });

    await expect(
      (
        createInvite as unknown as (ctx: unknown, args: unknown) => Promise<any>
      )(adminCtx, {
        workspaceSlug: "acme",
        email: "admin-invite@example.com",
        role: "admin",
      }),
    ).rejects.toThrow(/only workspace owners/i);
  });

  it("enforces role update permissions for owners only", async () => {
    const db = createBaseDb();
    addWorkspaceMember(db, {
      id: "member_admin",
      userId: "user_admin",
      email: "admin@example.com",
      role: "admin",
      createdAt: 2,
    });
    addWorkspaceMember(db, {
      id: "member_member",
      userId: "user_member",
      email: "member@example.com",
      role: "member",
      createdAt: 3,
    });
    addWorkspaceMember(db, {
      id: "member_admin_2",
      userId: "user_admin_2",
      email: "admin2@example.com",
      role: "admin",
      createdAt: 4,
    });
    addWorkspaceMember(db, {
      id: "member_admin_2",
      userId: "user_admin_2",
      email: "admin2@example.com",
      role: "admin",
      createdAt: 4,
    });

    const ownerCtx = createMockCtx({ db });
    const adminCtx = createMockCtx({
      db,
      email: "admin@example.com",
      tokenIdentifier: "user_admin",
    });

    await (
      updateMemberRole as unknown as (
        ctx: unknown,
        args: unknown,
      ) => Promise<any>
    )(ownerCtx, {
      workspaceSlug: "acme",
      memberId: "member_member",
      role: "admin",
    });

    expect(
      db
        .rows("workspaceMembers")
        .find((member) => member._id === "member_member"),
    ).toMatchObject({
      role: "admin",
    });

    await expect(
      (
        updateMemberRole as unknown as (
          ctx: unknown,
          args: unknown,
        ) => Promise<any>
      )(adminCtx, {
        workspaceSlug: "acme",
        memberId: "member_member",
        role: "member",
      }),
    ).rejects.toThrow(/only workspace owners/i);
  });

  it("enforces member removal permissions for owners and admins", async () => {
    const db = createBaseDb();
    addWorkspaceMember(db, {
      id: "member_admin",
      userId: "user_admin",
      email: "admin@example.com",
      role: "admin",
      createdAt: 2,
    });
    addWorkspaceMember(db, {
      id: "member_member",
      userId: "user_member",
      email: "member@example.com",
      role: "member",
      createdAt: 3,
    });
    addWorkspaceMember(db, {
      id: "member_admin_2",
      userId: "user_admin_2",
      email: "admin2@example.com",
      role: "admin",
      createdAt: 4,
    });

    await (
      removeMember as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(
      createMockCtx({
        db,
        email: "admin@example.com",
        tokenIdentifier: "user_admin",
      }),
      {
        workspaceSlug: "acme",
        memberId: "member_member",
      },
    );

    expect(
      db
        .rows("workspaceMembers")
        .some((member) => member._id === "member_member"),
    ).toBe(false);

    await expect(
      (
        removeMember as unknown as (ctx: unknown, args: unknown) => Promise<any>
      )(
        createMockCtx({
          db,
          email: "admin@example.com",
          tokenIdentifier: "user_admin",
        }),
        {
          workspaceSlug: "acme",
          memberId: "member_admin_2",
        },
      ),
    ).rejects.toThrow(/do not have permission/i);
  });

  it("backfills legacy pending invite metadata", async () => {
    const db = createBaseDb();
    db.rows("workspaceInvites").push({
      _id: "invite_legacy",
      workspaceId: "workspace_1",
      email: "Legacy@example.com ",
      role: "member",
      token: "legacy-token",
      createdBy: "user_1",
      createdAt: 5,
    });

    const result = await (
      backfillInviteMetadata as unknown as (
        ctx: unknown,
        args: unknown,
      ) => Promise<any>
    )(createMockCtx({ db }), {
      workspaceSlug: "acme",
    });

    expect(result).toMatchObject({
      invitesPatched: 1,
    });
    expect(db.rows("workspaceInvites")[0]).toMatchObject({
      emailNormalized: "legacy@example.com",
      expiresAt: 5 + 7 * 24 * 60 * 60 * 1000,
    });
  });

  it("can revoke a pending member invite", async () => {
    const db = createBaseDb();
    const ownerCtx = createMockCtx({ db });

    const invite = await (
      createInvite as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ownerCtx, {
      workspaceSlug: "acme",
      email: "teammate@example.com",
      role: "member",
    });

    await (
      revokeInvite as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ownerCtx, {
      workspaceSlug: "acme",
      inviteId: invite.inviteId,
    });

    expect(
      db.rows("workspaceInvites").find((row) => row._id === invite.inviteId),
    ).toMatchObject({
      revokedAt: expect.any(Number),
      revokedBy: "user_1",
    });
  });

  it("searches card titles within a board", async () => {
    const db = createBaseDb();
    db.rows("cards").push(
      {
        _id: "card_1",
        workspaceId: "workspace_1",
        boardId: "board_1",
        typeKey: "core.todo",
        typeSchemaVersion: 1,
        meta: { title: "Ship core kanban plugin" },
        statusKey: "backlog",
        orderKey: createKeyAfter(),
        fields: { core: {}, custom: {} },
        relations: [],
        tagIds: [],
        body: {
          type: "blocknote",
          content: [{ id: "paragraph-1", type: "paragraph" }],
        },
        createdAt: 1,
        updatedAt: 1,
        createdBy: "user_1",
      },
      {
        _id: "card_2",
        workspaceId: "workspace_1",
        boardId: "board_1",
        typeKey: "core.todo",
        typeSchemaVersion: 1,
        meta: { title: "Invite teammate" },
        statusKey: "backlog",
        orderKey: createKeyAfter(createKeyAfter()),
        fields: { core: {}, custom: {} },
        relations: [],
        tagIds: [],
        body: {
          type: "blocknote",
          content: [{ id: "paragraph-2", type: "paragraph" }],
        },
        createdAt: 1,
        updatedAt: 1,
        createdBy: "user_1",
      },
    );
    const ctx = createMockCtx({ db });

    const results = await (
      searchBoardTitles as unknown as (
        ctx: unknown,
        args: unknown,
      ) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      term: "plugin",
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.title).toBe("Ship core kanban plugin");
  });

  it("manages directed relations and derives incoming links across boards", async () => {
    const db = createBaseDb();
    db.rows("boards").push({
      _id: "board_2",
      workspaceId: "workspace_1",
      boardTypeId: "boardType_1",
      name: "Ops board",
      slug: "ops-board",
      createdBy: "user_1",
      createdAt: 1,
      updatedAt: 1,
    });
    db.rows("cards").push(
      {
        _id: "card_1",
        workspaceId: "workspace_1",
        boardId: "board_1",
        typeKey: "core.todo",
        typeSchemaVersion: 1,
        meta: { title: "Ship phase 5" },
        statusKey: "backlog",
        orderKey: createKeyAfter(),
        fields: { core: {}, custom: {} },
        relations: [],
        tagIds: [],
        body: {
          type: "blocknote",
          content: [{ id: "paragraph-1", type: "paragraph" }],
        },
        createdAt: 1,
        updatedAt: 1,
        createdBy: "user_1",
      },
      {
        _id: "card_2",
        workspaceId: "workspace_1",
        boardId: "board_2",
        typeKey: "core.todo",
        typeSchemaVersion: 1,
        meta: { title: "Unblock release" },
        statusKey: "backlog",
        orderKey: createKeyAfter(createKeyAfter()),
        fields: { core: {}, custom: {} },
        relations: [],
        tagIds: [],
        body: {
          type: "blocknote",
          content: [{ id: "paragraph-2", type: "paragraph" }],
        },
        createdAt: 1,
        updatedAt: 1,
        createdBy: "user_1",
      },
    );
    const ctx = createMockCtx({ db });

    await (
      addCardRelation as unknown as (
        ctx: unknown,
        args: unknown,
      ) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      cardId: "card_1",
      type: "blocked_by",
      targetCardId: "card_2",
    });

    expect(db.rows("cards")[0]?.relations).toEqual([
      {
        type: "blocked_by",
        targetCardId: "card_2",
      },
    ]);

    const outgoing = await (
      getCardRelations as unknown as (
        ctx: unknown,
        args: unknown,
      ) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      cardId: "card_1",
    });
    expect(outgoing.outgoing).toEqual([
      expect.objectContaining({
        type: "blocked_by",
        displayType: "blocked by",
        cardId: "card_2",
        boardId: "board_2",
        boardName: "Ops board",
        title: "Unblock release",
      }),
    ]);

    db.rows("cards")[0]!.relations = [];
    const projectedOnlyOutgoing = await (
      getCardRelations as unknown as (
        ctx: unknown,
        args: unknown,
      ) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      cardId: "card_1",
    });
    expect(projectedOnlyOutgoing.outgoing).toHaveLength(1);

    const incoming = await (
      getCardRelations as unknown as (
        ctx: unknown,
        args: unknown,
      ) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_2",
      cardId: "card_2",
    });
    expect(incoming.incoming).toEqual([
      expect.objectContaining({
        type: "blocked_by",
        displayType: "blocks",
        cardId: "card_1",
        boardId: "board_1",
        boardName: "Team board",
        title: "Ship phase 5",
      }),
    ]);

    await (
      removeCardRelation as unknown as (
        ctx: unknown,
        args: unknown,
      ) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      cardId: "card_1",
      type: "blocked_by",
      targetCardId: "card_2",
    });

    expect(db.rows("cards")[0]?.relations).toEqual([]);
  });

  it("searches card titles across boards in the workspace", async () => {
    const db = createBaseDb();
    db.rows("boards").push({
      _id: "board_2",
      workspaceId: "workspace_1",
      boardTypeId: "boardType_1",
      name: "Ops board",
      slug: "ops-board",
      createdBy: "user_1",
      createdAt: 1,
      updatedAt: 1,
    });
    db.rows("cards").push(
      {
        _id: "card_1",
        workspaceId: "workspace_1",
        boardId: "board_1",
        typeKey: "core.todo",
        typeSchemaVersion: 1,
        meta: { title: "Ship phase 5" },
        statusKey: "backlog",
        orderKey: createKeyAfter(),
        fields: { core: {}, custom: {} },
        relations: [],
        tagIds: [],
        body: {
          type: "blocknote",
          content: [{ id: "paragraph-1", type: "paragraph" }],
        },
        createdAt: 1,
        updatedAt: 1,
        createdBy: "user_1",
      },
      {
        _id: "card_2",
        workspaceId: "workspace_1",
        boardId: "board_2",
        typeKey: "core.todo",
        typeSchemaVersion: 1,
        meta: { title: "Ship launch checklist" },
        statusKey: "backlog",
        orderKey: createKeyAfter(createKeyAfter()),
        fields: { core: {}, custom: {} },
        relations: [],
        tagIds: [],
        body: {
          type: "blocknote",
          content: [{ id: "paragraph-2", type: "paragraph" }],
        },
        createdAt: 1,
        updatedAt: 1,
        createdBy: "user_1",
      },
    );
    const ctx = createMockCtx({ db });

    const results = await (
      searchWorkspaceCardTitles as unknown as (
        ctx: unknown,
        args: unknown,
      ) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      term: "ship",
      excludeCardId: "card_1",
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: "card_2",
      title: "Ship launch checklist",
      boardId: "board_2",
      boardName: "Ops board",
    });
  });

  it("removes incoming relations when deleting a target card", async () => {
    const db = createBaseDb();
    db.rows("cards").push(
      {
        _id: "card_1",
        workspaceId: "workspace_1",
        boardId: "board_1",
        typeKey: "core.todo",
        typeSchemaVersion: 1,
        meta: { title: "Ship phase 5" },
        statusKey: "backlog",
        orderKey: createKeyAfter(),
        fields: { core: {}, custom: {} },
        relations: [
          {
            type: "references",
            targetCardId: "card_2",
          },
        ],
        tagIds: [],
        body: {
          type: "blocknote",
          content: [{ id: "paragraph-1", type: "paragraph" }],
        },
        createdAt: 1,
        updatedAt: 1,
        createdBy: "user_1",
      },
      {
        _id: "card_2",
        workspaceId: "workspace_1",
        boardId: "board_1",
        typeKey: "core.todo",
        typeSchemaVersion: 1,
        meta: { title: "Reference target" },
        statusKey: "backlog",
        orderKey: createKeyAfter(createKeyAfter()),
        fields: { core: {}, custom: {} },
        relations: [],
        tagIds: [],
        body: {
          type: "blocknote",
          content: [{ id: "paragraph-2", type: "paragraph" }],
        },
        createdAt: 1,
        updatedAt: 1,
        createdBy: "user_1",
      },
    );
    const ctx = createMockCtx({ db });

    await (
      deleteCard as unknown as (ctx: unknown, args: unknown) => Promise<any>
    )(ctx, {
      workspaceSlug: "acme",
      boardId: "board_1",
      cardId: "card_2",
    });

    expect(db.rows("cards")).toHaveLength(1);
    expect(db.rows("cards")[0]?.relations).toEqual([]);
  });
});
