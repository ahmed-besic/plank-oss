import { v } from "convex/values";
import { query } from "./_generated/server";
import { getWorkspaceAccessBySlugIfAuthenticated } from "./lib/auth";
import {
  getBoardViewScopeId,
  getCardScopeId,
  resolveBoardViewInstance,
  SHARED_VIEW_SCOPE_ID,
} from "./lib/plugins";

export const searchBoardTitles = query({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
    viewId: v.optional(v.string()),
    term: v.string(),
  },
  handler: async (ctx, args) => {
    const term = args.term.trim();
    if (!term) {
      return [];
    }

    const access = await getWorkspaceAccessBySlugIfAuthenticated(ctx, args.workspaceSlug);
    if (!access) {
      return [];
    }

    const board = await ctx.db.get(args.boardId);
    if (!board || board.workspaceId !== access.workspace._id) {
      return [];
    }

    const views = await ctx.db
      .query("boardViews")
      .withIndex("by_board", (query) => query.eq("boardId", args.boardId))
      .collect();
    const activeView = resolveBoardViewInstance({
      requestedViewId: args.viewId,
      views,
    });
    const activeScopeId = activeView
      ? getBoardViewScopeId(activeView)
      : SHARED_VIEW_SCOPE_ID;

    const results = await ctx.db
      .query("cards")
      .withSearchIndex("search_title", (search) =>
        search
          .search("meta.title", term)
          .eq("workspaceId", access.workspace._id)
          .eq("boardId", args.boardId),
      )
      .take(32);

    return results
      .filter((card) => getCardScopeId(card) === activeScopeId)
      .slice(0, 8)
      .map((card) => ({
      id: card._id,
      title: card.meta.title,
      statusKey: card.statusKey,
      columnId: card.statusKey,
      scopeId: getCardScopeId(card),
    }));
  },
});

export const searchWorkspaceCardTitles = query({
  args: {
    workspaceSlug: v.string(),
    term: v.string(),
    excludeCardId: v.optional(v.id("cards")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const term = args.term.trim();
    if (!term) {
      return [];
    }

    const access = await getWorkspaceAccessBySlugIfAuthenticated(ctx, args.workspaceSlug);
    if (!access) {
      return [];
    }

    const results = await ctx.db
      .query("cards")
      .withSearchIndex("search_title", (search) =>
        search.search("meta.title", term).eq("workspaceId", access.workspace._id),
      )
      .take(args.limit ?? 8);

    const filtered = results.filter((card) => card._id !== args.excludeCardId);
    const boardsById = new Map<string, { name: string }>();
    for (const card of filtered) {
      if (boardsById.has(card.boardId)) {
        continue;
      }
      const board = await ctx.db.get(card.boardId);
      if (board && board.workspaceId === access.workspace._id) {
        boardsById.set(card.boardId, { name: board.name });
      }
    }

    return filtered.map((card) => ({
      id: card._id,
      title: card.meta.title,
      boardId: card.boardId,
      boardName: boardsById.get(card.boardId)?.name ?? "Board",
      statusKey: card.statusKey,
      columnId: card.statusKey,
    }));
  },
});
