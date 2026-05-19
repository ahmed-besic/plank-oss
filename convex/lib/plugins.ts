import { compareOrderKeys, createKeyAfter } from "@plank/domain";
import {
	builtinPluginRegistry,
	dispatchCardEvent,
	getEnabledPluginIds,
	isRequiredBuiltinPluginId,
	requiredBuiltinPluginIds,
} from "@plank/plugin-runtime";
import { runBehaviorRuntimeForEvent } from "./behaviors/runtime";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type {
	CardActivityProjectionEntry,
	CardEventPayload,
} from "@plank/domain";

type AnyCtx = QueryCtx | MutationCtx;

export const LEGACY_CORE_BOARD_VIEW_ID = "core:board";
export const CANONICAL_CORE_BOARD_VIEW_ID = "core-kanban:board";
export const SHARED_VIEW_SCOPE_ID = "shared";
export const DEFAULT_VIEW_SHARING_POLICY = "shared_with_private";

interface BoardViewSnapshot {
	_id?: Id<"boardViews">;
	viewId: string;
	instanceId?: string;
	definitionViewId?: string;
	instanceMode?: "shared" | "private";
	pluginId?: string;
	kind: string;
	label: string;
	orderKey: string;
	isDefault: boolean;
	config?: Record<string, unknown>;
}

export interface NormalizedBoardViewSnapshot extends BoardViewSnapshot {
	instanceId: string;
	definitionViewId: string;
	instanceMode: "shared" | "private";
}

function normalizeDefinitionViewId(viewId: string) {
	return viewId === LEGACY_CORE_BOARD_VIEW_ID
		? CANONICAL_CORE_BOARD_VIEW_ID
		: viewId;
}

function defaultActivityEntriesForEvent(
	event: CardEventPayload,
): CardActivityProjectionEntry[] {
	switch (event.name) {
		case "card.created":
			return [{ kind: "new_card" }];
		case "card.moved":
			return [{ kind: "move" }];
		case "card.deleted":
			return [{ kind: "delete" }];
		default:
			return [];
	}
}

async function projectWorkflowEventToCardChangeEvents(
	ctx: MutationCtx,
	workspaceId: Id<"workspaces">,
	event: CardEventPayload,
) {
	const activityEntries =
		event.activityEntries ?? defaultActivityEntriesForEvent(event);
	for (const activity of activityEntries) {
		await ctx.db.insert("cardChangeEvents", {
			workspaceId,
			boardId: event.boardId as Id<"boards">,
			cardId: event.cardId as Id<"cards">,
			actorId: event.actorId,
			kind: activity.kind,
			propertyKeys: activity.propertyKeys,
			createdAt: event.timestamp,
		});
	}
}

export function listBuiltinPlugins() {
	return builtinPluginRegistry.plugins
		.filter((plugin) => !isRequiredBuiltinPluginId(plugin.manifest.id))
		.map((plugin) => ({
			manifest: plugin.manifest,
			views: plugin.views.map((view) => ({
				id: view.id,
				label: view.label,
				description: view.description,
			})),
			propertyTypes: plugin.propertyTypes.map((propertyType) => ({
				id: propertyType.id,
				label: propertyType.label,
				description: propertyType.description,
			})),
		}));
}

export function getActivePluginIds(
	records: Array<{ pluginId: string; status: "enabled" | "disabled" }>,
) {
	const ids = new Set(getEnabledPluginIds(records));
	for (const requiredId of requiredBuiltinPluginIds) {
		ids.add(requiredId);
	}
	return [...ids];
}

export function normalizeBoardView(
	view: BoardViewSnapshot,
): NormalizedBoardViewSnapshot {
	const definitionViewId = normalizeDefinitionViewId(
		view.definitionViewId ?? view.viewId,
	);
	const normalizedViewId = normalizeDefinitionViewId(view.viewId);
	const pluginId =
		normalizedViewId === CANONICAL_CORE_BOARD_VIEW_ID
			? "core-kanban"
			: view.pluginId;
	const kind =
		normalizedViewId === CANONICAL_CORE_BOARD_VIEW_ID ? "core" : view.kind;
	const label =
		normalizedViewId === CANONICAL_CORE_BOARD_VIEW_ID ? "Board" : view.label;
	return {
		...view,
		viewId: normalizedViewId,
		definitionViewId,
		instanceId: view.instanceId ?? String(view._id ?? `${definitionViewId}:shared`),
		instanceMode: view.instanceMode ?? "shared",
		pluginId,
		kind,
		label,
	};
}

export function getBoardViewScopeId(
	view: Pick<NormalizedBoardViewSnapshot, "instanceId" | "instanceMode">,
) {
	return view.instanceMode === "private" ? view.instanceId : SHARED_VIEW_SCOPE_ID;
}

export function getCardScopeId(card: { scopeId?: string | null }) {
	return card.scopeId ?? SHARED_VIEW_SCOPE_ID;
}

export function getViewDefinitionById(definitionViewId: string) {
	for (const plugin of builtinPluginRegistry.plugins) {
		const view = plugin.views.find(
			(candidate) => candidate.id === definitionViewId,
		);
		if (view) {
			return { plugin, view };
		}
	}
	return null;
}

export function getViewSharingPolicy(definitionViewId: string) {
	return (
		getViewDefinitionById(definitionViewId)?.view.sharingPolicy ??
		DEFAULT_VIEW_SHARING_POLICY
	);
}

export function resolveBoardViewInstance({
	requestedViewId,
	views,
}: {
	requestedViewId?: string | null;
	views: BoardViewSnapshot[];
}) {
	const normalizedViews = views.map(normalizeBoardView);
	if (normalizedViews.length === 0) {
		return null;
	}

	const byInstanceId = normalizedViews.find(
		(view) => view.instanceId === requestedViewId,
	);
	if (byInstanceId) {
		return byInstanceId;
	}

	if (requestedViewId) {
		const sharedByDefinition = normalizedViews.find(
			(view) =>
				view.definitionViewId === normalizeDefinitionViewId(requestedViewId) &&
				view.instanceMode === "shared",
		);
		if (sharedByDefinition) {
			return sharedByDefinition;
		}
	}

	return (
		normalizedViews.find((view) => view.isDefault) ??
		[...normalizedViews].sort((left, right) =>
			compareOrderKeys(left.orderKey, right.orderKey),
		)[0] ??
		null
	);
}

export function createPrivateViewLabel({
	baseLabel,
	existingViews,
}: {
	baseLabel: string;
	existingViews: BoardViewSnapshot[];
}) {
	const normalizedViews = existingViews.map(normalizeBoardView);
	const matchingLabels = new Set(
		normalizedViews
			.filter((view) => view.label === baseLabel || view.label.startsWith(`${baseLabel} `))
			.map((view) => view.label),
	);
	if (!matchingLabels.has(baseLabel)) {
		return baseLabel;
	}
	let counter = 2;
	while (matchingLabels.has(`${baseLabel} ${counter}`)) {
		counter += 1;
	}
	return `${baseLabel} ${counter}`;
}

export function getSeededBoardViews({
	activePluginIds,
	allowedViewIds,
	existingViews,
}: {
	activePluginIds: string[];
	allowedViewIds?: string[];
	existingViews: BoardViewSnapshot[];
}) {
	const activeIds = new Set(activePluginIds);
	const allowedIds = allowedViewIds ? new Set(allowedViewIds) : null;
	const allowedOrder = allowedViewIds
		? new Map(allowedViewIds.map((viewId, index) => [viewId, index]))
		: null;
	const normalizedExisting = existingViews.map(normalizeBoardView);
	const existingIds = new Set(
		normalizedExisting
			.filter((view) => view.instanceMode === "shared")
			.map((view) => view.definitionViewId),
	);
	const existingDefault = normalizedExisting.find((view) => view.isDefault);

	const seededViews = builtinPluginRegistry.plugins.flatMap((plugin) => {
		const pluginIsActive =
			activeIds.has(plugin.manifest.id) ||
			isRequiredBuiltinPluginId(plugin.manifest.id);
		if (!pluginIsActive) {
			return [];
		}

		return plugin.views
			.filter((view) => !allowedIds || allowedIds.has(view.id))
			.filter((view) => (view.sharingPolicy ?? DEFAULT_VIEW_SHARING_POLICY) !== "force_private")
			.filter((view) => {
				const seedMode = view.seedMode ?? "enabled";
				if (seedMode === "always") {
					return true;
				}
				return activeIds.has(plugin.manifest.id);
			})
			.filter((view) => !existingIds.has(view.id))
			.map((view) => ({
				defaultForBoard: view.defaultForBoard ?? false,
				kind: isRequiredBuiltinPluginId(plugin.manifest.id) ? "core" : "plugin",
				instanceId: crypto.randomUUID(),
				label: view.label,
				definitionViewId: view.id,
				instanceMode: "shared" as const,
				pluginId: plugin.manifest.id,
				viewId: view.id,
				willBeDefault:
					!existingDefault &&
					(allowedViewIds
						? view.id === allowedViewIds[0]
						: (view.defaultForBoard ?? false)),
			}));
	});

	if (!allowedOrder) {
		return seededViews;
	}

	return [...seededViews].sort(
		(left, right) =>
			(allowedOrder.get(left.viewId) ?? Number.MAX_SAFE_INTEGER) -
			(allowedOrder.get(right.viewId) ?? Number.MAX_SAFE_INTEGER),
	);
}

export async function getWorkspaceExtensionRecords(
	ctx: AnyCtx,
	workspaceId: Id<"workspaces">,
) {
	return await ctx.db
		.query("workspaceExtensions")
		.withIndex("by_workspace", (query) => query.eq("workspaceId", workspaceId))
		.collect();
}

export async function ensureBoardViewsForBoard(
	ctx: MutationCtx,
	workspaceId: Id<"workspaces">,
	boardId: Id<"boards">,
	enabledPluginIds: string[],
) {
	const board = await ctx.db.get(boardId);
	const boardType = board ? await ctx.db.get(board.boardTypeId) : null;
	const allowedViewIds = boardType?.defaultViewIds ?? [
		CANONICAL_CORE_BOARD_VIEW_ID,
	];
	const existing = await ctx.db
		.query("boardViews")
		.withIndex("by_board", (query) => query.eq("boardId", boardId))
		.collect();

	for (const view of existing) {
		const normalized = normalizeBoardView(view);
		if (
			normalized.viewId !== view.viewId ||
			normalized.pluginId !== view.pluginId ||
			normalized.kind !== view.kind ||
			normalized.label !== view.label
		) {
			await ctx.db.patch(view._id, {
				kind: normalized.kind,
				label: normalized.label,
				pluginId: normalized.pluginId,
				viewId: normalized.viewId,
			});
		}
	}

	const seededViews = getSeededBoardViews({
		activePluginIds: [...requiredBuiltinPluginIds, ...enabledPluginIds],
		allowedViewIds,
		existingViews: existing,
	});
	let previousOrderKey = existing
		.map(normalizeBoardView)
		.sort((left, right) => compareOrderKeys(left.orderKey, right.orderKey))
		.at(-1)?.orderKey;

	for (const view of seededViews) {
		const orderKey = createKeyAfter(previousOrderKey);
		previousOrderKey = orderKey;
		await ctx.db.insert("boardViews", {
			workspaceId,
			boardId,
			viewId: view.viewId,
			instanceId: view.instanceId,
			definitionViewId: view.definitionViewId,
			instanceMode: view.instanceMode,
			pluginId: view.pluginId,
			kind: view.kind,
			label: view.label,
			orderKey,
			isDefault: view.willBeDefault,
		});
	}
}

export async function emitCardEvent(
	ctx: MutationCtx,
	workspaceId: Id<"workspaces">,
	event: {
		actorId: string;
		boardId: string;
		cardId: string;
		name:
			| "card.created"
			| "card.updated"
			| "card.moved"
			| "card.deleted"
			| "tag.applied"
			| "property.changed";
		statusKey?: string;
		previousStatusKey?: string;
		nextStatusKey?: string;
		typeKey?: string;
		cardTypeId?: string;
		tagIds?: string[];
		previousTagIds?: string[];
		tagKey?: string;
		nextColumnId?: string;
		changedPropertyKeys?: string[];
		previousProperties?: Record<string, unknown>;
		patch?: Record<string, unknown>;
		previousColumnId?: string;
		workspaceId: string;
		origin?: "user" | "automation";
		depth?: number;
		rootEventId?: string;
		parentEventId?: string;
		activityEntries?: CardActivityProjectionEntry[];
	},
) {
	const timestamp = Date.now();
	const eventId = crypto.randomUUID();
	const records = await getWorkspaceExtensionRecords(ctx, workspaceId);
	const normalizedEvent: CardEventPayload = {
		...event,
		workspaceId,
		typeKey: event.typeKey ?? event.cardTypeId,
		cardTypeId: event.cardTypeId ?? event.typeKey,
		eventId,
		rootEventId: event.rootEventId ?? eventId,
		parentEventId: event.parentEventId,
		origin: event.origin ?? "user",
		depth: event.depth ?? 0,
		timestamp,
	};
	const workflowEventId = await ctx.db.insert("workflowEvents", {
		eventId: normalizedEvent.eventId,
		rootEventId: normalizedEvent.rootEventId ?? normalizedEvent.eventId,
		parentEventId: normalizedEvent.parentEventId,
		workspaceId,
		boardId: normalizedEvent.boardId as Id<"boards">,
		cardId: normalizedEvent.cardId as Id<"cards">,
		actorId: normalizedEvent.actorId,
		eventName: normalizedEvent.name,
		timestamp: normalizedEvent.timestamp,
		origin: normalizedEvent.origin ?? "user",
		depth: normalizedEvent.depth ?? 0,
		statusKey: normalizedEvent.statusKey,
		previousStatusKey: normalizedEvent.previousStatusKey,
		nextStatusKey: normalizedEvent.nextStatusKey,
		typeKey: normalizedEvent.typeKey,
		cardTypeId: normalizedEvent.cardTypeId,
		tagIds: normalizedEvent.tagIds,
		previousTagIds: normalizedEvent.previousTagIds,
		tagKey: normalizedEvent.tagKey,
		previousColumnId: normalizedEvent.previousColumnId,
		nextColumnId: normalizedEvent.nextColumnId,
		changedPropertyKeys: normalizedEvent.changedPropertyKeys,
		previousProperties: normalizedEvent.previousProperties,
		patch: normalizedEvent.patch,
		activityEntries: normalizedEvent.activityEntries,
	});
	const persistedEvent: CardEventPayload = {
		...normalizedEvent,
		workflowEventId,
	};
	await projectWorkflowEventToCardChangeEvents(ctx, workspaceId, persistedEvent);

	const activityEntries =
		persistedEvent.activityEntries ?? defaultActivityEntriesForEvent(persistedEvent);
	if (activityEntries.length > 0) {
		const firstActivity = activityEntries[0]!;
		const boardId = persistedEvent.boardId as Id<"boards">;
		const cardId = persistedEvent.cardId as Id<"cards">;
		const existing = await ctx.db
			.query("boardDigests")
			.withIndex("by_workspace_and_board", (q) =>
				q.eq("workspaceId", workspaceId).eq("boardId", boardId),
			)
			.unique();

		if (existing) {
			if (persistedEvent.timestamp > existing.latestExternalChangeAt) {
				await ctx.db.patch(existing._id, {
					latestExternalChangeAt: persistedEvent.timestamp,
					latestExternalActorId: persistedEvent.actorId,
					latestExternalCardId: persistedEvent.cardId as Id<"cards">,
					latestExternalKind: firstActivity.kind,
				});
			}
		} else {
			await ctx.db.insert("boardDigests", {
				workspaceId,
				boardId,
				latestExternalChangeAt: persistedEvent.timestamp,
				latestExternalActorId: persistedEvent.actorId,
				latestExternalCardId: cardId,
				latestExternalKind: firstActivity.kind,
			});
		}

		const existingCardDigest = await ctx.db
			.query("cardDigests")
			.withIndex("by_workspace_and_card", (q) =>
				q.eq("workspaceId", workspaceId).eq("cardId", cardId),
			)
			.unique();

		if (existingCardDigest) {
			if (persistedEvent.timestamp > existingCardDigest.latestExternalChangeAt) {
				await ctx.db.patch(existingCardDigest._id, {
					latestExternalChangeAt: persistedEvent.timestamp,
					latestExternalActorId: persistedEvent.actorId,
					latestExternalKind: firstActivity.kind,
				});
			}
		} else {
			await ctx.db.insert("cardDigests", {
				workspaceId,
				boardId,
				cardId,
				latestExternalChangeAt: persistedEvent.timestamp,
				latestExternalActorId: persistedEvent.actorId,
				latestExternalKind: firstActivity.kind,
			});
		}
	}

	await dispatchCardEvent({
		registry: builtinPluginRegistry,
		enabledPluginIds: getActivePluginIds(
			records.map((record) => ({
				pluginId: record.pluginId,
				status: record.status,
			})),
		),
			event: persistedEvent,
			extra: {},
		});

	const runtime = await runBehaviorRuntimeForEvent({
		ctx,
		workspaceId,
		event: persistedEvent,
	});
	for (const childEvent of runtime.emittedEvents) {
		await emitCardEvent(ctx, workspaceId, childEvent);
	}
}

export function mergePluginState(installed: Doc<"workspaceExtensions">[]) {
	const installedMap = new Map(
		installed.map((record) => [record.pluginId, record]),
	);

	return listBuiltinPlugins().map((plugin) => {
		const state = installedMap.get(plugin.manifest.id);
		return {
			...plugin,
			installed: state?.status === "enabled",
			status: state?.status ?? "disabled",
		};
	});
}
