import type {
	BehaviorAction,
	CardActivityProjectionEntry,
	TraceStep,
} from "@plank/domain";
import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";

export interface PlannedAction {
	ruleId: string;
	ruleName: string;
	action: BehaviorAction;
}

export interface QueuedCardEvent {
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
}

async function resolveNotificationRecipientUserId({
	ctx,
	card,
	actorId,
	recipientPropertyKey,
	recipientUserId,
}: {
	ctx: MutationCtx;
	card: Doc<"cards">;
	actorId: string;
	recipientPropertyKey?: string;
	recipientUserId?: string;
}) {
	if (recipientUserId) {
		if (recipientUserId === actorId) {
			return {
				skipped: "actor is the recipient",
			} as const;
		}

		const member = await ctx.db
			.query("workspaceMembers")
			.withIndex("by_workspace_user", (query) =>
				query.eq("workspaceId", card.workspaceId).eq("userId", recipientUserId),
			)
			.unique();

		if (!member) {
			return {
				skipped: `recipient ${recipientUserId} is not a workspace member`,
			} as const;
		}

		return {
			recipientUserId,
		} as const;
	}

	if (!recipientPropertyKey) {
		return {
			skipped: "recipient property is required",
		} as const;
	}

	const rawValue =
		card.fields.core[recipientPropertyKey] ?? card.fields.custom[recipientPropertyKey];
	if (typeof rawValue !== "string" || rawValue.length === 0) {
		return {
			skipped: `recipient property ${recipientPropertyKey} is empty`,
		} as const;
	}

	if (rawValue === actorId) {
		return {
			skipped: "actor is the recipient",
		} as const;
	}

	const member = await ctx.db
		.query("workspaceMembers")
		.withIndex("by_workspace_user", (query) =>
			query.eq("workspaceId", card.workspaceId).eq("userId", rawValue),
		)
		.unique();

	if (!member) {
		return {
			skipped: `recipient ${rawValue} is not a workspace member`,
		} as const;
	}

	return {
		recipientUserId: rawValue,
	} as const;
}

function actionLabel(action: BehaviorAction): string {
	switch (action.type) {
		case "set_property":
			return `set ${action.propertyKey}`;
		case "set_current_date":
			return `set ${action.propertyKey} to current date`;
		case "add_tag":
			return `add tag ${action.tagKey}`;
		case "remove_tag":
			return `remove tag ${action.tagKey}`;
		case "move_status":
			return `move card to status ${action.statusKey}`;
		case "notify":
			if (action.recipientUserId) {
				return `notify user ${action.recipientUserId}: ${action.message}`;
			}
			return action.recipientPropertyKey
				? `notify ${action.recipientPropertyKey}: ${action.message}`
				: `notify ${action.message}`;
		case "stop":
			return "stop";
	}
}

async function resolveTagIdByKey({
	ctx,
	workspaceId,
	key,
}: {
	ctx: MutationCtx;
	workspaceId: Id<"workspaces">;
	key: string;
}) {
	return await ctx.db
		.query("tagDefinitions")
		.withIndex("by_workspace_key", (query) =>
			query.eq("workspaceId", workspaceId).eq("key", key),
		)
		.unique();
}

export async function executePlannedActions({
	ctx,
	card,
	board,
	planned,
	failFast,
	eventContext,
}: {
	ctx: MutationCtx;
	card: Doc<"cards">;
	board: Doc<"boards">;
	planned: PlannedAction[];
	failFast?: boolean;
	eventContext: {
		actorId: string;
		origin: "user" | "automation";
		depth: number;
		rootEventId: string;
		parentEventId: string;
		workflowEventId: string;
	};
}) {
	const trace: TraceStep[] = [];
	const emittedEvents: QueuedCardEvent[] = [];
	let actionsExecuted = 0;
	let stop = false;

	let currentCard = card;
	const boardType = await ctx.db.get(board.boardTypeId);
	const statusKeys = new Set(
		boardType?.lifecycleConfig.statuses.map((status) => status.key) ?? [],
	);

	for (const item of planned) {
		const label = actionLabel(item.action);
		try {
			switch (item.action.type) {
				case "set_property": {
					const previousValue = currentCard.fields.core[item.action.propertyKey];
					if (previousValue === item.action.value) {
						trace.push({
							ruleId: item.ruleId,
							ruleName: item.ruleName,
							action: label,
							status: "skipped",
							detail: "value already set",
						});
						break;
					}
					const previousProperties = {
						[item.action.propertyKey]: previousValue,
					};
					const nextCoreFields = {
						...currentCard.fields.core,
						[item.action.propertyKey]: item.action.value,
					};
					await ctx.db.patch(currentCard._id, {
						fields: {
							...currentCard.fields,
							core: nextCoreFields,
						},
						updatedAt: Date.now(),
					});
					currentCard = {
						...currentCard,
						fields: {
							...currentCard.fields,
							core: nextCoreFields,
						},
						updatedAt: Date.now(),
					};
					actionsExecuted += 1;
					trace.push({
						ruleId: item.ruleId,
						ruleName: item.ruleName,
						action: label,
						status: "ok",
					});
					emittedEvents.push(
						{
							name: "card.updated",
							actorId: eventContext.actorId,
							boardId: currentCard.boardId,
							cardId: currentCard._id,
							statusKey: currentCard.statusKey,
							cardTypeId: currentCard.typeKey,
							tagIds: currentCard.tagIds,
							changedPropertyKeys: [item.action.propertyKey],
							previousProperties,
							patch: {
								[item.action.propertyKey]: item.action.value,
							},
							workspaceId: currentCard.workspaceId,
							origin: eventContext.origin,
							depth: eventContext.depth,
							rootEventId: eventContext.rootEventId,
							parentEventId: eventContext.parentEventId,
							activityEntries: [
								{
									kind: "property",
									propertyKeys: [item.action.propertyKey],
								},
							],
						},
						{
							name: "property.changed",
							actorId: eventContext.actorId,
							boardId: currentCard.boardId,
							cardId: currentCard._id,
							statusKey: currentCard.statusKey,
							cardTypeId: currentCard.typeKey,
							tagIds: currentCard.tagIds,
							changedPropertyKeys: [item.action.propertyKey],
							previousProperties,
							patch: {
								[item.action.propertyKey]: item.action.value,
							},
							workspaceId: currentCard.workspaceId,
							origin: eventContext.origin,
							depth: eventContext.depth,
							rootEventId: eventContext.rootEventId,
							parentEventId: eventContext.parentEventId,
						},
					);
					break;
				}
				case "set_current_date": {
					const nextValue = Date.now();
					const previousValue = currentCard.fields.core[item.action.propertyKey];
					const previousProperties = {
						[item.action.propertyKey]: previousValue,
					};
					const nextCoreFields = {
						...currentCard.fields.core,
						[item.action.propertyKey]: nextValue,
					};
					await ctx.db.patch(currentCard._id, {
						fields: {
							...currentCard.fields,
							core: nextCoreFields,
						},
						updatedAt: nextValue,
					});
					currentCard = {
						...currentCard,
						fields: {
							...currentCard.fields,
							core: nextCoreFields,
						},
						updatedAt: nextValue,
					};
					actionsExecuted += 1;
					trace.push({
						ruleId: item.ruleId,
						ruleName: item.ruleName,
						action: label,
						status: "ok",
					});
					emittedEvents.push(
						{
							name: "card.updated",
							actorId: eventContext.actorId,
							boardId: currentCard.boardId,
							cardId: currentCard._id,
							statusKey: currentCard.statusKey,
							cardTypeId: currentCard.typeKey,
							tagIds: currentCard.tagIds,
							changedPropertyKeys: [item.action.propertyKey],
							previousProperties,
							patch: {
								[item.action.propertyKey]: nextValue,
							},
							workspaceId: currentCard.workspaceId,
							origin: eventContext.origin,
							depth: eventContext.depth,
							rootEventId: eventContext.rootEventId,
							parentEventId: eventContext.parentEventId,
							activityEntries: [
								{
									kind: "property",
									propertyKeys: [item.action.propertyKey],
								},
							],
						},
						{
							name: "property.changed",
							actorId: eventContext.actorId,
							boardId: currentCard.boardId,
							cardId: currentCard._id,
							statusKey: currentCard.statusKey,
							cardTypeId: currentCard.typeKey,
							tagIds: currentCard.tagIds,
							changedPropertyKeys: [item.action.propertyKey],
							previousProperties,
							patch: {
								[item.action.propertyKey]: nextValue,
							},
							workspaceId: currentCard.workspaceId,
							origin: eventContext.origin,
							depth: eventContext.depth,
							rootEventId: eventContext.rootEventId,
							parentEventId: eventContext.parentEventId,
						},
					);
					break;
				}
				case "add_tag": {
					const tag = await resolveTagIdByKey({
						ctx,
						workspaceId: currentCard.workspaceId,
						key: item.action.tagKey,
					});
					if (!tag) {
						throw new Error(`Tag not found: ${item.action.tagKey}`);
					}
					const previousTagIds = [...currentCard.tagIds];
					if (previousTagIds.includes(tag._id)) {
						trace.push({
							ruleId: item.ruleId,
							ruleName: item.ruleName,
							action: label,
							status: "skipped",
							detail: "tag already present",
						});
						break;
					}
					const nextTagIds = [...previousTagIds, tag._id];
					await ctx.db.patch(currentCard._id, {
						tagIds: nextTagIds,
						updatedAt: Date.now(),
					});
					currentCard = {
						...currentCard,
						tagIds: nextTagIds,
						updatedAt: Date.now(),
					};
					actionsExecuted += 1;
					trace.push({
						ruleId: item.ruleId,
						ruleName: item.ruleName,
						action: label,
						status: "ok",
					});
					emittedEvents.push(
						{
							name: "card.updated",
							actorId: eventContext.actorId,
							boardId: currentCard.boardId,
							cardId: currentCard._id,
							statusKey: currentCard.statusKey,
							cardTypeId: currentCard.typeKey,
							tagIds: currentCard.tagIds,
							previousTagIds,
							workspaceId: currentCard.workspaceId,
							origin: eventContext.origin,
							depth: eventContext.depth,
							rootEventId: eventContext.rootEventId,
							parentEventId: eventContext.parentEventId,
							activityEntries: [{ kind: "tag" }],
						},
						{
							name: "tag.applied",
							actorId: eventContext.actorId,
							boardId: currentCard.boardId,
							cardId: currentCard._id,
							statusKey: currentCard.statusKey,
							cardTypeId: currentCard.typeKey,
							tagIds: currentCard.tagIds,
							tagKey: item.action.tagKey,
							workspaceId: currentCard.workspaceId,
							origin: eventContext.origin,
							depth: eventContext.depth,
							rootEventId: eventContext.rootEventId,
							parentEventId: eventContext.parentEventId,
						},
					);
					break;
				}
				case "remove_tag": {
					const tag = await resolveTagIdByKey({
						ctx,
						workspaceId: currentCard.workspaceId,
						key: item.action.tagKey,
					});
					if (!tag) {
						throw new Error(`Tag not found: ${item.action.tagKey}`);
					}
					const previousTagIds = [...currentCard.tagIds];
					if (!previousTagIds.includes(tag._id)) {
						trace.push({
							ruleId: item.ruleId,
							ruleName: item.ruleName,
							action: label,
							status: "skipped",
							detail: "tag already absent",
						});
						break;
					}
					const nextTagIds = previousTagIds.filter(
						(tagId) => tagId !== tag._id,
					);
					await ctx.db.patch(currentCard._id, {
						tagIds: nextTagIds,
						updatedAt: Date.now(),
					});
					currentCard = {
						...currentCard,
						tagIds: nextTagIds,
						updatedAt: Date.now(),
					};
					actionsExecuted += 1;
					trace.push({
						ruleId: item.ruleId,
						ruleName: item.ruleName,
						action: label,
						status: "ok",
					});
					emittedEvents.push({
						name: "card.updated",
						actorId: eventContext.actorId,
						boardId: currentCard.boardId,
						cardId: currentCard._id,
						statusKey: currentCard.statusKey,
						cardTypeId: currentCard.typeKey,
						tagIds: currentCard.tagIds,
						previousTagIds,
						workspaceId: currentCard.workspaceId,
						origin: eventContext.origin,
						depth: eventContext.depth,
						rootEventId: eventContext.rootEventId,
						parentEventId: eventContext.parentEventId,
						activityEntries: [{ kind: "tag" }],
					});
					break;
				}
				case "move_status": {
					const statusKey = item.action.statusKey;
					if (!statusKeys.has(statusKey)) {
						throw new Error(`Status not found: ${statusKey}`);
					}
					const previousStatusKey = currentCard.statusKey;
					if (
						previousStatusKey === statusKey
					) {
						trace.push({
							ruleId: item.ruleId,
							ruleName: item.ruleName,
							action: label,
							status: "skipped",
							detail: "card already in status",
						});
						break;
					}
					await ctx.db.patch(currentCard._id, {
						statusKey,
						updatedAt: Date.now(),
					});
					currentCard = {
						...currentCard,
						statusKey,
						updatedAt: Date.now(),
					};
					actionsExecuted += 1;
					trace.push({
						ruleId: item.ruleId,
						ruleName: item.ruleName,
						action: label,
						status: "ok",
					});
					emittedEvents.push({
						name: "card.moved",
						actorId: eventContext.actorId,
						boardId: currentCard.boardId,
						cardId: currentCard._id,
						statusKey,
						previousStatusKey,
						nextStatusKey: statusKey,
						cardTypeId: currentCard.typeKey,
						tagIds: currentCard.tagIds,
						previousColumnId: previousStatusKey,
						nextColumnId: statusKey,
						workspaceId: currentCard.workspaceId,
						origin: eventContext.origin,
						depth: eventContext.depth,
						rootEventId: eventContext.rootEventId,
						parentEventId: eventContext.parentEventId,
					});
					break;
				}
				case "notify": {
					const recipient = await resolveNotificationRecipientUserId({
						ctx,
						card: currentCard,
						actorId: eventContext.actorId,
						recipientPropertyKey: item.action.recipientPropertyKey,
						recipientUserId: item.action.recipientUserId,
					});
					if ("skipped" in recipient) {
						trace.push({
							ruleId: item.ruleId,
							ruleName: item.ruleName,
							action: label,
							status: "skipped",
							detail: recipient.skipped,
						});
						break;
					}
					await ctx.db.insert("notifications", {
						workspaceId: currentCard.workspaceId,
						recipientUserId: recipient.recipientUserId,
						actorId: eventContext.actorId,
						boardId: currentCard.boardId,
						cardId: currentCard._id,
						workflowEventId: eventContext.workflowEventId as Id<"workflowEvents">,
						message: item.action.message,
						createdAt: Date.now(),
					});
					actionsExecuted += 1;
					trace.push({
						ruleId: item.ruleId,
						ruleName: item.ruleName,
						action: label,
						status: "ok",
						detail: item.action.message,
					});
					break;
				}
				case "stop": {
					actionsExecuted += 1;
					stop = true;
					trace.push({
						ruleId: item.ruleId,
						ruleName: item.ruleName,
						action: label,
						status: "ok",
						detail: "execution stopped",
					});
					break;
				}
			}
		} catch (error) {
			const detail =
				error instanceof Error ? error.message : "Unknown action error";
			trace.push({
				ruleId: item.ruleId,
				ruleName: item.ruleName,
				action: label,
				status: "error",
				detail,
			});
			if (failFast) {
				break;
			}
		}

		if (stop) {
			break;
		}
	}

	return {
		trace,
		actionsExecuted,
		stop,
		emittedEvents,
	};
}
