import type { MentionRange } from "@plank/domain";
import { normalizeMentionRanges } from "@plank/domain";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { SHARED_VIEW_SCOPE_ID } from "./plugins";

export function normalizeCommentMentions(bodyText: string, mentions: MentionRange[]) {
  return normalizeMentionRanges(bodyText, mentions);
}

export function getMentionPreviewText(text: string) {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (normalized.length <= 160) {
    return normalized;
  }
  return `${normalized.slice(0, 157)}...`;
}

export async function insertMentionNotifications({
  ctx,
  workspaceId,
  boardId,
  cardId,
  commentId,
  viewInstanceId,
  actorId,
  mentions,
  kind,
  message,
  previewText,
}: {
  ctx: MutationCtx;
  workspaceId: Id<"workspaces">;
  boardId: Id<"boards">;
  cardId: Id<"cards">;
  commentId?: Id<"cardComments">;
  viewInstanceId?: string;
  actorId: string;
  mentions: Array<{ userId: string }>;
  kind: "mention_comment" | "mention_body";
  message: string;
  previewText?: string;
}) {
  const uniqueRecipientIds = [...new Set(mentions.map((mention) => mention.userId))].filter(
    (userId) => userId !== actorId,
  );

  for (const recipientUserId of uniqueRecipientIds) {
    const member = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace_user", (query) =>
        query.eq("workspaceId", workspaceId).eq("userId", recipientUserId),
      )
      .unique();
    if (!member) {
      continue;
    }

    await ctx.db.insert("notifications", {
      workspaceId,
      recipientUserId,
      actorId,
      boardId,
      cardId,
      viewInstanceId:
        viewInstanceId && viewInstanceId !== SHARED_VIEW_SCOPE_ID
          ? viewInstanceId
          : undefined,
      kind,
      commentId,
      previewText,
      message,
      createdAt: Date.now(),
    });
  }
}

export async function deleteNotificationsForComment({
  ctx,
  workspaceId,
  commentId,
}: {
  ctx: MutationCtx;
  workspaceId: Id<"workspaces">;
  commentId: Id<"cardComments">;
}) {
  const notifications = await ctx.db
    .query("notifications")
    .withIndex("by_workspace", (query) => query.eq("workspaceId", workspaceId))
    .take(500);

  for (const notification of notifications) {
    if (notification.commentId === commentId) {
      await ctx.db.delete(notification._id);
    }
  }
}

export async function deleteNotificationsForCard({
  ctx,
  workspaceId,
  cardId,
}: {
  ctx: MutationCtx;
  workspaceId: Id<"workspaces">;
  cardId: Id<"cards">;
}) {
  const notifications = await ctx.db
    .query("notifications")
    .withIndex("by_workspace", (query) => query.eq("workspaceId", workspaceId))
    .take(500);

  for (const notification of notifications) {
    if (notification.cardId === cardId) {
      await ctx.db.delete(notification._id);
    }
  }
}

export async function deleteNotificationsForBoardCards({
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
  const notifications = await ctx.db
    .query("notifications")
    .withIndex("by_workspace", (query) => query.eq("workspaceId", workspaceId))
    .collect();

  for (const notification of notifications) {
    if (
      notification.boardId === boardId ||
      (notification.cardId && cardIds.has(String(notification.cardId)))
    ) {
      await ctx.db.delete(notification._id);
    }
  }
}

export function getCommentMentionMessage(card: Pick<Doc<"cards">, "meta">) {
  return `mentioned you in a comment on "${card.meta.title}"`;
}

export function getBodyMentionMessage(title: string) {
  return `mentioned you in the description of "${title}"`;
}
