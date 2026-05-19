import { compareOrderKeys, createKeyAfter, normalizePropertyOptions } from "@plank/domain";
import { isRequiredBuiltinPluginId } from "@plank/plugin-runtime";
import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  getOptionalCurrentAuthUser,
  getWorkspaceAccessBySlugIfAuthenticated,
  requireWorkspaceAccessBySlug,
} from "./lib/auth";
import {
  createPrivateViewLabel,
  ensureBoardViewsForBoard,
  getActivePluginIds,
  getBoardViewScopeId,
  getCardScopeId,
  getViewDefinitionById,
  getViewSharingPolicy,
  getWorkspaceExtensionRecords,
  normalizeBoardView,
  resolveBoardViewInstance,
  SHARED_VIEW_SCOPE_ID,
} from "./lib/plugins";
import { deleteRows, requireBoardWithType, sortByOrderKey } from "./lib/cardRuntime";
import { deleteNotificationsForBoardCards } from "./lib/mentions";

function getDerivedColumns(boardType: Doc<"boardTypes">) {
  return sortByOrderKey(boardType.lifecycleConfig.statuses).map((status) => ({
    id: status.key,
    statusKey: status.key,
    orderKey: status.orderKey,
  }));
}

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
      query.eq("workspaceId", workspaceId).eq("boardId", boardId).eq("userId", userId),
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
      query.eq("workspaceId", workspaceId).eq("boardId", boardId).eq("userId", userId),
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

function parseActivityCursor(cursor: string | undefined | null) {
  if (!cursor) {
    return null;
  }
  const separator = cursor.indexOf(":");
  if (separator === -1) {
    return null;
  }
  const createdAt = Number(cursor.slice(0, separator));
  const id = cursor.slice(separator + 1);
  if (!Number.isFinite(createdAt) || !id) {
    return null;
  }
  return { createdAt, id };
}

function encodeActivityCursor(event: Doc<"cardChangeEvents">) {
  return `${event.createdAt}:${String(event._id)}`;
}

function isActivityBeforeCursor(
  event: Doc<"cardChangeEvents">,
  cursor: { createdAt: number; id: string } | null,
) {
  if (!cursor) {
    return true;
  }
  return (
    event.createdAt < cursor.createdAt ||
    (event.createdAt === cursor.createdAt && String(event._id) < cursor.id)
  );
}

async function loadBoardPageData({
  ctx,
  workspaceId,
  boardId,
  userId,
}: {
  ctx: QueryCtx;
  workspaceId: Id<"workspaces">;
  boardId: Id<"boards">;
  userId: string;
}) {
  const [
    cards,
    registryTypes,
    tags,
    members,
    views,
    installed,
    allCustomFields,
    cardDigests,
    cardSeenStates,
  ] = await Promise.all([
    ctx.db
      .query("cards")
      .withIndex("by_board", (query) => query.eq("boardId", boardId))
      .collect(),
    ctx.db
      .query("cardTypeRegistry")
      .withIndex("by_workspace", (query) => query.eq("workspaceId", workspaceId))
      .collect(),
    ctx.db
      .query("tagDefinitions")
      .withIndex("by_workspace", (query) => query.eq("workspaceId", workspaceId))
      .collect(),
    ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (query) => query.eq("workspaceId", workspaceId))
      .collect(),
    ctx.db
      .query("boardViews")
      .withIndex("by_board", (query) => query.eq("boardId", boardId))
      .collect(),
    getWorkspaceExtensionRecords(ctx, workspaceId),
    ctx.db
      .query("workspaceCardTypeCustomFields")
      .withIndex("by_workspace", (query) => query.eq("workspaceId", workspaceId))
      .collect(),
    ctx.db
      .query("cardDigests")
      .withIndex("by_workspace_and_board", (query) =>
        query.eq("workspaceId", workspaceId).eq("boardId", boardId),
      )
      .collect(),
    ctx.db
      .query("cardSeenStates")
      .withIndex("by_workspace_and_board_and_user_and_card", (query) =>
        query.eq("workspaceId", workspaceId).eq("boardId", boardId).eq("userId", userId),
      )
      .collect(),
  ]);
  return {
    cards,
    registryTypes,
    tags,
    members,
    views,
    installed,
    allCustomFields,
    cardDigests,
    cardSeenStates,
  };
}

function buildCustomFieldsByTypeKey(
  allCustomFields: Doc<"workspaceCardTypeCustomFields">[],
) {
  const customFieldsByTypeKey = new Map<string, typeof allCustomFields>();
  for (const field of allCustomFields) {
    if (field.status !== "active") {
      continue;
    }
    const current = customFieldsByTypeKey.get(field.typeKey) ?? [];
    current.push(field);
    customFieldsByTypeKey.set(field.typeKey, current);
  }
  return customFieldsByTypeKey;
}

function buildCardSeenAtByCardId(rows: Doc<"cardSeenStates">[]) {
  return new Map(rows.map((row) => [String(row.cardId), row.seenAt]));
}

async function buildSubtaskStatsByParentId({
  scopeId,
  topLevelCards,
  scopedCards,
  registryTypeByKey,
}: {
  scopeId: string;
  topLevelCards: Doc<"cards">[];
  scopedCards: Doc<"cards">[];
  registryTypeByKey: Map<string, Doc<"cardTypeRegistry">>;
}) {
  const parentCards = topLevelCards.filter((card) => {
    const registry = registryTypeByKey.get(card.typeKey);
    return registry?.manifest.hierarchyPolicy?.supportsChildren;
  });

  if (parentCards.length === 0) {
    return new Map<string, { total: number; completed: number }>();
  }

  const parentIdSet = new Set(parentCards.map((c) => c._id));
  const subtaskStatsByParentId = new Map<string, { total: number; completed: number }>();
  for (const card of scopedCards) {
    if (!card.parentId || !parentIdSet.has(card.parentId)) {
      continue;
    }
    if (getCardScopeId(card) !== scopeId) {
      continue;
    }
    const key = String(card.parentId);
    const current = subtaskStatsByParentId.get(key) ?? { total: 0, completed: 0 };
    current.total += 1;
    if (card.fields.core.completed === true) {
      current.completed += 1;
    }
    subtaskStatsByParentId.set(key, current);
  }
  return subtaskStatsByParentId;
}

export const getBoardPage = query({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
    viewId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
  const access = await getWorkspaceAccessBySlugIfAuthenticated(
    ctx,
    args.workspaceSlug,
  );
  if (!access) {
      return null;
    }

    const { workspace, userId } = access;
    const authUser = await getOptionalCurrentAuthUser(ctx);
    const board = await ctx.db.get(args.boardId);

    if (!board || board.workspaceId !== workspace._id) {
      return null;
    }

    const boardType = await ctx.db.get(board.boardTypeId);

    if (!boardType || boardType.workspaceId !== workspace._id) {
      return null;
    }

    const {
      cards,
      registryTypes,
      tags,
      members,
      views,
      installed,
      allCustomFields,
      cardDigests,
      cardSeenStates,
    } = await loadBoardPageData({
      ctx,
      workspaceId: workspace._id,
      boardId: board._id,
      userId,
    });

    const enabledPluginIds = getActivePluginIds(
      installed.map((record) => ({
        pluginId: record.pluginId,
        status: record.status,
      })),
    );
    const enabledSet = new Set(enabledPluginIds);
    const visibleViews = views
      .map(normalizeBoardView)
      .filter((view) => !view.pluginId || enabledSet.has(view.pluginId))
      .sort((left, right) => compareOrderKeys(left.orderKey, right.orderKey));
    const activeView = resolveBoardViewInstance({
      requestedViewId: args.viewId,
      views: visibleViews,
    });
    const activeScopeId = activeView
      ? getBoardViewScopeId(activeView)
      : SHARED_VIEW_SCOPE_ID;
    const statusMap = new Map(
      boardType.lifecycleConfig.statuses.map((status) => [status.key, status]),
    );
    const customFieldsByTypeKey = buildCustomFieldsByTypeKey(allCustomFields);
    const cardDigestByCardId = new Map(
      cardDigests.map((digest) => [String(digest.cardId), digest]),
    );
    const cardSeenAtByCardId = buildCardSeenAtByCardId(cardSeenStates);
    const scopedCards = cards.filter(
      (card) => getCardScopeId(card) === activeScopeId,
    );
    const topLevelCards = scopedCards.filter((card) => !card.parentId);
    const registryTypeByKey = new Map(registryTypes.map((row) => [row.typeKey, row]));
    const subtaskStatsByParentId = await buildSubtaskStatsByParentId({
      scopeId: activeScopeId,
      topLevelCards,
      scopedCards,
      registryTypeByKey,
    });

    return {
      board: {
        id: board._id,
        name: board.name,
        workspaceId: board.workspaceId,
        boardTypeId: board.boardTypeId,
        columns: getDerivedColumns(boardType).map((column) => ({
          id: column.id,
          statusKey: column.statusKey,
          title: statusMap.get(column.statusKey)?.label ?? column.statusKey,
          orderKey: column.orderKey,
        })),
      },
      boardType: {
        id: boardType._id,
        workspaceId: boardType.workspaceId,
        key: boardType.key,
        name: boardType.name,
        description: boardType.description,
        lifecycleConfig: {
          statuses: sortByOrderKey(boardType.lifecycleConfig.statuses).map(
            (status) => ({
              key: status.key,
              label: status.label,
              category: status.category,
              orderKey: status.orderKey,
            }),
          ),
          initialStatusKey: boardType.lifecycleConfig.initialStatusKey,
        },
        defaultViewIds: boardType.defaultViewIds,
        defaultCardTypeKey: boardType.defaultCardTypeKey,
      },
      cardTypes: registryTypes
        .filter((row) => row.status === "active")
        .map((row) => {
          const coreSchema = row.manifest.fields.core.map((field, index) => ({
            key: field.key,
            name: field.label,
            type:
              (field.enumOptions?.length ?? 0) > 0 || (field.enumValues?.length ?? 0) > 0
                ? "select"
                : field.valueType,
            orderKey: String(index),
            required: field.required,
            config: {
              options: normalizePropertyOptions({
                enumOptions: field.enumOptions,
                enumValues: field.enumValues,
              }),
            },
          }));
          const customSchema = (customFieldsByTypeKey.get(row.typeKey) ?? []).map(
            (field, index) => ({
              key: field.key,
              name: field.label,
              type: field.propertyType ?? field.valueType,
              orderKey: String(coreSchema.length + index),
              required: field.required,
              config: {
                source: "custom",
                options: normalizePropertyOptions({
                  enumOptions: field.enumOptions,
                  enumValues: field.enumValues,
                }),
              },
            }),
          );

          return {
            id: row.typeKey,
            workspaceId: row.workspaceId,
            boardTypeId: board.boardTypeId,
            key: row.typeKey,
            name: row.typeKey,
            description: `${row.pluginId} (${row.schemaVersion})`,
            schemaVersion: row.schemaVersion,
            propertiesSchema: [...coreSchema, ...customSchema],
            defaultTagIds: [],
            capabilities: row.manifest.capabilities?.provides,
            hierarchyPolicy: row.manifest.hierarchyPolicy,
          };
        })
        .sort((a, b) => a.key.localeCompare(b.key)),
      tagDefinitions: tags.map((tag) => ({
        id: tag._id,
        workspaceId: tag.workspaceId,
        key: tag.key,
        name: tag.name,
        color: tag.color,
        description: tag.description,
      })),
      members: members.map((member) => ({
        id: member._id,
        userId: member.userId,
        name:
          member.userId === userId
            ? authUser?.name ?? member.name
            : member.name,
        email:
          member.userId === userId
            ? authUser?.email ?? member.email
            : member.email,
        role: member.role,
      })),
      cards: sortByOrderKey(topLevelCards).map((card) => {
        const digest = cardDigestByCardId.get(String(card._id));
        return {
          id: card._id,
          boardId: card.boardId,
          scopeId: getCardScopeId(card),
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
          subtaskStats: subtaskStatsByParentId.get(String(card._id)),
          latestExternalChange: digest
            ? {
                actorId: digest.latestExternalActorId,
                kind: digest.latestExternalKind,
                createdAt: digest.latestExternalChangeAt,
              }
            : undefined,
          viewerSeenAt: cardSeenAtByCardId.get(String(card._id)),
          createdBy: card.createdBy,
          createdAt: card.createdAt,
          updatedAt: card.updatedAt,
        };
      }),
      views: visibleViews.map((view) => ({
          id: view._id,
          instanceId: view.instanceId,
          definitionViewId: view.definitionViewId,
          viewId: view.definitionViewId,
          pluginId: view.pluginId,
          kind: view.kind,
          label: view.label,
          orderKey: view.orderKey,
          isDefault: view.isDefault,
          instanceMode: view.instanceMode,
          config:
            view.config && typeof view.config === "object"
              ? (view.config as Record<string, unknown>)
              : undefined,
        })),
      activeViewInstanceId: activeView?.instanceId,
      activeDefinitionViewId: activeView?.definitionViewId,
      activeViewMode: activeView?.instanceMode,
      enabledPluginIds,
      viewerUserId: userId,
      workspace: {
        id: workspace._id,
        name: workspace.name,
        slug: workspace.slug,
      },
    };
  },
});

export const updateBoardViewConfig = mutation({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
    instanceId: v.string(),
    config: v.record(v.string(), v.any()),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccessBySlug(
      ctx,
      args.workspaceSlug,
    );
    const { board } = await requireBoardWithType({
      ctx,
      workspaceId: workspace._id,
      boardId: args.boardId,
    });

    const views = await ctx.db
      .query("boardViews")
      .withIndex("by_board", (query) => query.eq("boardId", board._id))
      .collect();
    const view = views.find(
      (candidate) => normalizeBoardView(candidate).instanceId === args.instanceId,
    );

    if (!view) {
      throw new Error("Board view not found");
    }

    await ctx.db.patch(view._id, {
      config: args.config,
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
    const { workspace } = await requireWorkspaceAccessBySlug(
      ctx,
      args.workspaceSlug,
    );
    const { board } = await requireBoardWithType({
      ctx,
      workspaceId: workspace._id,
      boardId: args.boardId,
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
          query.eq("workspaceId", workspace._id).eq("pluginId", plugin.manifest.id),
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
    const { workspace } = await requireWorkspaceAccessBySlug(
      ctx,
      args.workspaceSlug,
    );
    const { board } = await requireBoardWithType({
      ctx,
      workspaceId: workspace._id,
      boardId: args.boardId,
    });

    const views = await ctx.db
      .query("boardViews")
      .withIndex("by_board", (query) => query.eq("boardId", board._id))
      .collect();
    if (views.length <= 1) {
      throw new Error("A board must keep at least one view");
    }

    const view = views.find(
      (candidate) => normalizeBoardView(candidate).instanceId === args.instanceId,
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
      const privateCardIds = new Set(privateCards.map((card) => String(card._id)));

      const workspaceCards = await ctx.db
        .query("cards")
        .withIndex("by_workspace", (query) => query.eq("workspaceId", workspace._id))
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

      for (const card of privateCards) {
        const comments = await ctx.db
          .query("cardComments")
          .withIndex("by_workspace_card_created_at", (query) =>
            query.eq("workspaceId", workspace._id).eq("cardId", card._id),
          )
          .take(500);
        for (const comment of comments) {
          await deleteRows(
            await ctx.db
              .query("commentReactions")
              .withIndex("by_workspace_comment", (query) =>
                query.eq("workspaceId", workspace._id).eq("commentId", comment._id),
              )
              .take(200),
            ctx,
          );
          await ctx.db.delete(comment._id);
        }
      }
      await deleteNotificationsForBoardCards({
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
        await ctx.db.delete(card._id);
      }
    }

    await ctx.db.delete(view._id);

    if (view.isDefault) {
      const nextDefault = views
        .filter((candidate) => candidate._id !== view._id)
        .map(normalizeBoardView)
        .sort((left, right) => compareOrderKeys(left.orderKey, right.orderKey))[0];
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
  handler: async (ctx, args) => {
    const access = await getWorkspaceAccessBySlugIfAuthenticated(
      ctx,
      args.workspaceSlug,
    );
    if (!access) {
      return null;
    }

    const { workspace, userId } = access;
    await requireBoardWithType({
      ctx,
      workspaceId: workspace._id,
      boardId: args.boardId,
    });

    const authUser = await getOptionalCurrentAuthUser(ctx);
    const [presenceRows, members] = await Promise.all([
      ctx.db
        .query("boardHeartbeats")
        .withIndex("by_workspace_and_board", (query) =>
          query.eq("workspaceId", workspace._id).eq("boardId", args.boardId),
        )
        .collect(),
      ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspace", (query) => query.eq("workspaceId", workspace._id))
        .collect(),
    ]);

    const memberByUserId = new Map(members.map((member) => [member.userId, member]));

    return {
      items: presenceRows
        .sort((left, right) => right.lastHeartbeatAt - left.lastHeartbeatAt)
        .map((row) => {
          const member = memberByUserId.get(row.userId);
          return {
            userId: row.userId,
            name:
              row.userId === userId
                ? authUser?.name ?? member?.name
                : member?.name,
            email:
              row.userId === userId
                ? authUser?.email ?? member?.email
                : member?.email,
            role: member?.role,
            lastHeartbeatAt: row.lastHeartbeatAt,
            isViewer: row.userId === userId,
          };
        }),
    };
  },
});

export const getBoardActivityPage = query({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
    viewId: v.optional(v.string()),
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const access = await getWorkspaceAccessBySlugIfAuthenticated(
      ctx,
      args.workspaceSlug,
    );
    if (!access) {
      return null;
    }

    const { workspace } = access;
    await requireBoardWithType({
      ctx,
      workspaceId: workspace._id,
      boardId: args.boardId,
    });

    const pageSize = Math.max(1, Math.min(args.limit ?? 30, 100));
    const parsedCursor = parseActivityCursor(args.cursor);
    const [members, views, cards] = await Promise.all([
      ctx.db
        .query("workspaceMembers")
        .withIndex("by_workspace", (query) => query.eq("workspaceId", workspace._id))
        .collect(),
      ctx.db
        .query("boardViews")
        .withIndex("by_board", (query) => query.eq("boardId", args.boardId))
        .collect(),
      ctx.db
        .query("cards")
        .withIndex("by_board", (query) => query.eq("boardId", args.boardId))
        .collect(),
    ]);
    const activeView = resolveBoardViewInstance({
      requestedViewId: args.viewId,
      views,
    });
    const activeScopeId = activeView
      ? getBoardViewScopeId(activeView)
      : SHARED_VIEW_SCOPE_ID;
    const visibleCardIds = new Set(
      cards
        .filter((card) => getCardScopeId(card) === activeScopeId)
        .map((card) => String(card._id)),
    );
    const visibleCards = cards.filter((card) => visibleCardIds.has(String(card._id)));
    const perCardEvents = await Promise.all(
      visibleCards.map(async (card) =>
        (
          await ctx.db
            .query("cardChangeEvents")
            .withIndex("by_workspace_card_created_at", (query) => {
              const byCard = query
                .eq("workspaceId", workspace._id)
                .eq("cardId", card._id);
              return parsedCursor
                ? byCard.lte("createdAt", parsedCursor.createdAt)
                : byCard;
            })
            .order("desc")
            .take(pageSize + 1)
        ).filter((event) => isActivityBeforeCursor(event, parsedCursor)),
      ),
    );
    const filteredEvents = perCardEvents
      .flat()
      .sort((left, right) => {
        if (right.createdAt !== left.createdAt) {
          return right.createdAt - left.createdAt;
        }
        return String(right._id).localeCompare(String(left._id));
      });
    const page = filteredEvents.slice(0, pageSize + 1);
    const items = page.slice(0, pageSize);
    const nextCursor =
      page.length > pageSize && items.length > 0
        ? encodeActivityCursor(items[items.length - 1]!)
        : null;
    const memberByUserId = new Map(members.map((member) => [member.userId, member]));
    const cardsById = new Map(cards.map((card) => [String(card._id), card]));

    return {
      items: items.map((event) => {
        const member = memberByUserId.get(event.actorId);
        const card = cardsById.get(String(event.cardId));
        return {
          id: String(event._id),
          actorId: event.actorId,
          actorLabel: member?.name ?? member?.email ?? event.actorId,
          cardId: String(event.cardId),
          cardTitle: card?.meta.title ?? "Deleted card",
          kind: event.kind,
          createdAt: event.createdAt,
          propertyKeys: event.propertyKeys,
        };
      }),
      nextCursor,
    };
  },
});

export const syncPluginViews = mutation({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccessBySlug(
      ctx,
      args.workspaceSlug,
    );
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

export const renameBoard = mutation({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccessBySlug(
      ctx,
      args.workspaceSlug,
    );
    const { board } = await requireBoardWithType({
      ctx,
      workspaceId: workspace._id,
      boardId: args.boardId,
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
    const { workspace } = await requireWorkspaceAccessBySlug(
      ctx,
      args.workspaceSlug,
    );
    const { board } = await requireBoardWithType({
      ctx,
      workspaceId: workspace._id,
      boardId: args.boardId,
    });

    const cards = await ctx.db
      .query("cards")
      .withIndex("by_board", (query) => query.eq("boardId", board._id))
      .collect();
    const cardIds = new Set(cards.map((card) => String(card._id)));

    const workspaceCards = await ctx.db
      .query("cards")
      .withIndex("by_workspace", (query) => query.eq("workspaceId", workspace._id))
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
    await deleteRows(
      await ctx.db
        .query("boardMembershipStates")
        .withIndex("by_workspace_and_board", (query) =>
          query.eq("workspaceId", workspace._id).eq("boardId", board._id),
        )
        .collect(),
      ctx,
    );
    await deleteRows(
      await ctx.db
        .query("boardHeartbeats")
        .withIndex("by_workspace_and_board", (query) =>
          query.eq("workspaceId", workspace._id).eq("boardId", board._id),
        )
        .collect(),
      ctx,
    );
    await deleteRows(
      await ctx.db
        .query("cardSeenStates")
        .withIndex("by_workspace_and_board_and_card", (query) =>
          query.eq("workspaceId", workspace._id).eq("boardId", board._id),
        )
        .collect(),
      ctx,
    );
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
        .query("cardChangeEvents")
        .withIndex("by_workspace_board_created_at", (query) =>
          query.eq("workspaceId", workspace._id).eq("boardId", board._id),
        )
        .collect(),
      ctx,
    );
    await deleteRows(
      await ctx.db
        .query("boardDigests")
        .withIndex("by_workspace_and_board", (query) =>
          query.eq("workspaceId", workspace._id).eq("boardId", board._id),
        )
        .collect(),
      ctx,
    );
    await deleteRows(
      await ctx.db
        .query("cardDigests")
        .withIndex("by_workspace_and_board", (query) =>
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
    const comments = await ctx.db
      .query("cardComments")
      .withIndex("by_workspace", (query) => query.eq("workspaceId", workspace._id))
      .collect();
    for (const comment of comments) {
      if (!cardIds.has(String(comment.cardId))) {
        continue;
      }
      await deleteRows(
        await ctx.db
          .query("commentReactions")
          .withIndex("by_workspace_comment", (query) =>
            query.eq("workspaceId", workspace._id).eq("commentId", comment._id),
          )
          .take(200),
        ctx,
      );
      await ctx.db.delete(comment._id);
    }
    await deleteNotificationsForBoardCards({
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
