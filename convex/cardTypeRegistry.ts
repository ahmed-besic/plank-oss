import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getCurrentUserId, requireWorkspaceAccessBySlug } from "./lib/auth";
import { createDefaultCardBody } from "@plank/domain";

type ScalarType = "string" | "number" | "boolean" | "timestamp";

function validateScalar(type: ScalarType, value: unknown) {
  if (value === null || value === undefined) return true;
  if (type === "string") return typeof value === "string";
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "timestamp") return typeof value === "number" && Number.isFinite(value);
  return false;
}

function isValidBody(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const body = value as { type?: unknown; content?: unknown };
  return body.type === "blocknote" && Array.isArray(body.content);
}

async function resolveRegistry(
  ctx: Parameters<typeof mutation>[0] extends never ? never : any,
  workspaceId: Id<"workspaces">,
  typeKey: string,
) {
  const row = await ctx.db
    .query("cardTypeRegistry")
    .withIndex("by_workspace_type_key", (q: any) =>
      q.eq("workspaceId", workspaceId).eq("typeKey", typeKey),
    )
    .unique();
  if (!row) {
    throw new Error("Card type manifest not found");
  }
  return row as Doc<"cardTypeRegistry">;
}

export const listForWorkspace = query({
  args: { workspaceSlug: v.string() },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccessBySlug(ctx, args.workspaceSlug);
    return await ctx.db
      .query("cardTypeRegistry")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .collect();
  },
});

export const installCardTypeManifest = mutation({
  args: {
    workspaceSlug: v.string(),
    pluginId: v.string(),
    typeKey: v.string(),
    schemaVersion: v.number(),
    manifest: v.object({
      pluginId: v.string(),
      typeKey: v.string(),
      schemaVersion: v.number(),
      fields: v.object({
        core: v.array(
          v.object({
            key: v.string(),
            label: v.string(),
            valueType: v.union(
              v.literal("string"),
              v.literal("number"),
              v.literal("boolean"),
              v.literal("timestamp"),
            ),
            required: v.optional(v.boolean()),
            defaultValue: v.optional(v.any()),
            enumValues: v.optional(v.array(v.string())),
            enumOptions: v.optional(
              v.array(
                v.object({
                  label: v.string(),
                  value: v.string(),
                  color: v.optional(v.string()),
                }),
              ),
            ),
            searchable: v.optional(v.boolean()),
            indexed: v.optional(v.boolean()),
          }),
        ),
      }),
      bodyPolicy: v.object({ allowEmpty: v.boolean(), maxBlocks: v.optional(v.number()) }),
      metaPolicy: v.object({ titleRequired: v.boolean() }),
      automationExposedFields: v.array(v.string()),
      queryIndexHints: v.array(
        v.object({
          namespace: v.union(v.literal("core"), v.literal("custom")),
          fieldKey: v.string(),
          valueType: v.union(
            v.literal("string"),
            v.literal("number"),
            v.literal("boolean"),
            v.literal("timestamp"),
          ),
        }),
      ),
      capabilities: v.optional(
        v.object({
          provides: v.record(v.string(), v.any()),
        }),
      ),
      hierarchyPolicy: v.optional(
        v.object({
          supportsChildren: v.boolean(),
          maxDepth: v.optional(v.number()),
          allowedChildTypeKeys: v.optional(v.array(v.string())),
        }),
      ),
    }),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccessBySlug(ctx, args.workspaceSlug);
    const now = Date.now();

    const existing = await ctx.db
      .query("cardTypeRegistry")
      .withIndex("by_workspace_type_key", (q) =>
        q.eq("workspaceId", workspace._id).eq("typeKey", args.typeKey),
      )
      .unique();
    if (existing) {
      throw new Error("typeKey already exists in registry");
    }

    const byPluginDifferentKey = await ctx.db
      .query("cardTypeRegistry")
      .withIndex("by_workspace_plugin", (q) =>
        q.eq("workspaceId", workspace._id).eq("pluginId", args.pluginId),
      )
      .collect();

    if (byPluginDifferentKey.some((row) => row.typeKey === args.typeKey)) {
      throw new Error("Plugin already registered this type key");
    }

    const id = await ctx.db.insert("cardTypeRegistry", {
      workspaceId: workspace._id,
      pluginId: args.pluginId,
      typeKey: args.typeKey,
      schemaVersion: args.schemaVersion,
      manifest: args.manifest,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    return { id };
  },
});

export const updateCardTypeManifest = mutation({
  args: {
    workspaceSlug: v.string(),
    typeKey: v.string(),
    nextSchemaVersion: v.number(),
    manifest: v.any(),
    migrationPlan: v.object({
      addedFields: v.array(v.string()),
      removedFields: v.array(v.string()),
      enumChangedFields: v.array(v.string()),
      indexHintChangedFields: v.array(v.string()),
      notes: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccessBySlug(ctx, args.workspaceSlug);
    const existing = await resolveRegistry(ctx, workspace._id, args.typeKey);

    if (args.nextSchemaVersion <= existing.schemaVersion) {
      throw new Error("nextSchemaVersion must be greater than current schema version");
    }

    if (
      args.migrationPlan.addedFields.length === 0 &&
      args.migrationPlan.removedFields.length === 0 &&
      args.migrationPlan.enumChangedFields.length === 0 &&
      args.migrationPlan.indexHintChangedFields.length === 0
    ) {
      throw new Error("Explicit migration plan is required for manifest updates");
    }

    await ctx.db.patch(existing._id, {
      schemaVersion: args.nextSchemaVersion,
      manifest: args.manifest,
      updatedAt: Date.now(),
    });

    return {
      typeKey: args.typeKey,
      schemaVersion: args.nextSchemaVersion,
      migrationQueued: true,
    };
  },
});

export const patchMeta = mutation({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
    cardId: v.id("cards"),
    meta: v.object({
      title: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccessBySlug(ctx, args.workspaceSlug);
    const card = await ctx.db.get(args.cardId);
    if (!card || card.workspaceId !== workspace._id || card.boardId !== args.boardId) {
      throw new Error("Card not found");
    }

    const nextMeta = { ...card.meta, ...args.meta };
    if (!nextMeta.title || nextMeta.title.trim().length === 0) {
      throw new Error("meta.title is required");
    }

    await ctx.db.patch(card._id, { meta: nextMeta, updatedAt: Date.now() });
    return { cardId: card._id };
  },
});

export const patchBody = mutation({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
    cardId: v.id("cards"),
    body: v.any(),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccessBySlug(ctx, args.workspaceSlug);
    const card = await ctx.db.get(args.cardId);
    if (!card || card.workspaceId !== workspace._id || card.boardId !== args.boardId) {
      throw new Error("Card not found");
    }

    if (!isValidBody(args.body)) {
      throw new Error("Invalid body");
    }

    await ctx.db.patch(card._id, {
      body: args.body,
      updatedAt: Date.now(),
    });
    return { cardId: card._id };
  },
});

export const patchCoreFields = mutation({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
    cardId: v.id("cards"),
    updates: v.record(v.string(), v.any()),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccessBySlug(ctx, args.workspaceSlug);
    const card = await ctx.db.get(args.cardId);
    if (!card || card.workspaceId !== workspace._id || card.boardId !== args.boardId) {
      throw new Error("Card not found");
    }

    const registry = await resolveRegistry(ctx, workspace._id, card.typeKey);
    const schemaMap = new Map(registry.manifest.fields.core.map((f) => [f.key, f]));

    for (const [key, value] of Object.entries(args.updates)) {
      const field = schemaMap.get(key);
      if (!field) {
        throw new Error(`Unknown core field: ${key}`);
      }
      if (!validateScalar(field.valueType, value)) {
        throw new Error(`Invalid core field value: ${key}`);
      }
    }

    await ctx.db.patch(card._id, {
      fields: {
        ...card.fields,
        core: {
          ...card.fields.core,
          ...args.updates,
        },
      },
      updatedAt: Date.now(),
    });
    return { cardId: card._id };
  },
});

export const patchCustomFields = mutation({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
    cardId: v.id("cards"),
    updates: v.record(v.string(), v.any()),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccessBySlug(ctx, args.workspaceSlug);
    const card = await ctx.db.get(args.cardId);
    if (!card || card.workspaceId !== workspace._id || card.boardId !== args.boardId) {
      throw new Error("Card not found");
    }

    const customSchema = await ctx.db
      .query("workspaceCardTypeCustomFields")
      .withIndex("by_workspace_type", (q) =>
        q.eq("workspaceId", workspace._id).eq("typeKey", card.typeKey),
      )
      .collect();
    const schemaMap = new Map(customSchema.map((f) => [f.key, f]));

    for (const [key, value] of Object.entries(args.updates)) {
      const field = schemaMap.get(key);
      if (!field) {
        throw new Error(`Unknown custom field: ${key}`);
      }
      if (!validateScalar(field.valueType, value)) {
        throw new Error(`Invalid custom field value: ${key}`);
      }
    }

    await ctx.db.patch(card._id, {
      fields: {
        ...card.fields,
        custom: {
          ...card.fields.custom,
          ...args.updates,
        },
      },
      updatedAt: Date.now(),
    });
    return { cardId: card._id };
  },
});

export const switchType = mutation({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
    cardId: v.id("cards"),
    fromTypeKey: v.string(),
    toTypeKey: v.string(),
    coreFieldMapping: v.record(v.string(), v.string()),
    customFieldPolicy: v.union(
      v.literal("drop"),
      v.literal("keep"),
      v.literal("remap"),
    ),
    bodyPolicy: v.union(v.literal("keep"), v.literal("reset")),
    metaPolicy: v.union(v.literal("keep"), v.literal("reset_title")),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccessBySlug(ctx, args.workspaceSlug);
    const userId = await getCurrentUserId(ctx);
    const card = await ctx.db.get(args.cardId);
    if (!card || card.workspaceId !== workspace._id || card.boardId !== args.boardId) {
      throw new Error("Card not found");
    }
    if (card.typeKey !== args.fromTypeKey) {
      throw new Error("fromTypeKey does not match current card type");
    }

    const toRegistry = await resolveRegistry(ctx, workspace._id, args.toTypeKey);

    const nextCore: Record<string, unknown> = {};
    const toCoreKeys = new Set(toRegistry.manifest.fields.core.map((f) => f.key));

    for (const [toField, fromField] of Object.entries(args.coreFieldMapping)) {
      if (!toCoreKeys.has(toField)) {
        throw new Error(`Unknown target core field: ${toField}`);
      }
      if (fromField in card.fields.core) {
        nextCore[toField] = card.fields.core[fromField];
      } else if (fromField in card.fields.custom) {
        nextCore[toField] = card.fields.custom[fromField];
      }
    }

    const diagnostics: string[] = [];
    for (const field of toRegistry.manifest.fields.core) {
      if (field.required && !(field.key in nextCore)) {
        if (field.defaultValue !== undefined) {
          nextCore[field.key] = field.defaultValue;
        } else {
          diagnostics.push(`Missing required core field mapping: ${field.key}`);
        }
      }
    }

    if (diagnostics.length > 0) {
      return {
        ok: false,
        diagnostics,
      };
    }

    const nextCustom =
      args.customFieldPolicy === "keep"
        ? card.fields.custom
        : {};

    const nextBody =
      args.bodyPolicy === "reset"
        ? createDefaultCardBody()
        : card.body;
    const nextMeta =
      args.metaPolicy === "reset_title"
        ? { ...card.meta, title: card.meta.title || "Untitled" }
        : card.meta;

    await ctx.db.patch(card._id, {
      typeKey: toRegistry.typeKey,
      typeSchemaVersion: toRegistry.schemaVersion,
      fields: {
        core: nextCore,
        custom: nextCustom,
      },
      body: nextBody,
      meta: nextMeta,
      updatedAt: Date.now(),
    });

    return {
      ok: true,
      cardId: card._id,
      switchedBy: userId,
      toTypeKey: toRegistry.typeKey,
      toSchemaVersion: toRegistry.schemaVersion,
      diagnostics: [],
    };
  },
});

export const addCustomField = mutation({
  args: {
    workspaceSlug: v.string(),
    typeKey: v.string(),
    key: v.string(),
    label: v.string(),
    valueType: v.union(
      v.literal("string"),
      v.literal("number"),
      v.literal("boolean"),
      v.literal("timestamp"),
    ),
    required: v.optional(v.boolean()),
    defaultValue: v.optional(v.any()),
    enumValues: v.optional(v.array(v.string())),
    enumOptions: v.optional(
      v.array(
        v.object({
          label: v.string(),
          value: v.string(),
          color: v.optional(v.string()),
        }),
      ),
    ),
    searchable: v.optional(v.boolean()),
    indexed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccessBySlug(ctx, args.workspaceSlug);
    const userId = await getCurrentUserId(ctx);

    await resolveRegistry(ctx, workspace._id, args.typeKey);

    const existing = await ctx.db
      .query("workspaceCardTypeCustomFields")
      .withIndex("by_workspace_type_key", (q) =>
        q.eq("workspaceId", workspace._id).eq("typeKey", args.typeKey).eq("key", args.key),
      )
      .unique();
    if (existing) {
      throw new Error("Custom field key already exists");
    }

    const now = Date.now();
    const id = await ctx.db.insert("workspaceCardTypeCustomFields", {
      workspaceId: workspace._id,
      typeKey: args.typeKey,
      key: args.key,
      label: args.label,
      valueType: args.valueType,
      required: args.required,
      defaultValue: args.defaultValue,
      enumValues: args.enumValues,
      enumOptions: args.enumOptions,
      searchable: args.searchable,
      indexed: args.indexed,
      status: "active",
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    });

    return { id };
  },
});

export const removeCustomField = mutation({
  args: {
    workspaceSlug: v.string(),
    typeKey: v.string(),
    key: v.string(),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccessBySlug(ctx, args.workspaceSlug);
    const row = await ctx.db
      .query("workspaceCardTypeCustomFields")
      .withIndex("by_workspace_type_key", (q) =>
        q.eq("workspaceId", workspace._id).eq("typeKey", args.typeKey).eq("key", args.key),
      )
      .unique();
    if (!row) {
      throw new Error("Custom field not found");
    }
    await ctx.db.patch(row._id, {
      status: "deleted",
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});
