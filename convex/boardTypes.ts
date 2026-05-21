import {
  compareOrderKeys,
  createDefaultLifecycleStatuses,
  createKeyAfter,
  createKeyBetween,
  createSlug,
} from "@plank/domain";
import { builtinServerPluginRegistry, isRequiredBuiltinPluginId } from "@plank/plugin-runtime/server";
import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getCurrentUserId, requireWorkspaceAccessBySlug } from "./lib/auth";
import { emitCardEvent } from "./lib/plugins";
import { createBoardTypeViewDefaultsEnvelope } from "./lib/persistedState";

const builtinBoardTypeTemplates = new Map(
  builtinServerPluginRegistry.plugins.flatMap((plugin) =>
    plugin.boardTypeTemplates.map((template) => [
      `${plugin.manifest.id}:${template.id}:${template.version}`,
      {
        pluginId: plugin.manifest.id,
        ...template,
      },
    ] as const),
  ),
);

function sortByOrderKey<T extends { orderKey: string }>(rows: T[]) {
  return [...rows].sort((left, right) => compareOrderKeys(left.orderKey, right.orderKey));
}

function toStatusKey(label: string) {
  return createSlug(label).replace(/-/g, "_") || "status";
}

function uniqueStatusKey(existing: Set<string>, base: string) {
  let key = base;
  let suffix = 2;
  while (existing.has(key)) {
    key = `${base}_${suffix}`;
    suffix += 1;
  }
  existing.add(key);
  return key;
}

async function requireBoardTypeInWorkspace({
  ctx,
  workspaceId,
  boardTypeId,
}: {
  ctx: MutationCtx;
  workspaceId: Id<"workspaces">;
  boardTypeId: Id<"boardTypes">;
}) {
  const boardType = await ctx.db.get(boardTypeId);
  if (!boardType || boardType.workspaceId !== workspaceId) {
    throw new Error("Board type not found");
  }
  return boardType;
}

async function listBoardsByType({
  ctx,
  workspaceId,
  boardTypeId,
}: {
  ctx: MutationCtx;
  workspaceId: Id<"workspaces">;
  boardTypeId: Id<"boardTypes">;
}) {
  return await ctx.db
    .query("boards")
    .withIndex("by_workspace_board_type", (query) =>
      query.eq("workspaceId", workspaceId).eq("boardTypeId", boardTypeId),
    )
    .collect();
}

export const listForWorkspace = query({
  args: {
    workspaceSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const access = await requireWorkspaceAccessBySlug(ctx, args.workspaceSlug);
    const boardTypes = await ctx.db
      .query("boardTypes")
      .withIndex("by_workspace", (query) => query.eq("workspaceId", access.workspace._id))
      .collect();

    return boardTypes
      .map((boardType) => ({
        id: boardType._id,
        key: boardType.key,
        name: boardType.name,
        description: boardType.description,
        lifecycleConfig: {
          statuses: sortByOrderKey(boardType.lifecycleConfig.statuses),
          initialStatusKey: boardType.lifecycleConfig.initialStatusKey,
        },
        defaultViewIds: boardType.defaultViewIds,
        defaultCardTypeKey: boardType.defaultCardTypeKey,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  },
});

export const createBoardType = mutation({
  args: {
    workspaceSlug: v.string(),
    name: v.string(),
    key: v.optional(v.string()),
    description: v.optional(v.string()),
    templateRef: v.optional(
      v.object({
        pluginId: v.string(),
        templateId: v.string(),
        version: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccessBySlug(ctx, args.workspaceSlug);
    const now = Date.now();
    const template = args.templateRef
      ? builtinBoardTypeTemplates.get(
          `${args.templateRef.pluginId}:${args.templateRef.templateId}:${args.templateRef.version}`,
        )
      : undefined;
    if (args.templateRef && !template) {
      throw new Error("Board type template not found");
    }
    if (args.templateRef && !isRequiredBuiltinPluginId(args.templateRef.pluginId)) {
      const extension = await ctx.db
        .query("workspaceExtensions")
        .withIndex("by_workspace_plugin", (query) =>
          query
            .eq("workspaceId", workspace._id)
            .eq("pluginId", args.templateRef!.pluginId),
        )
        .unique();
      if (!extension || extension.status !== "enabled") {
        throw new Error("Plugin is not enabled for this workspace");
      }
    }

    const name = args.name || template?.name || "Board type";
    const baseKey = createSlug(args.key ?? name) || "board-type";

    let key = baseKey;
    let suffix = 2;
    while (
      await ctx.db
        .query("boardTypes")
        .withIndex("by_workspace_key", (query) =>
          query.eq("workspaceId", workspace._id).eq("key", key),
        )
        .unique()
    ) {
      key = `${baseKey}-${suffix}`;
      suffix += 1;
    }

    const statuses = template?.defaultLifecycleStatuses ?? createDefaultLifecycleStatuses();
    const defaultViewIds = template?.defaultViewIds ?? ["core-kanban:board"];
    const boardTypeId = await ctx.db.insert("boardTypes", {
      workspaceId: workspace._id,
      key,
      name,
      description: args.description ?? template?.description,
      lifecycleConfig: {
        statuses,
        initialStatusKey: statuses[0]?.key ?? "backlog",
      },
      defaultViewIds,
      viewDefaults: createBoardTypeViewDefaultsEnvelope({
        defaultViewIds,
      }),
      defaultCardTypeKey: template?.defaultCardTypeKey ?? "core.todo",
      templateSource: args.templateRef
        ? {
            pluginId: args.templateRef.pluginId,
            templateId: args.templateRef.templateId,
            version: args.templateRef.version,
          }
        : undefined,
      createdAt: now,
      updatedAt: now,
    });

    return { boardTypeId };
  },
});

export const createStatus = mutation({
  args: {
    workspaceSlug: v.string(),
    boardTypeId: v.id("boardTypes"),
    label: v.string(),
    category: v.optional(
      v.union(v.literal("todo"), v.literal("active"), v.literal("done"), v.literal("custom")),
    ),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccessBySlug(ctx, args.workspaceSlug);
    const boardType = await requireBoardTypeInWorkspace({
      ctx,
      workspaceId: workspace._id,
      boardTypeId: args.boardTypeId,
    });
    const now = Date.now();
    const sortedStatuses = sortByOrderKey(boardType.lifecycleConfig.statuses);
    const statusKeys = new Set(sortedStatuses.map((status) => status.key));
    const key = uniqueStatusKey(statusKeys, toStatusKey(args.label));
    const orderKey = createKeyAfter(sortedStatuses.at(-1)?.orderKey);

    const nextStatuses = [...sortedStatuses, {
      key,
      label: args.label,
      category: args.category ?? "custom",
      orderKey,
    }];

    await ctx.db.patch(boardType._id, {
      lifecycleConfig: {
        ...boardType.lifecycleConfig,
        statuses: nextStatuses,
      },
      updatedAt: now,
    });

    return { key };
  },
});

export const renameStatusLabel = mutation({
  args: {
    workspaceSlug: v.string(),
    boardTypeId: v.id("boardTypes"),
    statusKey: v.string(),
    label: v.string(),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccessBySlug(ctx, args.workspaceSlug);
    const boardType = await requireBoardTypeInWorkspace({
      ctx,
      workspaceId: workspace._id,
      boardTypeId: args.boardTypeId,
    });

    if (!boardType.lifecycleConfig.statuses.some((status) => status.key === args.statusKey)) {
      throw new Error("Status not found");
    }

    await ctx.db.patch(boardType._id, {
      lifecycleConfig: {
        ...boardType.lifecycleConfig,
        statuses: boardType.lifecycleConfig.statuses.map((status) =>
          status.key === args.statusKey
            ? {
                ...status,
                label: args.label,
              }
            : status,
        ),
      },
      updatedAt: Date.now(),
    });

    return { statusKey: args.statusKey };
  },
});

export const reorderStatuses = mutation({
  args: {
    workspaceSlug: v.string(),
    boardTypeId: v.id("boardTypes"),
    statusKey: v.string(),
    previousOrderKey: v.optional(v.string()),
    nextOrderKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccessBySlug(ctx, args.workspaceSlug);
    const boardType = await requireBoardTypeInWorkspace({
      ctx,
      workspaceId: workspace._id,
      boardTypeId: args.boardTypeId,
    });

    if (!boardType.lifecycleConfig.statuses.some((status) => status.key === args.statusKey)) {
      throw new Error("Status not found");
    }

    const orderKey = createKeyBetween(args.previousOrderKey, args.nextOrderKey);
    await ctx.db.patch(boardType._id, {
      lifecycleConfig: {
        ...boardType.lifecycleConfig,
        statuses: boardType.lifecycleConfig.statuses.map((status) =>
          status.key === args.statusKey
            ? {
                ...status,
                orderKey,
              }
            : status,
        ),
      },
      updatedAt: Date.now(),
    });

    return { statusKey: args.statusKey, orderKey };
  },
});

export const deleteStatus = mutation({
  args: {
    workspaceSlug: v.string(),
    boardTypeId: v.id("boardTypes"),
    statusKey: v.string(),
    destinationStatusKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccessBySlug(ctx, args.workspaceSlug);
    const userId = await getCurrentUserId(ctx);
    const boardType = await requireBoardTypeInWorkspace({
      ctx,
      workspaceId: workspace._id,
      boardTypeId: args.boardTypeId,
    });

    const statuses = sortByOrderKey(boardType.lifecycleConfig.statuses);
    if (statuses.length <= 1) {
      throw new Error("Board type requires at least one status");
    }

    const sourceIndex = statuses.findIndex((status) => status.key === args.statusKey);
    if (sourceIndex === -1) {
      throw new Error("Status not found");
    }

    const destinationStatus = args.destinationStatusKey
      ? statuses.find((status) => status.key === args.destinationStatusKey)
      : statuses[sourceIndex - 1] ?? statuses[sourceIndex + 1];

    if (!destinationStatus || destinationStatus.key === args.statusKey) {
      throw new Error("Destination status not found");
    }

    const nextStatuses = statuses.filter((status) => status.key !== args.statusKey);
    const nextInitialStatusKey =
      boardType.lifecycleConfig.initialStatusKey === args.statusKey
        ? destinationStatus.key
        : boardType.lifecycleConfig.initialStatusKey;

    await ctx.db.patch(boardType._id, {
      lifecycleConfig: {
        ...boardType.lifecycleConfig,
        statuses: nextStatuses,
        initialStatusKey: nextInitialStatusKey,
      },
      updatedAt: Date.now(),
    });

    const boards = await listBoardsByType({
      ctx,
      workspaceId: workspace._id,
      boardTypeId: boardType._id,
    });

    for (const board of boards) {
      const [sourceCards, destinationCards] = await Promise.all([
        ctx.db
          .query("cards")
          .withIndex("by_board_status", (query) =>
            query.eq("boardId", board._id).eq("statusKey", args.statusKey),
          )
          .collect(),
        ctx.db
          .query("cards")
          .withIndex("by_board_status", (query) =>
            query.eq("boardId", board._id).eq("statusKey", destinationStatus.key),
          )
          .collect(),
      ]);

      let previousOrderKey = sortByOrderKey(destinationCards).at(-1)?.orderKey;
      for (const card of sortByOrderKey(sourceCards)) {
        previousOrderKey = createKeyAfter(previousOrderKey);

        await ctx.db.patch(card._id, {
          statusKey: destinationStatus.key,
          orderKey: previousOrderKey,
          updatedAt: Date.now(),
        });

        await emitCardEvent(ctx, workspace._id, {
          name: "card.moved",
          actorId: userId,
          boardId: board._id,
          cardId: card._id,
          statusKey: destinationStatus.key,
          previousStatusKey: args.statusKey,
          nextStatusKey: destinationStatus.key,
          cardTypeId: card.typeKey,
          tagIds: card.tagIds,
          previousColumnId: args.statusKey,
          nextColumnId: destinationStatus.key,
          workspaceId: workspace._id,
        });
      }
    }

    return {
      destinationStatusKey: destinationStatus.key,
      deletedStatusKey: args.statusKey,
    };
  },
});

export const setInitialStatus = mutation({
  args: {
    workspaceSlug: v.string(),
    boardTypeId: v.id("boardTypes"),
    statusKey: v.string(),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccessBySlug(ctx, args.workspaceSlug);
    const boardType = await requireBoardTypeInWorkspace({
      ctx,
      workspaceId: workspace._id,
      boardTypeId: args.boardTypeId,
    });

    if (!boardType.lifecycleConfig.statuses.some((status) => status.key === args.statusKey)) {
      throw new Error("Status not found");
    }

    await ctx.db.patch(boardType._id, {
      lifecycleConfig: {
        ...boardType.lifecycleConfig,
        initialStatusKey: args.statusKey,
      },
      updatedAt: Date.now(),
    });

    return { statusKey: args.statusKey };
  },
});
