import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type DbCtx = MutationCtx | QueryCtx;

async function getRegistryType(
  ctx: DbCtx,
  workspaceId: Id<"workspaces">,
  typeKey: string,
) {
  return await ctx.db
    .query("cardTypeRegistry")
    .withIndex("by_workspace_type_key", (q) =>
      q.eq("workspaceId", workspaceId).eq("typeKey", typeKey),
    )
    .unique();
}

async function getCardDepth(ctx: DbCtx, card: Doc<"cards">) {
  let depth = 0;
  let current: Doc<"cards"> | null = card;
  const seen = new Set<string>();

  while (current && current.parentId) {
    if (seen.has(String(current._id))) {
      throw new Error("Card hierarchy cycle detected");
    }
    seen.add(String(current._id));

    const parent: Doc<"cards"> | null = await ctx.db.get(current.parentId);
    if (!parent) {
      throw new Error("Parent card not found");
    }
    depth += 1;
    current = parent;
  }

  return depth;
}

export async function validateHierarchy(
  ctx: DbCtx,
  {
    workspaceId,
    boardId,
    parentId,
    childTypeKey,
  }: {
    workspaceId: Id<"workspaces">;
    boardId: Id<"boards">;
    parentId?: Id<"cards">;
    childTypeKey: string;
  },
) {
  if (!parentId) {
    return null;
  }

  const parent = await ctx.db.get(parentId);
  if (!parent || parent.workspaceId !== workspaceId || parent.boardId !== boardId) {
    throw new Error("Parent card not found");
  }

  const parentRegistry = await getRegistryType(ctx, workspaceId, parent.typeKey);
  if (!parentRegistry || parentRegistry.status !== "active") {
    throw new Error("Parent card type manifest not found");
  }

  const policy = parentRegistry.manifest.hierarchyPolicy;
  if (!policy?.supportsChildren) {
    throw new Error("Parent card type does not support child cards");
  }

  if (
    policy.allowedChildTypeKeys &&
    !policy.allowedChildTypeKeys.includes(childTypeKey)
  ) {
    throw new Error("Child card type is not allowed by parent hierarchy policy");
  }

  if (typeof policy.maxDepth === "number") {
    const childDepth = (await getCardDepth(ctx, parent)) + 1;
    if (childDepth > policy.maxDepth) {
      throw new Error("Card hierarchy depth limit exceeded");
    }
  }

  return parent;
}
