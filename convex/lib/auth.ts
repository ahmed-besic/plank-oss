import { getAuthUserId } from "@convex-dev/auth/server";
import { canManageExtensions, canManageWorkspace, type WorkspaceRole } from "@plank/domain";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

type AnyCtx = QueryCtx | MutationCtx;

export async function getCurrentIdentity(ctx: AnyCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  return identity;
}

export async function getOptionalUserId(ctx: AnyCtx) {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.tokenIdentifier ?? null;
}

export async function getCurrentUserId(ctx: AnyCtx) {
  const identity = await getCurrentIdentity(ctx);
  return identity.tokenIdentifier;
}

export async function getOptionalCurrentAuthUser(ctx: AnyCtx): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity || typeof identity.subject !== "string") {
    return null;
  }
  const authUserId = await getAuthUserId(ctx);
  if (!authUserId) {
    return null;
  }
  return await ctx.db.get(authUserId);
}

export async function requireWorkspaceBySlug(ctx: AnyCtx, slug: string) {
  const workspace = await ctx.db
    .query("workspaces")
    .withIndex("by_slug", (query) => query.eq("slug", slug))
    .unique();

  if (!workspace) {
    throw new Error("Workspace not found");
  }

  return workspace;
}

export async function requireWorkspaceMember(
  ctx: AnyCtx,
  workspaceId: QueryCtx["db"]["system"]["normalizeId"] extends never ? never : any,
) {
  const userId = await getCurrentUserId(ctx);
  const member = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspace_user", (query) =>
      query.eq("workspaceId", workspaceId).eq("userId", userId),
    )
    .unique();

  if (!member) {
    throw new Error("Not authorized for this workspace");
  }

  return member;
}

export async function requireWorkspaceAccessBySlug(
  ctx: AnyCtx,
  workspaceSlug: string,
) {
  const workspace = await requireWorkspaceBySlug(ctx, workspaceSlug);
  const member = await requireWorkspaceMember(ctx, workspace._id);
  const userId = await getCurrentUserId(ctx);
  return { member, userId, workspace };
}

export async function getWorkspaceAccessBySlugIfAuthenticated(
  ctx: AnyCtx,
  workspaceSlug: string,
) {
  const userId = await getOptionalUserId(ctx);
  if (!userId) {
    return null;
  }

  const workspace = await ctx.db
    .query("workspaces")
    .withIndex("by_slug", (query) => query.eq("slug", workspaceSlug))
    .unique();

  if (!workspace) {
    return null;
  }

  const member = await ctx.db
    .query("workspaceMembers")
    .withIndex("by_workspace_user", (query) =>
      query.eq("workspaceId", workspace._id).eq("userId", userId),
    )
    .unique();

  if (!member) {
    return null;
  }

  return { member, userId, workspace };
}

export function requireWorkspaceManager(role: WorkspaceRole) {
  if (!canManageWorkspace(role)) {
    throw new Error("You do not have permission to manage this workspace");
  }
}

export function requireExtensionManager(role: WorkspaceRole) {
  if (!canManageExtensions(role)) {
    throw new Error("You do not have permission to manage workspace extensions");
  }
}
