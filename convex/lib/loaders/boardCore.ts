import { canViewerAccessBoard } from "@plank/domain";
import { sortByOrderKey } from "../cardRuntime";
import type { QueryCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";

export async function loadBoardCore({
	ctx,
	workspaceId,
	boardId,
	viewerUserId,
}: {
	ctx: QueryCtx;
	workspaceId: Id<"workspaces">;
	boardId: Id<"boards">;
	viewerUserId: string;
}) {
	const board = await ctx.db.get(boardId);
	if (
		!board ||
		board.workspaceId !== workspaceId ||
		!canViewerAccessBoard(board, viewerUserId)
	) {
		return null;
	}

	const boardType = await ctx.db.get(board.boardTypeId);
	if (!boardType || boardType.workspaceId !== workspaceId) {
		return null;
	}

	return { board, boardType };
}

export function getDerivedColumns(boardType: Doc<"boardTypes">) {
	return sortByOrderKey(boardType.lifecycleConfig.statuses).map((status) => ({
		id: status.key,
		statusKey: status.key,
		orderKey: status.orderKey,
	}));
}

export function buildBoardSummary({
	board,
	boardType,
	viewerUserId,
}: {
	board: Doc<"boards">;
	boardType: Doc<"boardTypes">;
	viewerUserId: string;
}) {
	const statusMap = new Map(
		boardType.lifecycleConfig.statuses.map((status) => [status.key, status]),
	);

	return {
		id: board._id,
		name: board.name,
		workspaceId: board.workspaceId,
		boardTypeId: board.boardTypeId,
		visibility: board.visibility ?? "workspace",
		viewerIsOwner: board.createdBy === viewerUserId,
		columns: getDerivedColumns(boardType).map((column) => ({
			id: column.id,
			statusKey: column.statusKey,
			title: statusMap.get(column.statusKey)?.label ?? column.statusKey,
			orderKey: column.orderKey,
		})),
	};
}

export function buildBoardTypeSummary(boardType: Doc<"boardTypes">) {
	return {
		id: boardType._id,
		workspaceId: boardType.workspaceId,
		key: boardType.key,
		name: boardType.name,
		description: boardType.description,
		lifecycleConfig: {
			statuses: sortByOrderKey(boardType.lifecycleConfig.statuses).map(
				(status) => ({
					key: status.key,
					label: status.label,
					category: status.category,
					orderKey: status.orderKey,
				}),
			),
			initialStatusKey: boardType.lifecycleConfig.initialStatusKey,
		},
		defaultViewIds: boardType.defaultViewIds,
		defaultCardTypeKey: boardType.defaultCardTypeKey,
	};
}
