import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

export const runPhase2A = internalMutation({
  args: {
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const workspaces = args.workspaceSlug
      ? [
          await ctx.db
            .query("workspaces")
            .withIndex("by_slug", (query) => query.eq("slug", args.workspaceSlug!))
            .unique(),
        ].filter((workspace): workspace is NonNullable<typeof workspace> => Boolean(workspace))
      : await ctx.db.query("workspaces").collect();

    let boardTypesPatched = 0;
    let boardsPatched = 0;
    let cardsPatched = 0;
    let registryPatched = 0;

    for (const workspace of workspaces) {
      const [boardTypes, boards, cards, registryRows] = await Promise.all([
        ctx.db
          .query("boardTypes")
          .withIndex("by_workspace", (query) => query.eq("workspaceId", workspace._id))
          .collect(),
        ctx.db
          .query("boards")
          .withIndex("by_workspace", (query) => query.eq("workspaceId", workspace._id))
          .collect(),
        ctx.db
          .query("cards")
          .withIndex("by_workspace", (query) => query.eq("workspaceId", workspace._id))
          .collect(),
        ctx.db
          .query("cardTypeRegistry")
          .withIndex("by_workspace", (query) => query.eq("workspaceId", workspace._id))
          .collect(),
      ]);

      for (const boardType of boardTypes) {
        const { allowedTypeKeys: _ignoreAllowed, defaultTypeKey: _ignoreDefault, ...rest } =
          boardType as typeof boardType & {
            allowedTypeKeys?: string[];
            defaultTypeKey?: string;
          };
        await ctx.db.replace(boardType._id, {
          ...rest,
          defaultCardTypeKey:
            boardType.defaultCardTypeKey ??
            (boardType.templateSource?.pluginId === "task-board"
              ? "task-board:task"
              : "core.todo"),
        });
        boardTypesPatched += 1;
      }

      for (const board of boards) {
        const { columns: _ignoreColumns, ...rest } = board as typeof board & {
          columns?: unknown;
        };
        await ctx.db.replace(board._id, rest);
        boardsPatched += 1;
      }

      for (const card of cards) {
        const { viewState: _ignoreViewState, ...rest } = card as typeof card & {
          viewState?: unknown;
        };
        await ctx.db.replace(card._id, rest);
        cardsPatched += 1;
      }

      for (const row of registryRows) {
        const { renderer: _ignoreRenderer, ...manifest } = row.manifest as typeof row.manifest & {
          renderer?: unknown;
        };
        await ctx.db.patch(row._id, {
          manifest,
          updatedAt: Date.now(),
        });
        registryPatched += 1;
      }
    }

    return {
      workspacesProcessed: workspaces.length,
      boardTypesPatched,
      boardsPatched,
      cardsPatched,
      registryPatched,
    };
  },
});
