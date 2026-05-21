import { sortByOrderKey } from "../cardRuntime";
import type { QueryCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";

export async function loadBoardCore({
	ctx,
	workspaceId,
	boardId,
}: {
	ctx: QueryCtx;
	workspaceId: Id<"workspaces">;
	boardId: Id<"boards">;
}) {
	const board = await ctx.db.get(boardId);
	if (!board || board.workspaceId !== workspaceId) {
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
}: {
	board: Doc<"boards">;
	boardType: Doc<"boardTypes">;
}) {
	const statusMap = new Map(
		boardType.lifecycleConfig.statuses.map((status) => [status.key, status]),
	);

	return {
		id: board._id,
		name: board.name,
		workspaceId: board.workspaceId,
		boardTypeId: board.boardTypeId,
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
