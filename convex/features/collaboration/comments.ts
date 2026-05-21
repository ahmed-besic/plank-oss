import {
  COMMENT_REACTION_KEYS,
  type CommentReactionKey,
  type MentionRange,
} from "@plank/domain";
import type { Id } from "../../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../../_generated/server";
import { requireWorkspaceAccessBySlug } from "../../lib/auth";
import { deleteRows, requireBoardWithType, requireCardInBoard } from "../../lib/cardRuntime";
import { getCardScopeId, SHARED_VIEW_SCOPE_ID } from "../../lib/plugins";
import {
  deleteNotificationsForComment,
  getCommentMentionMessage,
  getMentionPreviewText,
  insertMentionNotifications,
  normalizeCommentMentions,
} from "./mentions";

function toReactionCounts(
  value: Record<string, number> | undefined,
): Partial<Record<CommentReactionKey, number>> {
  const next: Partial<Record<CommentReactionKey, number>> = {};
  for (const emoji of COMMENT_REACTION_KEYS) {
    const count = value?.[emoji];
    if (typeof count === "number" && count > 0) {
      next[emoji] = count;
    }
  }
  return next;
}

async function filterWorkspaceMentions({
  ctx,
  mentions,
  workspaceId,
}: {
  ctx: MutationCtx | QueryCtx;
  workspaceId: Id<"workspaces">;
  mentions: MentionRange[];
}) {
  const filtered: MentionRange[] = [];
  for (const mention of mentions) {
    const member = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (query) =>
        query.eq("workspaceId", workspaceId).eq("userId", mention.userId),
      )
      .unique();
    if (member) {
      filtered.push(mention);
    }
  }
  return filtered;
}

async function requireCommentInWorkspace({
  ctx,
  workspaceId,
  commentId,
}: {
  ctx: MutationCtx | QueryCtx;
  workspaceId: Id<"workspaces">;
  commentId: Id<"cardComments">;
}) {
  const comment = await ctx.db.get(commentId);
  if (!comment || comment.workspaceId !== workspaceId || comment.deletedAt) {
    throw new Error("Comment not found");
  }
  return comment;
}

export async function listCommentsForCard(
  ctx: QueryCtx,
  args: {
    workspaceSlug: string;
    boardId: Id<"boards">;
    cardId: Id<"cards">;
  },
) {
  const { workspace, userId } = await requireWorkspaceAccessBySlug(
    ctx,
    args.workspaceSlug,
  );
  await requireBoardWithType({
    ctx,
    workspaceId: workspace._id,
    boardId: args.boardId,
  });
  await requireCardInBoard({
    ctx,
    workspaceId: workspace._id,
    boardId: args.boardId,
    cardId: args.cardId,
  });

  const comments = await ctx.db
    .query("cardComments")
    .withIndex("by_workspace_board_card_created_at", (query) =>
      query
        .eq("workspaceId", workspace._id)
        .eq("boardId", args.boardId)
        .eq("cardId", args.cardId),
    )
    .take(500);

  return await Promise.all(
    comments
      .filter((comment) => !comment.deletedAt)
      .map(async (comment) => {
        const reactions = await ctx.db
          .query("commentReactions")
          .withIndex("by_workspace_comment", (query) =>
            query.eq("workspaceId", workspace._id).eq("commentId", comment._id),
          )
          .take(200);
        const viewerReactions = reactions
          .filter((reaction) => reaction.userId === userId)
          .map((reaction) => reaction.emoji);

        return {
          id: comment._id,
          workspaceId: comment.workspaceId,
          boardId: comment.boardId,
          cardId: comment.cardId,
          authorUserId: comment.authorUserId,
          bodyText: comment.bodyText,
          mentions: comment.mentions,
          reactionCounts: toReactionCounts(comment.reactionCounts),
          viewerReactions,
          editedAt: comment.editedAt,
          createdAt: comment.createdAt,
        };
      }),
  );
}

export async function createComment(
  ctx: MutationCtx,
  args: {
    workspaceSlug: string;
    boardId: Id<"boards">;
    cardId: Id<"cards">;
    bodyText: string;
    mentions: MentionRange[];
  },
) {
  const { workspace, userId } = await requireWorkspaceAccessBySlug(
    ctx,
    args.workspaceSlug,
  );
  await requireBoardWithType({
    ctx,
    workspaceId: workspace._id,
    boardId: args.boardId,
  });
  const card = await requireCardInBoard({
    ctx,
    workspaceId: workspace._id,
    boardId: args.boardId,
    cardId: args.cardId,
  });

  const bodyText = args.bodyText.trim();
  if (!bodyText) {
    throw new Error("Comment text is required");
  }

  const mentions = await filterWorkspaceMentions({
    ctx,
    workspaceId: workspace._id,
    mentions: normalizeCommentMentions(bodyText, args.mentions),
  });
  const now = Date.now();
  const commentId = await ctx.db.insert("cardComments", {
    workspaceId: workspace._id,
    boardId: args.boardId,
    cardId: args.cardId,
    authorUserId: userId,
    bodyText,
    mentions,
    reactionCounts: {},
    createdAt: now,
  });

  await insertMentionNotifications({
    ctx,
    workspaceId: workspace._id,
    boardId: args.boardId,
    cardId: args.cardId,
    viewInstanceId:
      getCardScopeId(card) === SHARED_VIEW_SCOPE_ID
        ? undefined
        : getCardScopeId(card),
    commentId,
    actorId: userId,
    mentions,
    kind: "mention_comment",
    message: getCommentMentionMessage(card),
    previewText: getMentionPreviewText(bodyText),
  });

  return { commentId };
}

export async function updateComment(
  ctx: MutationCtx,
  args: {
    workspaceSlug: string;
    commentId: Id<"cardComments">;
    bodyText: string;
    mentions: MentionRange[];
  },
) {
  const { workspace, userId } = await requireWorkspaceAccessBySlug(
    ctx,
    args.workspaceSlug,
  );
  const comment = await requireCommentInWorkspace({
    ctx,
    workspaceId: workspace._id,
    commentId: args.commentId,
  });
  if (comment.authorUserId !== userId) {
    throw new Error("Only the comment author can edit this comment");
  }

  const card = await requireCardInBoard({
    ctx,
    workspaceId: workspace._id,
    boardId: comment.boardId,
    cardId: comment.cardId,
  });

  const bodyText = args.bodyText.trim();
  if (!bodyText) {
    throw new Error("Comment text is required");
  }

  const mentions = await filterWorkspaceMentions({
    ctx,
    workspaceId: workspace._id,
    mentions: normalizeCommentMentions(bodyText, args.mentions),
  });
  const previousMentionUserIds = new Set(comment.mentions.map((mention) => mention.userId));
  const newMentions = mentions.filter((mention) => !previousMentionUserIds.has(mention.userId));

  await ctx.db.patch(comment._id, {
    bodyText,
    mentions,
    editedAt: Date.now(),
  });

  await insertMentionNotifications({
    ctx,
    workspaceId: workspace._id,
    boardId: comment.boardId,
    cardId: comment.cardId,
    viewInstanceId:
      getCardScopeId(card) === SHARED_VIEW_SCOPE_ID
        ? undefined
        : getCardScopeId(card),
    commentId: comment._id,
    actorId: userId,
    mentions: newMentions,
    kind: "mention_comment",
    message: getCommentMentionMessage(card),
    previewText: getMentionPreviewText(bodyText),
  });

  return { commentId: comment._id };
}

export async function deleteCommentForUser(
  ctx: MutationCtx,
  args: {
    workspaceSlug: string;
    commentId: Id<"cardComments">;
  },
) {
  const { workspace, userId } = await requireWorkspaceAccessBySlug(
    ctx,
    args.workspaceSlug,
  );
  const comment = await requireCommentInWorkspace({
    ctx,
    workspaceId: workspace._id,
    commentId: args.commentId,
  });
  if (comment.authorUserId !== userId) {
    throw new Error("Only the comment author can delete this comment");
  }

  await deleteCommentWithSideEffects({
    ctx,
    workspaceId: workspace._id,
    commentId: comment._id,
  });

  return { commentId: comment._id };
}

export async function deleteCommentWithSideEffects({
  ctx,
  workspaceId,
  commentId,
}: {
  ctx: MutationCtx;
  workspaceId: Id<"workspaces">;
  commentId: Id<"cardComments">;
}) {
  await deleteRows(
    await ctx.db
      .query("commentReactions")
      .withIndex("by_workspace_comment", (query) =>
        query.eq("workspaceId", workspaceId).eq("commentId", commentId),
      )
      .take(200),
    ctx,
  );
  await deleteNotificationsForComment({
    ctx,
    workspaceId,
    commentId,
  });
  await ctx.db.delete(commentId);
}

export async function toggleCommentReaction(
  ctx: MutationCtx,
  args: {
    workspaceSlug: string;
    commentId: Id<"cardComments">;
    emoji: CommentReactionKey;
  },
) {
  const { workspace, userId } = await requireWorkspaceAccessBySlug(
    ctx,
    args.workspaceSlug,
  );
  const comment = await requireCommentInWorkspace({
    ctx,
    workspaceId: workspace._id,
    commentId: args.commentId,
  });
  await requireCardInBoard({
    ctx,
    workspaceId: workspace._id,
    boardId: comment.boardId,
    cardId: comment.cardId,
  });

  const existing = await ctx.db
    .query("commentReactions")
    .withIndex("by_workspace_comment_user_emoji", (query) =>
      query
        .eq("workspaceId", workspace._id)
        .eq("commentId", comment._id)
        .eq("userId", userId)
        .eq("emoji", args.emoji),
    )
    .unique();

  const reactionCounts = {
    ...comment.reactionCounts,
  };
  const currentCount = Math.max(0, reactionCounts[args.emoji] ?? 0);

  if (existing) {
    await ctx.db.delete(existing._id);
    if (currentCount <= 1) {
      delete reactionCounts[args.emoji];
    } else {
      reactionCounts[args.emoji] = currentCount - 1;
    }
  } else {
    await ctx.db.insert("commentReactions", {
      workspaceId: workspace._id,
      commentId: comment._id,
      userId,
      emoji: args.emoji,
      createdAt: Date.now(),
    });
    reactionCounts[args.emoji] = currentCount + 1;
  }

  await ctx.db.patch(comment._id, {
    reactionCounts,
  });

  return {
    commentId: comment._id,
    emoji: args.emoji,
    active: !existing,
    count: reactionCounts[args.emoji] ?? 0,
  };
}
