import { compareOrderKeys, createKeyAfter } from "@plank/domain";
import { isRequiredBuiltinPluginId } from "@plank/plugin-runtime/server";
import { v } from "convex/values";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  getOptionalCurrentAuthUser,
  getWorkspaceAccessBySlugIfAuthenticated,
  requireWorkspaceAccessBySlug,
} from "./lib/auth";
import {
  createBoardViewFeatureInstance,
  createPrivateViewLabel,
  ensureBoardViewsForBoard,
  getCardScopeId,
  getViewDefinitionById,
  getViewSharingPolicy,
  getWorkspaceExtensionRecords,
  normalizeBoardView,
} from "./lib/plugins";
import {
  deleteRows,
  removeCardRelationProjectionRowsForCard,
  requireBoardWithType,
} from "./lib/cardRuntime";
import {
  cleanupDeletedBoardCardsCollaboration,
  cleanupDeletedBoardCollaborationRows,
} from "./features/collaboration/cleanup";
import {
  boardViewConfigValueValidator,
  normalizeBoardViewConfigForStorage,
} from "./lib/boardViewConfig";
import {
  buildBoardSummary,
  buildBoardTypeSummary,
  loadBoardCore,
} from "./lib/loaders/boardCore";
import {
  buildCardDigestByCardId,
  buildCardSeenAtByCardId,
  buildBoardMembers,
  loadBoardCollaborationRows,
} from "./lib/loaders/collaboration";
import {
  buildBoardViewSummaries,
  loadBoardViewFeature,
} from "./lib/loaders/boardViews";
import {
  loadBoardCardDefinitionRows,
  buildCardSummaries,
  buildCardTypeSummaries,
  buildTagSummaries,
} from "./lib/loaders/boardCards";
import {
  getBoardActivityPageForViewer,
  listBoardPresenceForViewer,
} from "./features/collaboration/activity";

async function upsertBoardMembershipState({
  ctx,
  workspaceId,
  boardId,
  userId,
  lastSeenAt,
}: {
  ctx: MutationCtx;
  workspaceId: Id<"workspaces">;
  boardId: Id<"boards">;
  userId: string;
  lastSeenAt?: number;
}) {
  const existing = await ctx.db
    .query("boardMembershipStates")
    .withIndex("by_workspace_and_board_and_user", (query) =>
      query
        .eq("workspaceId", workspaceId)
        .eq("boardId", boardId)
        .eq("userId", userId),
    )
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, {
      lastSeenAt:
        typeof lastSeenAt === "number"
          ? Math.max(existing.lastSeenAt, lastSeenAt)
          : existing.lastSeenAt,
    });
    return existing._id;
  }

  return await ctx.db.insert("boardMembershipStates", {
    workspaceId,
    boardId,
    userId,
    lastSeenAt: typeof lastSeenAt === "number" ? lastSeenAt : 0,
  });
}

async function upsertBoardHeartbeat({
  ctx,
  workspaceId,
  boardId,
  userId,
}: {
  ctx: MutationCtx;
  workspaceId: Id<"workspaces">;
  boardId: Id<"boards">;
  userId: string;
}) {
  const existing = await ctx.db
    .query("boardHeartbeats")
    .withIndex("by_workspace_and_board_and_user", (query) =>
      query
        .eq("workspaceId", workspaceId)
        .eq("boardId", boardId)
        .eq("userId", userId),
    )
    .unique();

  if (existing) {
    await ctx.db.patch(existing._id, {
      lastHeartbeatAt: Date.now(),
    });
    return existing._id;
  }

  return await ctx.db.insert("boardHeartbeats", {
    workspaceId,
    boardId,
    userId,
    lastHeartbeatAt: Date.now(),
  });
}

async function getBoardFrameForViewer(
  ctx: QueryCtx,
  args: {
    workspaceSlug: string;
    boardId: Id<"boards">;
    viewId?: string;
  },
) {
  const access = await getWorkspaceAccessBySlugIfAuthenticated(
    ctx,
    args.workspaceSlug,
  );
  if (!access) {
    return null;
  }

  const { workspace, userId } = access;
  const authUser = await getOptionalCurrentAuthUser(ctx);
  const core = await loadBoardCore({
    ctx,
    workspaceId: workspace._id,
    boardId: args.boardId,
    viewerUserId: userId,
  });
  if (!core) {
    return null;
  }
  const { board, boardType } = core;

  const [viewFeature, cardDefinitionRows, members] = await Promise.all([
    loadBoardViewFeature({
      ctx,
      workspaceId: workspace._id,
      boardId: board._id,
      requestedViewId: args.viewId,
    }),
    loadBoardCardDefinitionRows({
      ctx,
      workspaceId: workspace._id,
    }),
    ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (query) =>
        query.eq("workspaceId", workspace._id),
      )
      .collect(),
  ]);

  return {
    board: buildBoardSummary({ board, boardType, viewerUserId: userId }),
    boardType: buildBoardTypeSummary(boardType),
    cardTypes: buildCardTypeSummaries({
      allCustomFields: cardDefinitionRows.allCustomFields,
      boardTypeId: board.boardTypeId,
      registryTypes: cardDefinitionRows.registryTypes,
    }),
    tagDefinitions: buildTagSummaries(cardDefinitionRows.tags),
    members: buildBoardMembers({
      authUser,
      members,
      userId,
    }),
    views: buildBoardViewSummaries(viewFeature.visibleViews),
    activeViewInstanceId: viewFeature.activeView?.instanceId,
    activeDefinitionViewId: viewFeature.activeView?.definitionViewId,
    activeViewMode: viewFeature.activeView?.instanceMode,
    enabledPluginIds: viewFeature.enabledPluginIds,
    viewerUserId: userId,
    workspace: {
      id: workspace._id,
      name: workspace.name,
      slug: workspace.slug,
    },
  };
}

async function getBoardCardsForViewer(
  ctx: QueryCtx,
  args: {
    workspaceSlug: string;
    boardId: Id<"boards">;
    viewId?: string;
  },
) {
  const access = await getWorkspaceAccessBySlugIfAuthenticated(
    ctx,
    args.workspaceSlug,
  );
  if (!access) {
    return null;
  }

  const { workspace, userId } = access;
  const core = await loadBoardCore({
    ctx,
    workspaceId: workspace._id,
    boardId: args.boardId,
    viewerUserId: userId,
  });
  if (!core) {
    return null;
  }
  const { board } = core;

  const [viewFeature, registryTypes, collaborationRows] = await Promise.all([
    loadBoardViewFeature({
      ctx,
      workspaceId: workspace._id,
      boardId: board._id,
      requestedViewId: args.viewId,
    }),
    ctx.db
      .query("cardTypeRegistry")
      .withIndex("by_workspace", (query) =>
        query.eq("workspaceId", workspace._id),
      )
      .collect(),
    loadBoardCollaborationRows({
      ctx,
      workspaceId: workspace._id,
      boardId: board._id,
      userId,
    }),
  ]);
  const activeScopeId = viewFeature.activeScopeId;
  const scopedCards =
    activeScopeId === "shared"
      ? (
          await ctx.db
            .query("cards")
            .withIndex("by_board", (query) => query.eq("boardId", board._id))
            .collect()
        ).filter(
          (card) => !card.deletedAt && getCardScopeId(card) === activeScopeId,
        )
      : await ctx.db
          .query("cards")
          .withIndex("by_board_scope", (query) =>
            query.eq("boardId", board._id).eq("scopeId", activeScopeId),
          )
          .collect()
          .then((cards) => cards.filter((card) => !card.deletedAt));
  const cardDigestByCardId = buildCardDigestByCardId(
    collaborationRows.cardDigests,
  );
  const cardSeenAtByCardId = buildCardSeenAtByCardId(
    collaborationRows.cardSeenStates,
  );

  return {
    cards: buildCardSummaries({
      activeScopeId,
      cardDigestByCardId,
      cardSeenAtByCardId,
      cards: scopedCards,
      registryTypes,
    }),
  };
}

export const getBoardFrame = query({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
    viewId: v.optional(v.string()),
  },
  handler: getBoardFrameForViewer,
});

export const getBoardCards = query({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
    viewId: v.optional(v.string()),
  },
  handler: getBoardCardsForViewer,
});

export const getBoardPage = query({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
    viewId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const [frame, cards] = await Promise.all([
      getBoardFrameForViewer(ctx, args),
      getBoardCardsForViewer(ctx, args),
    ]);
    if (!frame || !cards) {
      return null;
    }
    return { ...frame, cards: cards.cards };
  },
});

export const updateBoardViewConfig = mutation({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
    instanceId: v.string(),
    config: boardViewConfigValueValidator,
  },
  handler: async (ctx, args) => {
    const { userId, workspace } = await requireWorkspaceAccessBySlug(
      ctx,
      args.workspaceSlug,
    );
    const { board } = await requireBoardWithType({
      ctx,
      workspaceId: workspace._id,
      boardId: args.boardId,
      viewerUserId: userId,
    });

    const views = await ctx.db
      .query("boardViews")
      .withIndex("by_board", (query) => query.eq("boardId", board._id))
      .collect();
    const view = views.find(
      (candidate) =>
        normalizeBoardView(candidate).instanceId === args.instanceId,
    );

    if (!view) {
      throw new Error("Board view not found");
    }

    const normalizedView = normalizeBoardView(view);

    await ctx.db.patch(view._id, {
      config: normalizeBoardViewConfigForStorage({
        config: args.config,
        viewId: normalizedView.definitionViewId,
      }),
    });

    return { ok: true };
  },
});

export const addBoardView = mutation({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
    definitionViewId: v.string(),
    instanceMode: v.union(v.literal("shared"), v.literal("private")),
  },
  handler: async (ctx, args) => {
    const { userId, workspace } = await requireWorkspaceAccessBySlug(
      ctx,
      args.workspaceSlug,
    );
    const { board } = await requireBoardWithType({
      ctx,
      workspaceId: workspace._id,
      boardId: args.boardId,
      viewerUserId: userId,
    });

    const definition = getViewDefinitionById(args.definitionViewId);
    const plugin = definition?.plugin;
    const view = definition?.view;
    if (!plugin || !view) {
      throw new Error("Board view not found");
    }
    const sharingPolicy = getViewSharingPolicy(args.definitionViewId);
    if (sharingPolicy === "force_shared" && args.instanceMode === "private") {
      throw new Error("This view can only be added as shared");
    }
    if (sharingPolicy === "force_private" && args.instanceMode === "shared") {
      throw new Error("This view can only be added as private");
    }

    if (!isRequiredBuiltinPluginId(plugin.manifest.id)) {
      const extension = await ctx.db
        .query("workspaceExtensions")
        .withIndex("by_workspace_plugin", (query) =>
          query
            .eq("workspaceId", workspace._id)
            .eq("pluginId", plugin.manifest.id),
        )
        .unique();
      if (!extension || extension.status !== "enabled") {
        throw new Error("Plugin is not enabled for this workspace");
      }
    }

    const existingViews = await ctx.db
      .query("boardViews")
      .withIndex("by_board", (query) => query.eq("boardId", board._id))
      .collect();
    const normalizedExistingViews = existingViews.map(normalizeBoardView);
    if (args.instanceMode === "shared") {
      const existingShared = normalizedExistingViews.find(
        (candidate) =>
          candidate.definitionViewId === args.definitionViewId &&
          candidate.instanceMode === "shared",
      );
      if (existingShared) {
        return { ok: true, instanceId: existingShared.instanceId };
      }
    }
    const previousOrderKey = existingViews
      .map(normalizeBoardView)
      .sort((left, right) => compareOrderKeys(left.orderKey, right.orderKey))
      .at(-1)?.orderKey;
    const instanceId = crypto.randomUUID();
    const label =
      args.instanceMode === "private"
        ? createPrivateViewLabel({
            baseLabel: view.label,
            existingViews,
          })
        : view.label;

    await ctx.db.insert("boardViews", {
      workspaceId: workspace._id,
      boardId: board._id,
      viewId: view.id,
      instanceId,
      definitionViewId: view.id,
      instanceMode: args.instanceMode,
      pluginId: plugin.manifest.id,
      featureInstance: createBoardViewFeatureInstance({
        definitionViewId: view.id,
        instanceId,
        instanceMode: args.instanceMode,
        pluginId: plugin.manifest.id,
      }),
      kind: isRequiredBuiltinPluginId(plugin.manifest.id) ? "core" : "plugin",
      label,
      orderKey: createKeyAfter(previousOrderKey),
      isDefault: existingViews.length === 0,
    });

    return { ok: true, instanceId };
  },
});

export const removeBoardView = mutation({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
    instanceId: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId, workspace } = await requireWorkspaceAccessBySlug(
      ctx,
      args.workspaceSlug,
    );
    const { board } = await requireBoardWithType({
      ctx,
      workspaceId: workspace._id,
      boardId: args.boardId,
      viewerUserId: userId,
    });

    const views = await ctx.db
      .query("boardViews")
      .withIndex("by_board", (query) => query.eq("boardId", board._id))
      .collect();
    if (views.length <= 1) {
      throw new Error("A board must keep at least one view");
    }

    const view = views.find(
      (candidate) =>
        normalizeBoardView(candidate).instanceId === args.instanceId,
    );
    if (!view) {
      return { ok: true };
    }

    const normalizedView = normalizeBoardView(view);
    if (normalizedView.instanceMode === "private") {
      const privateCards = (
        await ctx.db
          .query("cards")
          .withIndex("by_board", (query) => query.eq("boardId", board._id))
          .collect()
      ).filter((card) => getCardScopeId(card) === normalizedView.instanceId);
      const privateCardIds = new Set(
        privateCards.map((card) => String(card._id)),
      );

      const workspaceCards = await ctx.db
        .query("cards")
        .withIndex("by_workspace", (query) =>
          query.eq("workspaceId", workspace._id),
        )
        .collect();
      for (const candidate of workspaceCards) {
        if (privateCardIds.has(String(candidate._id))) {
          continue;
        }
        const nextRelations = candidate.relations.filter(
          (relation) => !privateCardIds.has(String(relation.targetCardId)),
        );
        if (nextRelations.length !== candidate.relations.length) {
          await ctx.db.patch(candidate._id, {
            relations: nextRelations,
            updatedAt: Date.now(),
          });
        }
      }

      await cleanupDeletedBoardCardsCollaboration({
        ctx,
        workspaceId: workspace._id,
        boardId: board._id,
        cardIds: privateCardIds,
      });
      await deleteRows(
        await ctx.db
          .query("cardSeenStates")
          .withIndex("by_workspace_and_board_and_card", (query) =>
            query.eq("workspaceId", workspace._id).eq("boardId", board._id),
          )
          .collect()
          .then((rows) =>
            rows.filter((row) => privateCardIds.has(String(row.cardId))),
          ),
        ctx,
      );
      await deleteRows(
        await ctx.db
          .query("cardDigests")
          .withIndex("by_workspace_and_board", (query) =>
            query.eq("workspaceId", workspace._id).eq("boardId", board._id),
          )
          .collect()
          .then((rows) =>
            rows.filter((row) => privateCardIds.has(String(row.cardId))),
          ),
        ctx,
      );
      await deleteRows(
        await ctx.db
          .query("workflowEvents")
          .withIndex("by_workspace_board_created_at", (query) =>
            query.eq("workspaceId", workspace._id).eq("boardId", board._id),
          )
          .collect()
          .then((rows) =>
            rows.filter((row) => privateCardIds.has(String(row.cardId))),
          ),
        ctx,
      );
      await deleteRows(
        await ctx.db
          .query("cardChangeEvents")
          .withIndex("by_workspace_board_created_at", (query) =>
            query.eq("workspaceId", workspace._id).eq("boardId", board._id),
          )
          .collect()
          .then((rows) =>
            rows.filter((row) => privateCardIds.has(String(row.cardId))),
          ),
        ctx,
      );
      await deleteRows(
        await ctx.db
          .query("automationRuns")
          .withIndex("by_board", (query) =>
            query.eq("workspaceId", workspace._id).eq("boardId", board._id),
          )
          .collect()
          .then((rows) =>
            rows.filter((row) => privateCardIds.has(String(row.cardId))),
          ),
        ctx,
      );
      for (const card of privateCards) {
        await removeCardRelationProjectionRowsForCard({
          ctx,
          workspaceId: workspace._id,
          cardId: card._id,
        });
        await ctx.db.delete(card._id);
      }
    }

    await ctx.db.delete(view._id);

    if (view.isDefault) {
      const nextDefault = views
        .filter((candidate) => candidate._id !== view._id)
        .map(normalizeBoardView)
        .sort((left, right) =>
          compareOrderKeys(left.orderKey, right.orderKey),
        )[0];
      if (nextDefault?._id) {
        await ctx.db.patch(nextDefault._id, {
          isDefault: true,
        });
      }
    }

    return { ok: true };
  },
});

export const markBoardSeen = mutation({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
    seenAt: v.number(),
  },
  handler: async (ctx, args) => {
    const { workspace, userId } = await requireWorkspaceAccessBySlug(
      ctx,
      args.workspaceSlug,
    );
    await requireBoardWithType({
      ctx,
      workspaceId: workspace._id,
      boardId: args.boardId,
      viewerUserId: userId,
    });

    await upsertBoardMembershipState({
      ctx,
      workspaceId: workspace._id,
      boardId: args.boardId,
      userId,
      lastSeenAt: args.seenAt,
    });

    return { ok: true };
  },
});

export const heartbeatBoardPresence = mutation({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
  },
  handler: async (ctx, args) => {
    const { workspace, userId } = await requireWorkspaceAccessBySlug(
      ctx,
      args.workspaceSlug,
    );
    await requireBoardWithType({
      ctx,
      workspaceId: workspace._id,
      boardId: args.boardId,
      viewerUserId: userId,
    });

    await upsertBoardHeartbeat({
      ctx,
      workspaceId: workspace._id,
      boardId: args.boardId,
      userId,
    });

    return { ok: true };
  },
});

export const listBoardPresence = query({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
  },
  handler: listBoardPresenceForViewer,
});

export const getBoardActivityPage = query({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
    viewId: v.optional(v.string()),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: getBoardActivityPageForViewer,
});

export const syncPluginViews = mutation({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
  },
  handler: async (ctx, args) => {
    const { userId, workspace } = await requireWorkspaceAccessBySlug(
      ctx,
      args.workspaceSlug,
    );
    await requireBoardWithType({
      ctx,
      workspaceId: workspace._id,
      boardId: args.boardId,
      viewerUserId: userId,
    });
    const installed = await getWorkspaceExtensionRecords(ctx, workspace._id);
    await ensureBoardViewsForBoard(
      ctx,
      workspace._id,
      args.boardId,
      installed
        .filter((record) => record.status === "enabled")
        .map((record) => record.pluginId),
    );
    return { ok: true };
  },
});

export const setBoardVisibility = mutation({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
    visibility: v.union(v.literal("workspace"), v.literal("private")),
  },
  handler: async (ctx, args) => {
    const { userId, workspace } = await requireWorkspaceAccessBySlug(
      ctx,
      args.workspaceSlug,
    );
    const { board } = await requireBoardWithType({
      ctx,
      workspaceId: workspace._id,
      boardId: args.boardId,
      viewerUserId: userId,
    });
    if (board.createdBy !== userId) {
      throw new Error("Only the board owner can change visibility");
    }

    await ctx.db.patch(board._id, {
      visibility: args.visibility,
      updatedAt: Date.now(),
    });

    return { boardId: board._id, visibility: args.visibility };
  },
});

export const renameBoard = mutation({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const { userId, workspace } = await requireWorkspaceAccessBySlug(
      ctx,
      args.workspaceSlug,
    );
    const { board } = await requireBoardWithType({
      ctx,
      workspaceId: workspace._id,
      boardId: args.boardId,
      viewerUserId: userId,
    });
    const name = args.name.trim();
    if (!name) {
      throw new Error("Board name is required");
    }

    await ctx.db.patch(board._id, {
      name,
      updatedAt: Date.now(),
    });

    return { boardId: board._id, name };
  },
});

export const deleteBoard = mutation({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
  },
  handler: async (ctx, args) => {
    const { userId, workspace } = await requireWorkspaceAccessBySlug(
      ctx,
      args.workspaceSlug,
    );
    const { board } = await requireBoardWithType({
      ctx,
      workspaceId: workspace._id,
      boardId: args.boardId,
      viewerUserId: userId,
    });

    const cards = await ctx.db
      .query("cards")
      .withIndex("by_board", (query) => query.eq("boardId", board._id))
      .collect();
    const cardIds = new Set(cards.map((card) => String(card._id)));

    const workspaceCards = await ctx.db
      .query("cards")
      .withIndex("by_workspace", (query) =>
        query.eq("workspaceId", workspace._id),
      )
      .collect();
    for (const candidate of workspaceCards) {
      if (cardIds.has(String(candidate._id))) {
        continue;
      }
      const nextRelations = candidate.relations.filter(
        (relation) => !cardIds.has(String(relation.targetCardId)),
      );
      if (nextRelations.length !== candidate.relations.length) {
        await ctx.db.patch(candidate._id, {
          relations: nextRelations,
          updatedAt: Date.now(),
        });
      }
    }

    await deleteRows(
      await ctx.db
        .query("boardViews")
        .withIndex("by_board", (query) => query.eq("boardId", board._id))
        .collect(),
      ctx,
    );
    await cleanupDeletedBoardCollaborationRows({
      ctx,
      workspaceId: workspace._id,
      boardId: board._id,
    });
    await deleteRows(
      await ctx.db
        .query("workflowEvents")
        .withIndex("by_workspace_board_created_at", (query) =>
          query.eq("workspaceId", workspace._id).eq("boardId", board._id),
        )
        .collect(),
      ctx,
    );
    await deleteRows(
      await ctx.db
        .query("automationRuns")
        .withIndex("by_board", (query) =>
          query.eq("workspaceId", workspace._id).eq("boardId", board._id),
        )
        .collect(),
      ctx,
    );

    const behaviorBindings = await ctx.db
      .query("behaviorBindings")
      .withIndex("by_workspace_target", (query) =>
        query
          .eq("workspaceId", workspace._id)
          .eq("targetType", "board")
          .eq("targetId", String(board._id)),
      )
      .collect();
    await deleteRows(behaviorBindings, ctx);
    await cleanupDeletedBoardCardsCollaboration({
      ctx,
      workspaceId: workspace._id,
      boardId: board._id,
      cardIds,
    });

    for (const card of cards) {
      await ctx.db.delete(card._id);
    }
    await ctx.db.delete(board._id);

    return { boardId: board._id };
  },
});
