import type { Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";
import { deleteRows } from "../../lib/cardRuntime";
import {
  deleteNotificationsForBoardCards,
  deleteNotificationsForCard,
} from "./mentions";
import { deleteCommentWithSideEffects } from "./comments";

export async function deleteCommentsForCard({
  ctx,
  workspaceId,
  cardId,
}: {
  ctx: MutationCtx;
  workspaceId: Id<"workspaces">;
  cardId: Id<"cards">;
}) {
  const comments = await ctx.db
    .query("cardComments")
    .withIndex("by_workspace_card_created_at", (query) =>
      query.eq("workspaceId", workspaceId).eq("cardId", cardId),
    )
    .take(500);

  for (const comment of comments) {
    await deleteCommentWithSideEffects({
      ctx,
      workspaceId,
      commentId: comment._id,
    });
  }
}

export async function cleanupDeletedCardCollaboration({
  ctx,
  workspaceId,
  cardId,
}: {
  ctx: MutationCtx;
  workspaceId: Id<"workspaces">;
  cardId: Id<"cards">;
}) {
  await deleteCommentsForCard({ ctx, workspaceId, cardId });
  await deleteNotificationsForCard({ ctx, workspaceId, cardId });
}

export async function cleanupDeletedBoardCardsCollaboration({
  ctx,
  workspaceId,
  boardId,
  cardIds,
}: {
  ctx: MutationCtx;
  workspaceId: Id<"workspaces">;
  boardId: Id<"boards">;
  cardIds: Set<string>;
}) {
  const comments = await ctx.db
    .query("cardComments")
    .withIndex("by_workspace", (query) => query.eq("workspaceId", workspaceId))
    .collect();

  for (const comment of comments) {
    if (!cardIds.has(String(comment.cardId))) {
      continue;
    }
    await deleteCommentWithSideEffects({
      ctx,
      workspaceId,
      commentId: comment._id,
    });
  }

  await deleteNotificationsForBoardCards({
    ctx,
    workspaceId,
    boardId,
    cardIds,
  });
}

export async function cleanupDeletedBoardCollaborationRows({
  ctx,
  workspaceId,
  boardId,
}: {
  ctx: MutationCtx;
  workspaceId: Id<"workspaces">;
  boardId: Id<"boards">;
}) {
  await deleteRows(
    await ctx.db
      .query("boardMembershipStates")
      .withIndex("by_workspace_and_board", (query) =>
        query.eq("workspaceId", workspaceId).eq("boardId", boardId),
      )
      .collect(),
    ctx,
  );
  await deleteRows(
    await ctx.db
      .query("boardHeartbeats")
      .withIndex("by_workspace_and_board", (query) =>
        query.eq("workspaceId", workspaceId).eq("boardId", boardId),
      )
      .collect(),
    ctx,
  );
  await deleteRows(
    await ctx.db
      .query("cardSeenStates")
      .withIndex("by_workspace_and_board_and_card", (query) =>
        query.eq("workspaceId", workspaceId).eq("boardId", boardId),
      )
      .collect(),
    ctx,
  );
  await deleteRows(
    await ctx.db
      .query("cardChangeEvents")
      .withIndex("by_workspace_board_created_at", (query) =>
        query.eq("workspaceId", workspaceId).eq("boardId", boardId),
      )
      .collect(),
    ctx,
  );
  await deleteRows(
    await ctx.db
      .query("boardDigests")
      .withIndex("by_workspace_and_board", (query) =>
        query.eq("workspaceId", workspaceId).eq("boardId", boardId),
      )
      .collect(),
    ctx,
  );
  await deleteRows(
    await ctx.db
      .query("cardDigests")
      .withIndex("by_workspace_and_board", (query) =>
        query.eq("workspaceId", workspaceId).eq("boardId", boardId),
      )
      .collect(),
    ctx,
  );
}
