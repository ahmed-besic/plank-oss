import { createSlug } from "@plank/domain";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export async function createUniqueWorkspaceSlug(
  ctx: MutationCtx,
  name: string,
) {
  const base = createSlug(name) || "workspace";
  let attempt = base;
  let index = 2;

  while (
    await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (query) => query.eq("slug", attempt))
      .unique()
  ) {
    attempt = `${base}-${index}`;
    index += 1;
  }

  return attempt;
}

export async function createUniqueBoardSlug(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  name: string,
) {
  const base = createSlug(name) || "board";
  let attempt = base;
  let index = 2;

  while (
    await ctx.db
      .query("boards")
      .withIndex("by_workspace_slug", (query) =>
        query.eq("workspaceId", workspaceId).eq("slug", attempt),
      )
      .unique()
  ) {
    attempt = `${base}-${index}`;
    index += 1;
  }

  return attempt;
}
