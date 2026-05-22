import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { createSlug, normalizePropertyOptions } from "@plank/domain";
import { requireWorkspaceAccessBySlug } from "./lib/auth";

type ScalarFieldType = "string" | "number" | "boolean" | "timestamp";

function normalizePropertyKey(input: string) {
  return createSlug(input).replace(/-/g, "_") || "property";
}

function resolveScalarFieldType(propertyType: string): ScalarFieldType {
  if (propertyType === "text" || propertyType === "string") {
    return "string";
  }
  if (propertyType === "number") {
    return "number";
  }
  if (propertyType === "boolean") {
    return "boolean";
  }
  if (propertyType === "date" || propertyType === "timestamp") {
    return "timestamp";
  }
  if (propertyType === "select" || propertyType === "user") {
    return "string";
  }
  if (propertyType.includes(":")) {
    return "string";
  }
  throw new Error(`Unsupported property type: ${propertyType}`);
}

function normalizeDeleteCandidates(propertyKey: string) {
  const normalized = normalizePropertyKey(propertyKey);
  return [...new Set([propertyKey, normalized, propertyKey.replace(/-/g, "_")])];
}

function resolveCustomPropertyType(field: {
  key: string;
  label: string;
  valueType: ScalarFieldType;
  propertyType?: string;
  enumValues?: string[];
  enumOptions?: Array<{ label: string; value: string; color?: string }>;
}) {
  if (field.propertyType) {
    return field.propertyType;
  }
  if ((field.enumOptions?.length ?? 0) > 0 || (field.enumValues?.length ?? 0) > 0) {
    return "select";
  }
  if (field.valueType === "number") {
    return "number";
  }
  if (field.valueType === "boolean") {
    return "boolean";
  }
  if (field.valueType === "timestamp") {
    return "date";
  }

  const normalized = `${field.key} ${field.label}`.toLowerCase();
  if (/\b(assignee|assigned|owner|teammate|member|user|person|people)\b/.test(normalized)) {
    return "user";
  }

  return "text";
}

function mapCustomFieldsByTypeKey(
  rows: Array<{
    typeKey: string;
    key: string;
    label: string;
    valueType: ScalarFieldType;
    propertyType?: string;
    required?: boolean;
    defaultValue?: unknown;
    enumValues?: string[];
    enumOptions?: Array<{ label: string; value: string; color?: string }>;
    status: "active" | "deleted";
  }>,
) {
  const byType = new Map<string, typeof rows>();
  for (const row of rows) {
    if (row.status !== "active") {
      continue;
    }
    const current = byType.get(row.typeKey) ?? [];
    current.push(row);
    byType.set(row.typeKey, current);
  }
  return byType;
}

function parsePropertyOptionCandidate(option: unknown) {
  if (!option || typeof option !== "object" || !("value" in option)) {
    return null;
  }

  const rawValue = (option as { value?: unknown }).value;
  if (typeof rawValue !== "string" || rawValue.length === 0) {
    return null;
  }

  const rawLabel = (option as { label?: unknown }).label;
  const rawColor = (option as { color?: unknown }).color;

  return {
    label: typeof rawLabel === "string" && rawLabel.length > 0 ? rawLabel : rawValue,
    value: rawValue,
    color: typeof rawColor === "string" && rawColor.length > 0 ? rawColor : undefined,
  };
}

export const listForWorkspace = query({
  args: {
    workspaceSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccessBySlug(ctx, args.workspaceSlug);
    const rows = await ctx.db
      .query("cardTypeRegistry")
      .withIndex("by_workspace", (query) => query.eq("workspaceId", workspace._id))
      .collect();
    const customFields = await ctx.db
      .query("workspaceCardTypeCustomFields")
      .withIndex("by_workspace", (query) => query.eq("workspaceId", workspace._id))
      .collect();
    const customFieldsByType = mapCustomFieldsByTypeKey(customFields);

    return rows
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
          defaultValue: field.defaultValue,
          config: {
            options: normalizePropertyOptions({
              enumOptions: field.enumOptions,
              enumValues: field.enumValues,
            }),
          },
        }));
        const customSchema = (customFieldsByType.get(row.typeKey) ?? []).map((field, index) => ({
          key: field.key,
          name: field.label,
          type: resolveCustomPropertyType(field),
          orderKey: String(coreSchema.length + index),
          required: field.required,
          defaultValue: field.defaultValue,
          config: {
            source: "custom",
            allowMultiple: field.propertyType === "user" ? true : undefined,
            options: normalizePropertyOptions({
              enumOptions: field.enumOptions,
              enumValues: field.enumValues,
            }),
          },
        }));

        return {
          id: row.typeKey,
          key: row.typeKey,
          name: row.typeKey,
          description: `${row.pluginId} (${row.schemaVersion})`,
          schemaVersion: row.schemaVersion,
          propertiesSchema: [...coreSchema, ...customSchema],
          defaultTagIds: [],
        };
      })
      .sort((left, right) => left.key.localeCompare(right.key));
  },
});

export const listByBoardType = query({
  args: {
    workspaceSlug: v.string(),
    boardTypeId: v.id("boardTypes"),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccessBySlug(ctx, args.workspaceSlug);
    const rows = await ctx.db
      .query("cardTypeRegistry")
      .withIndex("by_workspace", (query) => query.eq("workspaceId", workspace._id))
      .collect();
    const customFields = await ctx.db
      .query("workspaceCardTypeCustomFields")
      .withIndex("by_workspace", (query) => query.eq("workspaceId", workspace._id))
      .collect();
    const customFieldsByType = mapCustomFieldsByTypeKey(customFields);

    return rows
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
          defaultValue: field.defaultValue,
          config: {
            options: normalizePropertyOptions({
              enumOptions: field.enumOptions,
              enumValues: field.enumValues,
            }),
          },
        }));
        const customSchema = (customFieldsByType.get(row.typeKey) ?? []).map((field, index) => ({
          key: field.key,
          name: field.label,
          type: resolveCustomPropertyType(field),
          orderKey: String(coreSchema.length + index),
          required: field.required,
          defaultValue: field.defaultValue,
          config: {
            source: "custom",
            allowMultiple: field.propertyType === "user" ? true : undefined,
            options: normalizePropertyOptions({
              enumOptions: field.enumOptions,
              enumValues: field.enumValues,
            }),
          },
        }));

        return {
          id: row.typeKey,
          key: row.typeKey,
          name: row.typeKey,
          description: `${row.pluginId} (${row.schemaVersion})`,
          schemaVersion: row.schemaVersion,
          propertiesSchema: [...coreSchema, ...customSchema],
          defaultTagIds: [],
        };
      })
      .sort((left, right) => left.key.localeCompare(right.key));
  },
});

export const createCardType = mutation({
  args: {
    workspaceSlug: v.string(),
    name: v.string(),
    key: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccessBySlug(ctx, args.workspaceSlug);

    const typeKey = createSlug(args.key ?? args.name) || "custom";
    const existing = await ctx.db
      .query("cardTypeRegistry")
      .withIndex("by_workspace_type_key", (query) =>
        query.eq("workspaceId", workspace._id).eq("typeKey", typeKey),
      )
      .unique();
    if (existing) {
      throw new Error("typeKey already exists");
    }

    await ctx.db.insert("cardTypeRegistry", {
      workspaceId: workspace._id,
      pluginId: "workspace-local",
      typeKey,
      schemaVersion: 1,
      manifest: {
        pluginId: "workspace-local",
        typeKey,
        schemaVersion: 1,
        fields: { core: [] },
        bodyPolicy: { allowEmpty: true },
        metaPolicy: { titleRequired: true },
        automationExposedFields: [],
        queryIndexHints: [],
      },
      status: "active",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { cardTypeId: typeKey };
  },
});

export const createProperty = mutation({
  args: {
    workspaceSlug: v.string(),
    typeKey: v.string(),
    name: v.string(),
    type: v.string(),
    required: v.optional(v.boolean()),
    config: v.optional(v.any()),
    defaultValue: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const { workspace, userId } = await requireWorkspaceAccessBySlug(ctx, args.workspaceSlug);
    if (args.type === "relation") {
      throw new Error(
        "Relation properties are deprecated. Use card relations instead.",
      );
    }
    const key = normalizePropertyKey(args.name);
    const valueType = resolveScalarFieldType(args.type);
    const enumValues = Array.isArray(args.config?.options)
      ? args.config.options
          .map((option: unknown) =>
            option && typeof option === "object" && "value" in option
              ? (option as { value?: unknown }).value
              : undefined,
          )
          .filter(
            (option: unknown): option is string =>
              typeof option === "string" && option.length > 0,
          )
      : undefined;
    const enumOptions = Array.isArray(args.config?.options)
      ? args.config.options
          .map((option: unknown) => parsePropertyOptionCandidate(option))
          .filter(
            (
              option: { label: string; value: string; color?: string } | null,
            ): option is { label: string; value: string; color?: string } =>
              Boolean(option && option.value.length > 0),
          )
      : undefined;

    const existing = await ctx.db
      .query("workspaceCardTypeCustomFields")
      .withIndex("by_workspace_type_key", (q) =>
        q.eq("workspaceId", workspace._id).eq("typeKey", args.typeKey).eq("key", key),
      )
      .unique();
    if (existing?.status === "active") {
      throw new Error("Property key already exists");
    }

    const now = Date.now();
    const patch = {
      label: args.name,
      valueType,
      propertyType: args.type,
      required: args.required,
      defaultValue: args.defaultValue,
      enumValues,
      enumOptions,
      searchable: false,
      indexed: false,
      status: "active" as const,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("workspaceCardTypeCustomFields", {
        workspaceId: workspace._id,
        typeKey: args.typeKey,
        key,
        createdBy: userId,
        createdAt: now,
        ...patch,
      });
    }

    return { key };
  },
});

export const deleteProperty = mutation({
  args: {
    workspaceSlug: v.string(),
    typeKey: v.string(),
    propertyKey: v.string(),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccessBySlug(ctx, args.workspaceSlug);

    const candidates = normalizeDeleteCandidates(args.propertyKey);
    let row = await ctx.db
      .query("workspaceCardTypeCustomFields")
      .withIndex("by_workspace_type_key", (q) =>
        q.eq("workspaceId", workspace._id).eq("typeKey", args.typeKey).eq("key", candidates[0]!),
      )
      .unique();
    for (const candidate of candidates.slice(1)) {
      if (row) {
        break;
      }
      row = await ctx.db
        .query("workspaceCardTypeCustomFields")
        .withIndex("by_workspace_type_key", (q) =>
          q.eq("workspaceId", workspace._id).eq("typeKey", args.typeKey).eq("key", candidate),
        )
        .unique();
    }

    if (!row) {
      throw new Error("Property key not found");
    }
    if (row.status === "deleted") {
      return { ok: true };
    }

    await ctx.db.patch(row._id, {
      status: "deleted",
      updatedAt: Date.now(),
    });

    return { ok: true };
  },
});

export const updatePropertyOptions = mutation({
  args: {
    workspaceSlug: v.string(),
    typeKey: v.string(),
    propertyKey: v.string(),
    options: v.array(
      v.object({
        label: v.string(),
        value: v.string(),
        color: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccessBySlug(ctx, args.workspaceSlug);
    const candidates = normalizeDeleteCandidates(args.propertyKey);
    let customFieldRow = await ctx.db
      .query("workspaceCardTypeCustomFields")
      .withIndex("by_workspace_type_key", (q) =>
        q.eq("workspaceId", workspace._id).eq("typeKey", args.typeKey).eq("key", candidates[0]!),
      )
      .unique();
    for (const candidate of candidates.slice(1)) {
      if (customFieldRow) {
        break;
      }
      customFieldRow = await ctx.db
        .query("workspaceCardTypeCustomFields")
        .withIndex("by_workspace_type_key", (q) =>
          q.eq("workspaceId", workspace._id).eq("typeKey", args.typeKey).eq("key", candidate),
        )
        .unique();
    }

    const seen = new Set<string>();
    const enumValues = args.options
      .map((option) => option.value.trim())
      .filter((value) => value.length > 0)
      .filter((value) => {
        if (seen.has(value)) {
          return false;
        }
        seen.add(value);
        return true;
      });
    const enumOptions = args.options
      .map((option) => ({
        label: option.label.trim() || option.value.trim(),
        value: option.value.trim(),
        color: option.color,
      }))
      .filter((option) => option.value.length > 0)
      .filter((option, index, options) =>
        options.findIndex((candidate) => candidate.value === option.value) === index,
      );
    if (customFieldRow?.status === "active") {
      await ctx.db.patch(customFieldRow._id, {
        enumValues,
        enumOptions,
        updatedAt: Date.now(),
      });

      return { ok: true, key: customFieldRow.key };
    }

    const registryRow = await ctx.db
      .query("cardTypeRegistry")
      .withIndex("by_workspace_type_key", (q) =>
        q.eq("workspaceId", workspace._id).eq("typeKey", args.typeKey),
      )
      .unique();
    if (!registryRow || registryRow.status !== "active") {
      throw new Error("Property key not found");
    }

    const nextFields = registryRow.manifest.fields.core.map((field) =>
      candidates.includes(field.key)
        ? {
            ...field,
            enumValues,
            enumOptions,
          }
        : field,
    );
    const changed = nextFields.some(
      (field, index) => field !== registryRow.manifest.fields.core[index],
    );
    if (!changed) {
      throw new Error("Property key not found");
    }

    await ctx.db.patch(registryRow._id, {
      manifest: {
        ...registryRow.manifest,
        fields: {
          ...registryRow.manifest.fields,
          core: nextFields,
        },
      },
      updatedAt: Date.now(),
    });

    return { ok: true, key: candidates[0]! };
  },
});
