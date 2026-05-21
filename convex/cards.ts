import { createKeyAfter, createKeyBetween, extractBodyMentions } from "@plank/domain";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getCurrentUserId, requireWorkspaceAccessBySlug } from "./lib/auth";
import {
  emitCardEvent,
  getBoardViewScopeId,
  resolveBoardViewInstance,
} from "./lib/plugins";
import { validateHierarchy } from "./lib/cards";
import {
  buildCoreAndCustomSchema,
  buildDefaultCoreFields,
  buildUpdateCardState,
  createCardWithSideEffects,
  emitUpdateCardEvents,
  ensureTagIdsBelongToWorkspace,
  getCardScopeOrDefault,
  getIncomingRelationLabel,
  getOutgoingRelationLabel,
  isValidBody,
  loadCustomFieldSchema,
  relationTypeValidator,
  removeIncomingRelationsToCard,
  requireBoardWithType,
  requireCardInBoard,
  resolveRegistryType,
  resolveStatusAndColumn,
  sortByOrderKey,
  validateAndSplitPropertyUpdates,
} from "./lib/cardRuntime";
import {
  getBodyMentionMessage,
  insertMentionNotifications,
} from "./features/collaboration/mentions";
import { cleanupDeletedCardCollaboration } from "./features/collaboration/cleanup";

export const markCardSeen = mutation({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
    cardId: v.id("cards"),
    seenAt: v.number(),
  },
  handler: async (ctx, args) => {
    const { workspace, userId } = await requireWorkspaceAccessBySlug(
      ctx,
      args.workspaceSlug,
    );
    const card = await requireCardInBoard({
      ctx,
      workspaceId: workspace._id,
      boardId: args.boardId,
      cardId: args.cardId,
    });

    const existing = await ctx.db
      .query("cardSeenStates")
      .withIndex("by_workspace_and_board_and_user_and_card", (query) =>
        query
          .eq("workspaceId", workspace._id)
          .eq("boardId", args.boardId)
          .eq("userId", userId)
          .eq("cardId", card._id),
      )
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        seenAt: Math.max(existing.seenAt, args.seenAt),
      });
    } else {
      await ctx.db.insert("cardSeenStates", {
        workspaceId: workspace._id,
        boardId: args.boardId,
        cardId: card._id,
        userId,
        seenAt: args.seenAt,
      });
    }

    return { ok: true };
  },
});

export const generateCardUploadUrl = mutation({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccessBySlug(
      ctx,
      args.workspaceSlug,
    );
    const board = await ctx.db.get(args.boardId);
    if (!board || board.workspaceId !== workspace._id) {
      throw new Error("Board not found");
    }
    const uploadUrl = await ctx.storage.generateUploadUrl();
    return { uploadUrl };
  },
});

export const resolveCardFileUrl = query({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccessBySlug(
      ctx,
      args.workspaceSlug,
    );
    const board = await ctx.db.get(args.boardId);
    if (!board || board.workspaceId !== workspace._id) {
      throw new Error("Board not found");
    }
    const url = await ctx.storage.getUrl(args.storageId);
    return { url };
  },
});

export const createCard = mutation({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
    viewInstanceId: v.optional(v.string()),
    title: v.string(),
    parentId: v.optional(v.id("cards")),
    typeKey: v.optional(v.string()),
    statusKey: v.optional(v.string()),
    columnId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccessBySlug(
      ctx,
      args.workspaceSlug,
    );
    const userId = await getCurrentUserId(ctx);
    const { board, boardType } = await requireBoardWithType({
      ctx,
      workspaceId: workspace._id,
      boardId: args.boardId,
    });
    const boardViews = await ctx.db
      .query("boardViews")
      .withIndex("by_board", (query) => query.eq("boardId", board._id))
      .collect();
    const activeView = resolveBoardViewInstance({
      requestedViewId: args.viewInstanceId,
      views: boardViews,
    });
    if (!args.typeKey) {
      throw new Error("typeKey is required");
    }

    const registry = await resolveRegistryType({
      ctx,
      workspaceId: workspace._id,
      requestedTypeKey: args.typeKey,
    });
    await validateHierarchy(ctx, {
      workspaceId: workspace._id,
      boardId: board._id,
      parentId: args.parentId,
      childTypeKey: registry.typeKey,
    });

    const { statusKey, columnId } = await resolveStatusAndColumn({
      board,
      boardType,
      requestedStatusKey: args.statusKey,
      requestedColumnId: args.columnId,
    });

    const cardsInStatus = await ctx.db
      .query("cards")
      .withIndex("by_board_status", (query) =>
        query.eq("boardId", board._id).eq("statusKey", statusKey),
      )
      .collect();
    const activeScopeId = activeView ? getBoardViewScopeId(activeView) : undefined;
    const orderKey = createKeyAfter(
      sortByOrderKey(
        activeScopeId
          ? cardsInStatus.filter(
              (card) => getCardScopeOrDefault(card) === activeScopeId,
            )
          : cardsInStatus,
      ).at(-1)?.orderKey,
    );
    const defaultCore = buildDefaultCoreFields(registry);
    return await createCardWithSideEffects({
      ctx,
      workspaceId: workspace._id,
      boardId: board._id,
      scopeId: activeScopeId,
      parentId: args.parentId,
      typeKey: registry.typeKey,
      typeSchemaVersion: registry.schemaVersion,
      title: args.title,
      statusKey,
      columnId,
      orderKey,
      defaultCore,
      userId,
    });
  },
});

export const createSubTask = mutation({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
    parentId: v.id("cards"),
    title: v.string(),
    typeKey: v.optional(v.string()),
    statusKey: v.optional(v.string()),
    columnId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccessBySlug(
      ctx,
      args.workspaceSlug,
    );
    const userId = await getCurrentUserId(ctx);
    const { board, boardType } = await requireBoardWithType({
      ctx,
      workspaceId: workspace._id,
      boardId: args.boardId,
    });
    const parent = await ctx.db.get(args.parentId);
    if (
      !parent ||
      parent.workspaceId !== workspace._id ||
      parent.boardId !== board._id
    ) {
      throw new Error("Parent card not found");
    }

    const registry = await resolveRegistryType({
      ctx,
      workspaceId: workspace._id,
      requestedTypeKey: args.typeKey ?? parent.typeKey,
    });
    await validateHierarchy(ctx, {
      workspaceId: workspace._id,
      boardId: board._id,
      parentId: parent._id,
      childTypeKey: registry.typeKey,
    });

    const { statusKey, columnId } = await resolveStatusAndColumn({
      board,
      boardType,
      requestedStatusKey: args.statusKey,
      requestedColumnId: args.columnId,
    });
    const siblingSubtasks = await ctx.db
      .query("cards")
      .withIndex("by_board_parent", (query) =>
        query.eq("boardId", board._id).eq("parentId", parent._id),
      )
      .collect();
    const orderKey = createKeyAfter(
      sortByOrderKey(
        siblingSubtasks.filter(
          (candidate) =>
            getCardScopeOrDefault(candidate) === getCardScopeOrDefault(parent),
        ),
      ).at(-1)?.orderKey,
    );
    const defaultCore = buildDefaultCoreFields(registry);
    return await createCardWithSideEffects({
      ctx,
      workspaceId: workspace._id,
      boardId: board._id,
      scopeId: getCardScopeOrDefault(parent),
      parentId: parent._id,
      typeKey: registry.typeKey,
      typeSchemaVersion: registry.schemaVersion,
      title: args.title,
      statusKey,
      columnId,
      orderKey,
      defaultCore,
      userId,
    });
  },
});

export const listSubTasks = query({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
    parentId: v.union(v.id("cards"), v.null()),
  },
  handler: async (ctx, args) => {
    if (!args.parentId) {
      return [];
    }
    const { workspace } = await requireWorkspaceAccessBySlug(
      ctx,
      args.workspaceSlug,
    );
    const parent = await ctx.db.get(args.parentId);
    if (
      !parent ||
      parent.workspaceId !== workspace._id ||
      parent.boardId !== args.boardId
    ) {
      return [];
    }

    const subtasks = await ctx.db
      .query("cards")
      .withIndex("by_board_parent", (query) =>
        query.eq("boardId", args.boardId).eq("parentId", parent._id),
      )
      .collect();

    return sortByOrderKey(
      subtasks.filter(
        (candidate) =>
          getCardScopeOrDefault(candidate) === getCardScopeOrDefault(parent),
      ),
    ).map((card) => ({
      id: card._id,
      boardId: card.boardId,
      scopeId: getCardScopeOrDefault(card),
      typeKey: card.typeKey,
      parentId: card.parentId ?? null,
      typeSchemaVersion: card.typeSchemaVersion,
      title: card.meta.title,
      meta: card.meta,
      statusKey: card.statusKey,
      orderKey: card.orderKey,
      properties: { ...card.fields.core, ...card.fields.custom },
      fields: card.fields,
      relations: card.relations,
      tagIds: card.tagIds,
      body: card.body,
      createdBy: card.createdBy,
      createdAt: card.createdAt,
      updatedAt: card.updatedAt,
    }));
  },
});

export const getCardRelations = query({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
    cardId: v.id("cards"),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccessBySlug(
      ctx,
      args.workspaceSlug,
    );
    await requireBoardWithType({
      ctx,
      workspaceId: workspace._id,
      boardId: args.boardId,
    });
    const card = await ctx.db.get(args.cardId);
    if (
      !card ||
      card.workspaceId !== workspace._id ||
      card.boardId !== args.boardId
    ) {
      return { outgoing: [], incoming: [] };
    }

    const outgoing = await Promise.all(
      card.relations.map(async (relation) => {
        const targetCard = await ctx.db.get(relation.targetCardId);
        if (!targetCard || targetCard.workspaceId !== workspace._id) {
          return null;
        }
        const targetBoard = await ctx.db.get(targetCard.boardId);
        return {
          direction: "outgoing" as const,
          type: relation.type,
          displayType: getOutgoingRelationLabel(relation.type),
          cardId: targetCard._id,
          boardId: targetCard.boardId,
          boardName: targetBoard?.name ?? "Board",
          title: targetCard.meta.title,
          statusKey: targetCard.statusKey,
        };
      }),
    );

    const workspaceCards = await ctx.db
      .query("cards")
      .withIndex("by_workspace", (query) =>
        query.eq("workspaceId", workspace._id),
      )
      .collect();
    const sourceBoardIds = new Set<string>();
    const incomingEdges = workspaceCards.flatMap((candidate) =>
      candidate.relations
        .filter((relation) => relation.targetCardId === card._id)
        .map((relation) => {
          sourceBoardIds.add(candidate.boardId);
          return {
            source: candidate,
            type: relation.type,
          };
        }),
    );
    const boardNames = new Map<string, string>();
    for (const sourceBoardId of sourceBoardIds) {
      const board = await ctx.db.get(sourceBoardId as Id<"boards">);
      if (board && board.workspaceId === workspace._id) {
        boardNames.set(sourceBoardId, board.name);
      }
    }

    return {
      outgoing: outgoing.filter(Boolean),
      incoming: incomingEdges.map(({ source, type }) => ({
        direction: "incoming" as const,
        type,
        displayType: getIncomingRelationLabel(type),
        cardId: source._id,
        boardId: source.boardId,
        boardName: boardNames.get(source.boardId) ?? "Board",
        title: source.meta.title,
        statusKey: source.statusKey,
      })),
    };
  },
});

export const addCardRelation = mutation({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
    cardId: v.id("cards"),
    type: relationTypeValidator,
    targetCardId: v.id("cards"),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccessBySlug(
      ctx,
      args.workspaceSlug,
    );
    const card = await requireCardInBoard({
      ctx,
      workspaceId: workspace._id,
      boardId: args.boardId,
      cardId: args.cardId,
    });
    const targetCard = await ctx.db.get(args.targetCardId);
    if (!targetCard || targetCard.workspaceId !== workspace._id) {
      throw new Error("Target card not found");
    }
    if (targetCard._id === card._id) {
      throw new Error("A card cannot relate to itself");
    }

    const duplicate = card.relations.some(
      (relation) =>
        relation.type === args.type &&
        relation.targetCardId === args.targetCardId,
    );
    if (duplicate) {
      return { ok: true };
    }

    await ctx.db.patch(card._id, {
      relations: [
        ...card.relations,
        {
          type: args.type,
          targetCardId: args.targetCardId,
        },
      ],
      updatedAt: Date.now(),
    });

    return { ok: true };
  },
});

export const removeCardRelation = mutation({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
    cardId: v.id("cards"),
    type: relationTypeValidator,
    targetCardId: v.id("cards"),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccessBySlug(
      ctx,
      args.workspaceSlug,
    );
    const card = await requireCardInBoard({
      ctx,
      workspaceId: workspace._id,
      boardId: args.boardId,
      cardId: args.cardId,
    });

    await ctx.db.patch(card._id, {
      relations: card.relations.filter(
        (relation) =>
          !(
            relation.type === args.type &&
            relation.targetCardId === args.targetCardId
          ),
      ),
      updatedAt: Date.now(),
    });

    return { ok: true };
  },
});

export const moveCard = mutation({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
    cardId: v.id("cards"),
    statusKey: v.optional(v.string()),
    columnId: v.optional(v.string()),
    previousOrderKey: v.optional(v.string()),
    nextOrderKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccessBySlug(
      ctx,
      args.workspaceSlug,
    );
    const userId = await getCurrentUserId(ctx);
    const { board, boardType } = await requireBoardWithType({
      ctx,
      workspaceId: workspace._id,
      boardId: args.boardId,
    });

    const card = await ctx.db.get(args.cardId);
    if (
      !card ||
      card.workspaceId !== workspace._id ||
      card.boardId !== board._id
    ) {
      throw new Error("Card not found");
    }

    const { statusKey, columnId } = await resolveStatusAndColumn({
      board,
      boardType,
      requestedStatusKey: args.statusKey,
      requestedColumnId: args.columnId,
    });

    const orderKey = createKeyBetween(args.previousOrderKey, args.nextOrderKey);
    const statusChanged = statusKey !== card.statusKey;

    await ctx.db.patch(card._id, {
      statusKey,
      orderKey,
      updatedAt: Date.now(),
    });

    if (statusChanged) {
      await emitCardEvent(ctx, workspace._id, {
        name: "card.moved",
        actorId: userId,
        boardId: card.boardId,
        cardId: card._id,
        statusKey,
        previousStatusKey: card.statusKey,
        nextStatusKey: statusKey,
        cardTypeId: card.typeKey,
        tagIds: card.tagIds,
        previousColumnId: card.statusKey,
        nextColumnId: columnId,
        workspaceId: workspace._id,
      });
    }

    return { cardId: card._id };
  },
});

export const updateCard = mutation({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
    cardId: v.id("cards"),
    title: v.optional(v.string()),
    body: v.optional(v.any()),
    baseUpdatedAt: v.optional(v.number()),
    propertyUpdates: v.optional(v.record(v.string(), v.any())),
    tagIds: v.optional(v.array(v.id("tagDefinitions"))),
    statusKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccessBySlug(
      ctx,
      args.workspaceSlug,
    );
    const userId = await getCurrentUserId(ctx);
    const { board, boardType } = await requireBoardWithType({
      ctx,
      workspaceId: workspace._id,
      boardId: args.boardId,
    });
    const card = await requireCardInBoard({
      ctx,
      workspaceId: workspace._id,
      boardId: board._id,
      cardId: args.cardId,
    });

    const registry = await ctx.db
      .query("cardTypeRegistry")
      .withIndex("by_workspace_type_key", (q) =>
        q.eq("workspaceId", workspace._id).eq("typeKey", card.typeKey),
      )
      .unique();
    if (!registry || registry.status !== "active") {
      throw new Error("Card type manifest not found");
    }

    const customFields = await loadCustomFieldSchema({
      ctx,
      workspaceId: workspace._id,
      typeKey: card.typeKey,
    });

    if (args.propertyUpdates) {
      const { coreSchema, customSchema } = buildCoreAndCustomSchema({
        registry,
        customFields,
      });
      validateAndSplitPropertyUpdates({
        propertyUpdates: args.propertyUpdates,
        coreSchema,
        customSchema,
      });
    }

    if (args.tagIds) {
      await ensureTagIdsBelongToWorkspace({
        ctx,
        workspaceId: workspace._id,
        tagIds: args.tagIds,
      });
    }

    if (args.body !== undefined && !isValidBody(args.body)) {
      throw new Error("Invalid body document");
    }

    const stale = Boolean(
      typeof args.baseUpdatedAt === "number" &&
      card.updatedAt > args.baseUpdatedAt,
    );
    const serverUpdatedAt = card.updatedAt;
    const requestedStatusKey = args.statusKey ?? card.statusKey;
    const { statusKey, columnId } = await resolveStatusAndColumn({
      board,
      boardType,
      requestedStatusKey,
      requestedColumnId: args.statusKey,
    });
    const statusChanged = statusKey !== card.statusKey;
    const nextOrderKey = statusChanged
      ? createKeyAfter(
          sortByOrderKey(
            await ctx.db
              .query("cards")
              .withIndex("by_board_status", (query) =>
                query.eq("boardId", board._id).eq("statusKey", statusKey),
              )
              .collect(),
          )
            .filter(
              (candidate) =>
                candidate._id !== card._id &&
                getCardScopeOrDefault(candidate) === getCardScopeOrDefault(card),
            )
            .at(-1)?.orderKey,
        )
      : card.orderKey;

    const {
      nextTagIds,
      changedPropertyKeys,
      previousProperties,
      previousTagIds,
      titleChanged,
      descriptionChanged,
      tagChanged,
      patch,
    } = buildUpdateCardState({
      args: {
        title: args.title,
        body: args.body,
        propertyUpdates: args.propertyUpdates,
        tagIds: args.tagIds,
      },
      card,
      registry,
    });
    const previousBodyMentionUserIds = new Set(
      extractBodyMentions(card.body).map((mention) => mention.userId),
    );
    const nextBodyMentions =
      args.body !== undefined ? extractBodyMentions(args.body) : [];
    const newBodyMentions =
      args.body !== undefined
        ? nextBodyMentions.filter(
            (mention) => !previousBodyMentionUserIds.has(mention.userId),
          )
        : [];
    const nextTitle = args.title ?? card.meta.title;

    await ctx.db.patch(card._id, {
      ...patch,
      statusKey,
      orderKey: nextOrderKey,
    });

    await emitUpdateCardEvents({
      ctx,
      workspaceId: workspace._id,
      card,
      actorId: userId,
      args: {
        propertyUpdates: args.propertyUpdates,
        tagIds: args.tagIds,
      },
      nextTagIds,
      previousTagIds,
      changedPropertyKeys,
      previousProperties,
      activityEntries: [
        ...(titleChanged ? [{ kind: "title" as const }] : []),
        ...(descriptionChanged ? [{ kind: "description" as const }] : []),
        ...(changedPropertyKeys.length > 0
          ? [
              {
                kind: "property" as const,
                propertyKeys: changedPropertyKeys,
              },
            ]
          : []),
        ...(tagChanged ? [{ kind: "tag" as const }] : []),
        ...(statusChanged ? [{ kind: "move" as const }] : []),
      ],
    });

    if (statusChanged) {
      await emitCardEvent(ctx, workspace._id, {
        name: "card.moved",
        actorId: userId,
        boardId: card.boardId,
        cardId: card._id,
        statusKey,
        previousStatusKey: card.statusKey,
        nextStatusKey: statusKey,
        cardTypeId: card.typeKey,
        tagIds: card.tagIds,
        previousColumnId: card.statusKey,
        nextColumnId: columnId,
        workspaceId: workspace._id,
      });
    }

    if (newBodyMentions.length > 0) {
      await insertMentionNotifications({
        ctx,
        workspaceId: workspace._id,
        boardId: board._id,
        cardId: card._id,
        viewInstanceId:
          getCardScopeOrDefault(card) === "shared"
            ? undefined
            : getCardScopeOrDefault(card),
        actorId: userId,
        mentions: newBodyMentions,
        kind: "mention_body",
        message: getBodyMentionMessage(nextTitle),
      });
    }

    return { cardId: card._id, stale, serverUpdatedAt };
  },
});

export const deleteCard = mutation({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
    cardId: v.id("cards"),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccessBySlug(
      ctx,
      args.workspaceSlug,
    );
    const userId = await getCurrentUserId(ctx);
    const card = await ctx.db.get(args.cardId);
    if (
      !card ||
      card.workspaceId !== workspace._id ||
      card.boardId !== args.boardId
    ) {
      throw new Error("Card not found");
    }

    const subtasks = await ctx.db
      .query("cards")
      .withIndex("by_board_parent", (q) =>
        q.eq("boardId", card.boardId).eq("parentId", card._id),
      )
      .collect();
    for (const subtask of subtasks) {
      await cleanupDeletedCardCollaboration({
        ctx,
        workspaceId: workspace._id,
        cardId: subtask._id,
      });
      await ctx.db.delete(subtask._id);
    }
    await cleanupDeletedCardCollaboration({
      ctx,
      workspaceId: workspace._id,
      cardId: card._id,
    });

    await emitCardEvent(ctx, workspace._id, {
      name: "card.deleted",
      actorId: userId,
      boardId: card.boardId,
      cardId: card._id,
      statusKey: card.statusKey,
      previousStatusKey: card.statusKey,
      cardTypeId: card.typeKey,
      tagIds: card.tagIds,
      previousColumnId: card.statusKey,
      workspaceId: workspace._id,
    });

    await removeIncomingRelationsToCard({
      ctx,
      workspaceId: workspace._id,
      cardId: card._id,
    });
    await ctx.db.delete(card._id);

    return { cardId: card._id };
  },
});
