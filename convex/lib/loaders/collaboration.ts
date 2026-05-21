import type { QueryCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";

export async function loadBoardCollaborationRows({
	ctx,
	workspaceId,
	boardId,
	userId,
}: {
	ctx: QueryCtx;
	workspaceId: Id<"workspaces">;
	boardId: Id<"boards">;
	userId: string;
}) {
	const [members, cardDigests, cardSeenStates] = await Promise.all([
		ctx.db
			.query("workspaceMembers")
			.withIndex("by_workspace", (query) => query.eq("workspaceId", workspaceId))
			.collect(),
		ctx.db
			.query("cardDigests")
			.withIndex("by_workspace_and_board", (query) =>
				query.eq("workspaceId", workspaceId).eq("boardId", boardId),
			)
			.collect(),
		ctx.db
			.query("cardSeenStates")
			.withIndex("by_workspace_and_board_and_user_and_card", (query) =>
				query
					.eq("workspaceId", workspaceId)
					.eq("boardId", boardId)
					.eq("userId", userId),
			)
			.collect(),
	]);

	return { cardDigests, cardSeenStates, members };
}

export function buildCardDigestByCardId(rows: Doc<"cardDigests">[]) {
	return new Map(rows.map((digest) => [String(digest.cardId), digest]));
}

export function buildCardSeenAtByCardId(rows: Doc<"cardSeenStates">[]) {
	return new Map(rows.map((row) => [String(row.cardId), row.seenAt]));
}

export function buildBoardMembers({
	authUser,
	members,
	userId,
}: {
	authUser?: { name?: string | null; email?: string | null } | null;
	members: Doc<"workspaceMembers">[];
	userId: string;
}) {
	return members.map((member) => ({
		id: member._id,
		userId: member.userId,
		name: member.userId === userId ? authUser?.name ?? member.name : member.name,
		email:
			member.userId === userId ? authUser?.email ?? member.email : member.email,
		role: member.role,
	}));
}

export async function loadWorkspaceCollaborationRows({
	ctx,
	workspaceId,
	userId,
	includeInvites,
}: {
	ctx: QueryCtx;
	workspaceId: Id<"workspaces">;
	userId: string;
	includeInvites: boolean;
}) {
	const [boardDigests, boardMembershipStates, invites] = await Promise.all([
		ctx.db
			.query("boardDigests")
			.withIndex("by_workspace", (query) => query.eq("workspaceId", workspaceId))
			.collect(),
		ctx.db
			.query("boardMembershipStates")
			.withIndex("by_workspace_and_user_and_board", (query) =>
				query.eq("workspaceId", workspaceId).eq("userId", userId),
			)
			.collect(),
		includeInvites
			? ctx.db
					.query("workspaceInvites")
					.withIndex("by_workspace", (query) =>
						query.eq("workspaceId", workspaceId),
					)
					.collect()
			: Promise.resolve([]),
	]);

	return { boardDigests, boardMembershipStates, invites };
}

export function buildBoardDigestByBoardId(rows: Doc<"boardDigests">[]) {
	return new Map(rows.map((digest) => [String(digest.boardId), digest]));
}

export function buildBoardSeenAtByBoardId(rows: Doc<"boardMembershipStates">[]) {
	return new Map(rows.map((state) => [String(state.boardId), state.lastSeenAt]));
}
