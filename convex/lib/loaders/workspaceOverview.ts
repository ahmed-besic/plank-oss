import { canManageWorkspace } from "@plank/domain";
import type { QueryCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";
import { getWorkspaceExtensionRecords, mergePluginState } from "../plugins";
import {
	buildBoardDigestByBoardId,
	buildBoardSeenAtByBoardId,
	loadWorkspaceCollaborationRows,
} from "./collaboration";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function getInviteExpiresAt(
	invite: Pick<Doc<"workspaceInvites">, "createdAt" | "expiresAt">,
) {
	return invite.expiresAt ?? invite.createdAt + INVITE_TTL_MS;
}

function isInviteExpired(
	invite: Pick<Doc<"workspaceInvites">, "createdAt" | "expiresAt">,
	now: number,
) {
	return getInviteExpiresAt(invite) <= now;
}

function isInvitePending(
	invite: Pick<
		Doc<"workspaceInvites">,
		"acceptedAt" | "revokedAt" | "createdAt" | "expiresAt"
	>,
	now: number,
) {
	return !invite.acceptedAt && !invite.revokedAt && !isInviteExpired(invite, now);
}

export async function loadWorkspaceOverviewRows({
	ctx,
	workspaceId,
	userId,
	viewerCanManageWorkspace,
}: {
	ctx: QueryCtx;
	workspaceId: Id<"workspaces">;
	userId: string;
	viewerCanManageWorkspace: boolean;
}) {
	const [boards, boardTypes, members, installed, collaboration] =
		await Promise.all([
			ctx.db
				.query("boards")
				.withIndex("by_workspace", (query) =>
					query.eq("workspaceId", workspaceId),
				)
				.collect(),
			ctx.db
				.query("boardTypes")
				.withIndex("by_workspace", (query) =>
					query.eq("workspaceId", workspaceId),
				)
				.collect(),
			ctx.db
				.query("workspaceMembers")
				.withIndex("by_workspace", (query) =>
					query.eq("workspaceId", workspaceId),
				)
				.collect(),
			getWorkspaceExtensionRecords(ctx, workspaceId),
			loadWorkspaceCollaborationRows({
				ctx,
				workspaceId,
				userId,
				includeInvites: viewerCanManageWorkspace,
			}),
		]);

	return {
		boardDigests: collaboration.boardDigests,
		boardMembershipStates: collaboration.boardMembershipStates,
		boards,
		boardTypes,
		installed,
		invites: collaboration.invites,
		members,
	};
}

export async function loadWorkspaceOverview({
	authUser,
	ctx,
	member,
	userId,
	workspace,
}: {
	authUser?: { name?: string | null; email?: string | null } | null;
	ctx: QueryCtx;
	member: Doc<"workspaceMembers">;
	userId: string;
	workspace: Doc<"workspaces">;
}) {
	const viewerCanManageWorkspace = canManageWorkspace(member.role);
	const {
		boardDigests,
		boardMembershipStates,
		boards,
		boardTypes,
		installed,
		invites,
		members,
	} = await loadWorkspaceOverviewRows({
		ctx,
		workspaceId: workspace._id,
		userId,
		viewerCanManageWorkspace,
	});

	const digestByBoardId = buildBoardDigestByBoardId(boardDigests);
	const seenAtByBoardId = buildBoardSeenAtByBoardId(boardMembershipStates);

	return {
		boards: boards
			.map((board) => {
				const digest = digestByBoardId.get(String(board._id));
				return {
					id: board._id,
					name: board.name,
					slug: board.slug,
					workspaceId: board.workspaceId,
					boardTypeId: board.boardTypeId,
					viewerSeenAt: seenAtByBoardId.get(String(board._id)),
					latestExternalChange: digest
						? {
								actorId: digest.latestExternalActorId,
								cardId: digest.latestExternalCardId,
								kind: digest.latestExternalKind,
								createdAt: digest.latestExternalChangeAt,
							}
						: undefined,
				};
			})
			.sort((left, right) => left.name.localeCompare(right.name)),
		boardTypes: boardTypes
			.map((boardType) => ({
				id: boardType._id,
				key: boardType.key,
				name: boardType.name,
				description: boardType.description,
				defaultViewIds: boardType.defaultViewIds,
				defaultCardTypeKey: boardType.defaultCardTypeKey,
			}))
			.sort((left, right) => left.name.localeCompare(right.name)),
		extensions: mergePluginState(installed),
		members: members.map((record) => ({
			id: record._id,
			userId: record.userId,
			name:
				record._id === member._id
					? authUser?.name ?? record.name
					: record.name,
			email:
				record._id === member._id
					? authUser?.email ?? record.email
					: record.email,
			role: record.role,
			createdAt: record.createdAt,
		})),
		pendingInvites: invites
			.filter((invite) => isInvitePending(invite, Date.now()))
			.map((invite) => ({
				id: invite._id,
				email: invite.email,
				role: invite.role,
				createdAt: invite.createdAt,
				expiresAt: getInviteExpiresAt(invite),
				createdBy: invite.createdBy,
			}))
			.sort((left, right) => right.createdAt - left.createdAt),
		workspace: {
			id: workspace._id,
			name: workspace.name,
			slug: workspace.slug,
			role: member.role,
		},
		viewerUserId: userId,
	};
}
