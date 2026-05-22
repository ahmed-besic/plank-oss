import {
  compareOrderKeys,
  createDefaultCardBody,
  normalizeCardBody,
  type CardRelationType,
} from "@plank/domain";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { emitCardEvent } from "./plugins";
import { getCardScopeId, SHARED_VIEW_SCOPE_ID } from "./plugins";

type DbCtx = MutationCtx | QueryCtx;
type ScalarValueType = "string" | "number" | "boolean" | "timestamp";
type RuntimeFieldSchema = {
  key: string;
  valueType: ScalarValueType;
  propertyType?: string;
};
type CardFieldValue = string | string[] | number | boolean | null;
type CardChangeKind =
  | "new_card"
  | "title"
  | "description"
  | "property"
  | "tag"
  | "move"
  | "delete";

export const relationTypeValidator = v.union(
  v.literal("relates_to"),
  v.literal("blocked_by"),
  v.literal("references"),
);

export function sortByOrderKey<T extends { orderKey: string }>(rows: T[]) {
  return [...rows].sort((left, right) =>
    compareOrderKeys(left.orderKey, right.orderKey),
  );
}

export function isValidBody(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }
  const body = value as { type?: unknown; content?: unknown };
  return body.type === "blocknote" && Array.isArray(body.content);
}

function sanitizeBodyForPersistence(body: unknown) {
  return normalizeCardBody(body);
}

function validateScalar(
  valueType: ScalarValueType,
  value: unknown,
) {
  if (value === null || value === undefined) {
    return true;
  }
  if (valueType === "string") {
    return typeof value === "string";
  }
  if (valueType === "number") {
    return typeof value === "number" && Number.isFinite(value);
  }
  if (valueType === "boolean") {
    return typeof value === "boolean";
  }
  if (valueType === "timestamp") {
    return typeof value === "number" && Number.isFinite(value);
  }
  return false;
}

function validateFieldValue(field: RuntimeFieldSchema, value: unknown) {
  if (field.propertyType === "user" && Array.isArray(value)) {
    return value.every((entry) => typeof entry === "string" && entry.length > 0);
  }
  return validateScalar(field.valueType, value);
}

function getStatusByKey(boardType: Doc<"boardTypes">) {
  return new Map(
    boardType.lifecycleConfig.statuses.map((status) => [status.key, status]),
  );
}

export async function requireBoardWithType({
  ctx,
  workspaceId,
  boardId,
}: {
  ctx: DbCtx;
  workspaceId: Id<"workspaces">;
  boardId: Id<"boards">;
}) {
  const board = await ctx.db.get(boardId);
  if (!board || board.workspaceId !== workspaceId) {
    throw new Error("Board not found");
  }

  const boardType = await ctx.db.get(board.boardTypeId);
  if (!boardType || boardType.workspaceId !== workspaceId) {
    throw new Error("Board type not found");
  }

  return { board, boardType };
}

export async function requireCardInBoard({
  ctx,
  workspaceId,
  boardId,
  cardId,
}: {
  ctx: DbCtx;
  workspaceId: Id<"workspaces">;
  boardId: Id<"boards">;
  cardId: Id<"cards">;
}) {
  const card = await ctx.db.get(cardId);
  if (!card || card.workspaceId !== workspaceId || card.boardId !== boardId) {
    throw new Error("Card not found");
  }
  return card;
}

export function getCardScopeOrDefault(card: { scopeId?: string | null }) {
  return getCardScopeId(card);
}

export function getOutgoingRelationLabel(type: CardRelationType) {
  switch (type) {
    case "relates_to":
      return "relates to";
    case "blocked_by":
      return "blocked by";
    case "references":
      return "references";
  }
}

export function getIncomingRelationLabel(type: CardRelationType) {
  switch (type) {
    case "relates_to":
      return "related to";
    case "blocked_by":
      return "blocks";
    case "references":
      return "referenced by";
  }
}

export async function removeIncomingRelationsToCard({
  ctx,
  workspaceId,
  cardId,
}: {
  ctx: MutationCtx;
  workspaceId: Id<"workspaces">;
  cardId: Id<"cards">;
}) {
  const workspaceCards = await ctx.db
    .query("cards")
    .withIndex("by_workspace", (query) => query.eq("workspaceId", workspaceId))
    .collect();

  for (const candidate of workspaceCards) {
    if (candidate._id === cardId) {
      continue;
    }
    const nextRelations = candidate.relations.filter(
      (relation) => relation.targetCardId !== cardId,
    );
    if (nextRelations.length === candidate.relations.length) {
      continue;
    }
    await ctx.db.patch(candidate._id, {
      relations: nextRelations,
      updatedAt: Date.now(),
    });
  }
}

export async function deleteRows<T extends { _id: Id<any> }>(
  rows: T[],
  ctx: MutationCtx,
) {
  for (const row of rows) {
    await ctx.db.delete(row._id);
  }
}

export async function resolveRegistryType({
  ctx,
  workspaceId,
  requestedTypeKey,
}: {
  ctx: DbCtx;
  workspaceId: Id<"workspaces">;
  requestedTypeKey: string;
}) {
  const registry = await ctx.db
    .query("cardTypeRegistry")
    .withIndex("by_workspace_type_key", (q) =>
      q.eq("workspaceId", workspaceId).eq("typeKey", requestedTypeKey),
    )
    .unique();

  if (!registry || registry.status !== "active") {
    throw new Error("Card type is not installed or active");
  }

  return registry;
}

const INBOX_STATUS_KEY = "__inbox";

export async function resolveStatusAndColumn({
  board: _board,
  boardType,
  requestedStatusKey,
  requestedColumnId,
}: {
  board: Doc<"boards">;
  boardType: Doc<"boardTypes">;
  requestedStatusKey?: string;
  requestedColumnId?: string;
}) {
  const statuses = getStatusByKey(boardType);
  const rawKey =
    requestedStatusKey ??
    requestedColumnId ??
    boardType.lifecycleConfig.initialStatusKey;

  if (rawKey === INBOX_STATUS_KEY) {
    return { statusKey: INBOX_STATUS_KEY, columnId: INBOX_STATUS_KEY };
  }

  if (!statuses.has(rawKey)) {
    throw new Error("Status not found on this board type");
  }

  return {
    statusKey: rawKey,
    columnId: rawKey,
  };
}

export async function ensureTagIdsBelongToWorkspace({
  ctx,
  workspaceId,
  tagIds,
}: {
  ctx: MutationCtx;
  workspaceId: Id<"workspaces">;
  tagIds: Id<"tagDefinitions">[];
}) {
  for (const tagId of tagIds) {
    const tag = await ctx.db.get(tagId);
    if (!tag || tag.workspaceId !== workspaceId) {
      throw new Error("Tag not found");
    }
  }
}

export async function loadCustomFieldSchema({
  ctx,
  workspaceId,
  typeKey,
}: {
  ctx: DbCtx;
  workspaceId: Id<"workspaces">;
  typeKey: string;
}) {
  const rows = await ctx.db
    .query("workspaceCardTypeCustomFields")
    .withIndex("by_workspace_type", (q) =>
      q.eq("workspaceId", workspaceId).eq("typeKey", typeKey),
    )
    .collect();
  return rows.filter((row) => row.status === "active");
}

function validateFieldPatch({
  updates,
  schema,
}: {
  updates: Record<string, unknown>;
  schema: RuntimeFieldSchema[];
}) {
  const schemaMap = new Map(schema.map((field) => [field.key, field]));
  for (const [key, value] of Object.entries(updates)) {
    const field = schemaMap.get(key);
    if (!field) {
      throw new Error(`Unknown field key: ${key}`);
    }
    if (!validateFieldValue(field, value)) {
      throw new Error(`Invalid field value: ${key}`);
    }
  }
}

export function buildDefaultCoreFields(registry: Doc<"cardTypeRegistry">) {
  return Object.fromEntries(
    registry.manifest.fields.core
      .filter((field) => field.defaultValue !== undefined)
      .map((field) => [field.key, field.defaultValue]),
  ) as Record<string, CardFieldValue>;
}

export async function createCardWithSideEffects({
  ctx,
  workspaceId,
  boardId,
  scopeId,
  parentId,
  typeKey,
  typeSchemaVersion,
  title,
  statusKey,
  columnId,
  orderKey,
  defaultCore,
  userId,
}: {
  ctx: MutationCtx;
  workspaceId: Id<"workspaces">;
  boardId: Id<"boards">;
  scopeId?: string;
  parentId: Id<"cards"> | undefined;
  typeKey: string;
  typeSchemaVersion: number;
  title: string;
  statusKey: string;
  columnId: string;
  orderKey: string;
  defaultCore: Record<string, CardFieldValue>;
  userId: string;
}) {
  const now = Date.now();
  const cardId = await ctx.db.insert("cards", {
    workspaceId,
    boardId,
    scopeId: scopeId ?? SHARED_VIEW_SCOPE_ID,
    parentId,
    typeKey,
    typeSchemaVersion,
    meta: { title },
    statusKey,
    orderKey,
    fields: {
      core: defaultCore,
      custom: {},
    },
    relations: [],
    tagIds: [],
    body: createDefaultCardBody(),
    createdAt: now,
    updatedAt: now,
    createdBy: userId,
  });

  await emitCardEvent(ctx, workspaceId, {
    name: "card.created",
    actorId: userId,
    boardId,
    cardId,
    statusKey,
    nextStatusKey: statusKey,
    cardTypeId: typeKey,
    tagIds: [],
    nextColumnId: columnId,
    workspaceId,
  });

  return { cardId };
}

export function buildCoreAndCustomSchema({
  registry,
  customFields,
}: {
  registry: Doc<"cardTypeRegistry">;
  customFields: Doc<"workspaceCardTypeCustomFields">[];
}) {
  const coreSchema = registry.manifest.fields.core.map((field) => ({
    key: field.key,
    valueType: field.valueType,
    propertyType: undefined,
  }));
  const customSchema = customFields.map((field) => ({
    key: field.key,
    valueType: field.valueType,
    propertyType: field.propertyType,
  }));
  return { coreSchema, customSchema };
}

export function validateAndSplitPropertyUpdates({
  propertyUpdates,
  coreSchema,
  customSchema,
}: {
  propertyUpdates: Record<string, unknown>;
  coreSchema: RuntimeFieldSchema[];
  customSchema: RuntimeFieldSchema[];
}) {
  const coreKeySet = new Set(coreSchema.map((field) => field.key));
  const customKeySet = new Set(customSchema.map((field) => field.key));
  const coreUpdates: Record<string, unknown> = {};
  const customUpdates: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(propertyUpdates)) {
    if (coreKeySet.has(key)) {
      coreUpdates[key] = value;
      continue;
    }
    if (customKeySet.has(key)) {
      customUpdates[key] = value;
      continue;
    }
    throw new Error(`Unknown field key: ${key}`);
  }

  validateFieldPatch({ updates: coreUpdates, schema: coreSchema });
  validateFieldPatch({ updates: customUpdates, schema: customSchema });
}

export function buildUpdateCardState({
  args,
  card,
  registry,
}: {
  args: {
    title?: string;
    body?: unknown;
    propertyUpdates?: Record<string, unknown>;
    tagIds?: Id<"tagDefinitions">[];
  };
  card: Doc<"cards">;
  registry: Doc<"cardTypeRegistry">;
}) {
  const nextBody =
    args.body !== undefined
      ? (sanitizeBodyForPersistence(args.body) as Doc<"cards">["body"])
      : card.body;

  const nextTagIds = args.tagIds ?? card.tagIds;
  const changedPropertyKeys = args.propertyUpdates
    ? Object.keys(args.propertyUpdates)
    : [];
  const previousProperties = args.propertyUpdates
    ? Object.fromEntries(
        changedPropertyKeys
          .filter((key) => key in card.fields.core || key in card.fields.custom)
          .map((key) => [
            key,
            key in card.fields.core ? card.fields.core[key] : card.fields.custom[key],
          ]),
      )
    : undefined;
  const previousTagIds = args.tagIds ? [...card.tagIds] : undefined;
  const titleChanged =
    typeof args.title === "string" && args.title !== card.meta.title;
  const descriptionChanged =
    args.body !== undefined &&
    JSON.stringify(nextBody) !== JSON.stringify(card.body);
  const tagChanged =
    Array.isArray(args.tagIds) &&
    JSON.stringify([...args.tagIds].sort()) !==
      JSON.stringify([...card.tagIds].sort());

  const now = Date.now();
  const patch: Partial<Doc<"cards">> = { updatedAt: now };

  if (typeof args.title === "string") {
    patch.meta = {
      ...card.meta,
      title: args.title,
    };
  }
  if (args.body !== undefined) {
    patch.body = nextBody;
  }
  if (args.propertyUpdates) {
    const coreFieldKeySet = new Set(
      registry.manifest.fields.core.map((field) => field.key),
    );
    const coreFields = { ...card.fields.core };
    const customFieldsMap = { ...card.fields.custom };
    for (const [key, value] of Object.entries(args.propertyUpdates)) {
      if (coreFieldKeySet.has(key)) {
        coreFields[key] = value as CardFieldValue;
      } else {
        customFieldsMap[key] = value as CardFieldValue;
      }
    }
    patch.fields = {
      core: coreFields,
      custom: customFieldsMap,
    };
  }
  if (args.tagIds) {
    patch.tagIds = nextTagIds;
  }

  return {
    nextTagIds,
    changedPropertyKeys,
    previousProperties,
    previousTagIds,
    titleChanged,
    descriptionChanged,
    tagChanged,
    patch,
  };
}

export async function emitUpdateCardEvents({
  ctx,
  workspaceId,
  card,
  actorId,
  args,
  nextTagIds,
  previousTagIds,
  changedPropertyKeys,
  previousProperties,
  activityEntries,
}: {
  ctx: MutationCtx;
  workspaceId: Id<"workspaces">;
  card: Doc<"cards">;
  actorId: string;
  args: {
    propertyUpdates?: Record<string, unknown>;
    tagIds?: Id<"tagDefinitions">[];
  };
  nextTagIds: Id<"tagDefinitions">[];
  previousTagIds?: Id<"tagDefinitions">[];
  changedPropertyKeys: string[];
  previousProperties?: Record<string, unknown>;
  activityEntries: Array<{ kind: CardChangeKind; propertyKeys?: string[] }>;
}) {
  await emitCardEvent(ctx, workspaceId, {
    name: "card.updated",
    actorId,
    boardId: card.boardId,
    cardId: card._id,
    statusKey: card.statusKey,
    cardTypeId: card.typeKey,
    tagIds: nextTagIds,
    previousTagIds,
    changedPropertyKeys:
      changedPropertyKeys.length > 0 ? changedPropertyKeys : undefined,
    previousProperties,
    patch: args.propertyUpdates ?? {},
    activityEntries,
    workspaceId,
  });

  if (changedPropertyKeys.length > 0) {
    await emitCardEvent(ctx, workspaceId, {
      name: "property.changed",
      actorId,
      boardId: card.boardId,
      cardId: card._id,
      statusKey: card.statusKey,
      cardTypeId: card.typeKey,
      tagIds: nextTagIds,
      changedPropertyKeys,
      previousProperties,
      patch: args.propertyUpdates ?? {},
      workspaceId,
    });
  }

  if (args.tagIds) {
    const addedTagIds = nextTagIds.filter((tagId) => !card.tagIds.includes(tagId));
    for (const tagId of addedTagIds) {
      const tag = await ctx.db.get(tagId);
      await emitCardEvent(ctx, workspaceId, {
        name: "tag.applied",
        actorId,
        boardId: card.boardId,
        cardId: card._id,
        statusKey: card.statusKey,
        cardTypeId: card.typeKey,
        tagIds: nextTagIds,
        previousTagIds,
        tagKey: tag?.key,
        workspaceId,
      });
    }
  }
}
