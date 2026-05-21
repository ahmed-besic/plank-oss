import type { Doc, Id } from "../../_generated/dataModel";
import type { QueryCtx } from "../../_generated/server";
import {
  getOptionalCurrentAuthUser,
  getWorkspaceAccessBySlugIfAuthenticated,
} from "../../lib/auth";
import { requireBoardWithType } from "../../lib/cardRuntime";
import {
  getBoardViewScopeId,
  getCardScopeId,
  resolveBoardViewInstance,
  SHARED_VIEW_SCOPE_ID,
} from "../../lib/plugins";

function parseActivityCursor(cursor: string | undefined | null) {
  if (!cursor) {
    return null;
  }
  const separator = cursor.indexOf(":");
  if (separator === -1) {
    return null;
  }
  const createdAt = Number(cursor.slice(0, separator));
  const id = cursor.slice(separator + 1);
  if (!Number.isFinite(createdAt) || !id) {
    return null;
  }
  return { createdAt, id };
}

function encodeActivityCursor(event: Doc<"cardChangeEvents">) {
  return `${event.createdAt}:${String(event._id)}`;
}

function isActivityBeforeCursor(
  event: Doc<"cardChangeEvents">,
  cursor: { createdAt: number; id: string } | null,
) {
  if (!cursor) {
    return true;
  }
  return (
    event.createdAt < cursor.createdAt ||
    (event.createdAt === cursor.createdAt && String(event._id) < cursor.id)
  );
}

export async function listBoardPresenceForViewer(
  ctx: QueryCtx,
  args: {
    workspaceSlug: string;
    boardId: Id<"boards">;
  },
) {
  const access = await getWorkspaceAccessBySlugIfAuthenticated(
    ctx,
    args.workspaceSlug,
  );
  if (!access) {
    return null;
  }

  const { workspace, userId } = access;
  await requireBoardWithType({
    ctx,
    workspaceId: workspace._id,
    boardId: args.boardId,
  });

  const authUser = await getOptionalCurrentAuthUser(ctx);
  const [presenceRows, members] = await Promise.all([
    ctx.db
      .query("boardHeartbeats")
      .withIndex("by_workspace_and_board", (query) =>
        query.eq("workspaceId", workspace._id).eq("boardId", args.boardId),
      )
      .collect(),
    ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (query) => query.eq("workspaceId", workspace._id))
      .collect(),
  ]);

  const memberByUserId = new Map(members.map((member) => [member.userId, member]));

  return {
    items: presenceRows
      .sort((left, right) => right.lastHeartbeatAt - left.lastHeartbeatAt)
      .map((row) => {
        const member = memberByUserId.get(row.userId);
        return {
          userId: row.userId,
          name:
            row.userId === userId
              ? authUser?.name ?? member?.name
              : member?.name,
          email:
            row.userId === userId
              ? authUser?.email ?? member?.email
              : member?.email,
          role: member?.role,
          lastHeartbeatAt: row.lastHeartbeatAt,
          isViewer: row.userId === userId,
        };
      }),
  };
}

export async function getBoardActivityPageForViewer(
  ctx: QueryCtx,
  args: {
    workspaceSlug: string;
    boardId: Id<"boards">;
    viewId?: string;
    cursor?: string;
    limit?: number;
  },
) {
  const access = await getWorkspaceAccessBySlugIfAuthenticated(
    ctx,
    args.workspaceSlug,
  );
  if (!access) {
    return null;
  }

  const { workspace } = access;
  await requireBoardWithType({
    ctx,
    workspaceId: workspace._id,
    boardId: args.boardId,
  });

  const pageSize = Math.max(1, Math.min(args.limit ?? 30, 100));
  const parsedCursor = parseActivityCursor(args.cursor);
  const [members, views, cards] = await Promise.all([
    ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (query) => query.eq("workspaceId", workspace._id))
      .collect(),
    ctx.db
      .query("boardViews")
      .withIndex("by_board", (query) => query.eq("boardId", args.boardId))
      .collect(),
    ctx.db
      .query("cards")
      .withIndex("by_board", (query) => query.eq("boardId", args.boardId))
      .collect(),
  ]);
  const activeView = resolveBoardViewInstance({
    requestedViewId: args.viewId,
    views,
  });
  const activeScopeId = activeView
    ? getBoardViewScopeId(activeView)
    : SHARED_VIEW_SCOPE_ID;
  const visibleCardIds = new Set(
    cards
      .filter((card) => getCardScopeId(card) === activeScopeId)
      .map((card) => String(card._id)),
  );
  const visibleCards = cards.filter((card) => visibleCardIds.has(String(card._id)));
  const perCardEvents = await Promise.all(
    visibleCards.map(async (card) =>
      (
        await ctx.db
          .query("cardChangeEvents")
          .withIndex("by_workspace_card_created_at", (query) => {
            const byCard = query
              .eq("workspaceId", workspace._id)
              .eq("cardId", card._id);
            return parsedCursor
              ? byCard.lte("createdAt", parsedCursor.createdAt)
              : byCard;
          })
          .order("desc")
          .take(pageSize + 1)
      ).filter((event) => isActivityBeforeCursor(event, parsedCursor)),
    ),
  );
  const filteredEvents = perCardEvents
    .flat()
    .sort((left, right) => {
      if (right.createdAt !== left.createdAt) {
        return right.createdAt - left.createdAt;
      }
      return String(right._id).localeCompare(String(left._id));
    });
  const page = filteredEvents.slice(0, pageSize + 1);
  const items = page.slice(0, pageSize);
  const nextCursor =
    page.length > pageSize && items.length > 0
      ? encodeActivityCursor(items[items.length - 1]!)
      : null;
  const memberByUserId = new Map(members.map((member) => [member.userId, member]));
  const cardsById = new Map(cards.map((card) => [String(card._id), card]));

  return {
    items: items.map((event) => {
      const member = memberByUserId.get(event.actorId);
      const card = cardsById.get(String(event.cardId));
      return {
        id: String(event._id),
        actorId: event.actorId,
        actorLabel: member?.name ?? member?.email ?? event.actorId,
        cardId: String(event.cardId),
        cardTitle: card?.meta.title ?? "Deleted card",
        kind: event.kind,
        createdAt: event.createdAt,
        propertyKeys: event.propertyKeys,
      };
    }),
    nextCursor,
  };
}
