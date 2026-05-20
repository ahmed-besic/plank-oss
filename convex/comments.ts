import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  createComment,
  deleteCommentForUser,
  listCommentsForCard,
  toggleCommentReaction,
  updateComment,
} from "./features/collaboration/comments";

const mentionRangeValidator = v.object({
  userId: v.string(),
  label: v.string(),
  start: v.number(),
  end: v.number(),
});

const commentReactionKeyValidator = v.union(
  v.literal("thumbs_up"),
  v.literal("heart"),
  v.literal("eyes"),
  v.literal("rocket"),
  v.literal("laugh"),
);

export const listForCard = query({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
    cardId: v.id("cards"),
  },
  handler: listCommentsForCard,
});

export const create = mutation({
  args: {
    workspaceSlug: v.string(),
    boardId: v.id("boards"),
    cardId: v.id("cards"),
    bodyText: v.string(),
    mentions: v.array(mentionRangeValidator),
  },
  handler: createComment,
});

export const update = mutation({
  args: {
    workspaceSlug: v.string(),
    commentId: v.id("cardComments"),
    bodyText: v.string(),
    mentions: v.array(mentionRangeValidator),
  },
  handler: updateComment,
});

export const deleteComment = mutation({
  args: {
    workspaceSlug: v.string(),
    commentId: v.id("cardComments"),
  },
  handler: deleteCommentForUser,
});

export const toggleReaction = mutation({
  args: {
    workspaceSlug: v.string(),
    commentId: v.id("cardComments"),
    emoji: commentReactionKeyValidator,
  },
  handler: toggleCommentReaction,
});
