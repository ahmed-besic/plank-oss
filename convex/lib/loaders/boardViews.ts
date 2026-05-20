import { compareOrderKeys } from "@plank/domain";
import type { QueryCtx } from "../../_generated/server";
import type { Id } from "../../_generated/dataModel";
import { unwrapBoardViewConfig } from "../boardViewConfig";
import {
	getActivePluginIds,
	getBoardViewScopeId,
	getWorkspaceExtensionRecords,
	normalizeBoardView,
	resolveBoardViewInstance,
	SHARED_VIEW_SCOPE_ID,
} from "../plugins";

export async function loadBoardViewRows({
	ctx,
	boardId,
}: {
	ctx: QueryCtx;
	boardId: Id<"boards">;
}) {
	return await ctx.db
		.query("boardViews")
		.withIndex("by_board", (query) => query.eq("boardId", boardId))
		.collect();
}

export async function loadBoardViewFeature({
	ctx,
	workspaceId,
	boardId,
	requestedViewId,
}: {
	ctx: QueryCtx;
	workspaceId: Id<"workspaces">;
	boardId: Id<"boards">;
	requestedViewId?: string | null;
}) {
	const [views, installed] = await Promise.all([
		loadBoardViewRows({ ctx, boardId }),
		getWorkspaceExtensionRecords(ctx, workspaceId),
	]);
	const enabledPluginIds = getActivePluginIds(
		installed.map((record) => ({
			pluginId: record.pluginId,
			status: record.status,
		})),
	);
	const enabledSet = new Set(enabledPluginIds);
	const visibleViews = views
		.map(normalizeBoardView)
		.filter((view) => !view.pluginId || enabledSet.has(view.pluginId))
		.sort((left, right) => compareOrderKeys(left.orderKey, right.orderKey));
	const activeView = resolveBoardViewInstance({
		requestedViewId,
		views: visibleViews,
	});
	const activeScopeId = activeView
		? getBoardViewScopeId(activeView)
		: SHARED_VIEW_SCOPE_ID;

	return {
		activeScopeId,
		activeView,
		enabledPluginIds,
		installed,
		visibleViews,
	};
}

export function buildBoardViewSummaries(
	visibleViews: ReturnType<typeof normalizeBoardView>[],
) {
	return visibleViews.map((view) => ({
		id: view._id,
		instanceId: view.instanceId,
		definitionViewId: view.definitionViewId,
		viewId: view.definitionViewId,
		pluginId: view.pluginId,
		featureInstance: view.featureInstance,
		kind: view.kind,
		label: view.label,
		orderKey: view.orderKey,
		isDefault: view.isDefault,
		instanceMode: view.instanceMode,
		config: unwrapBoardViewConfig(view.config),
	}));
}

export type BoardViewFeature = Awaited<ReturnType<typeof loadBoardViewFeature>>;
