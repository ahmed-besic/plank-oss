import { normalizePropertyOptions } from "@plank/domain";
import { sortByOrderKey } from "../cardRuntime";
import { getCardScopeId } from "../plugins";
import type { QueryCtx } from "../../_generated/server";
import type { Doc, Id } from "../../_generated/dataModel";

export async function loadBoardCardRows({
	ctx,
	workspaceId,
	boardId,
}: {
	ctx: QueryCtx;
	workspaceId: Id<"workspaces">;
	boardId: Id<"boards">;
}) {
	const [cards, registryTypes, tags, allCustomFields] = await Promise.all([
		ctx.db
			.query("cards")
			.withIndex("by_board", (query) => query.eq("boardId", boardId))
			.collect(),
		ctx.db
			.query("cardTypeRegistry")
			.withIndex("by_workspace", (query) => query.eq("workspaceId", workspaceId))
			.collect(),
		ctx.db
			.query("tagDefinitions")
			.withIndex("by_workspace", (query) => query.eq("workspaceId", workspaceId))
			.collect(),
		ctx.db
			.query("workspaceCardTypeCustomFields")
			.withIndex("by_workspace", (query) => query.eq("workspaceId", workspaceId))
			.collect(),
	]);

	return { allCustomFields, cards, registryTypes, tags };
}

function buildCustomFieldsByTypeKey(
	allCustomFields: Doc<"workspaceCardTypeCustomFields">[],
) {
	const customFieldsByTypeKey = new Map<string, typeof allCustomFields>();
	for (const field of allCustomFields) {
		if (field.status !== "active") {
			continue;
		}
		const current = customFieldsByTypeKey.get(field.typeKey) ?? [];
		current.push(field);
		customFieldsByTypeKey.set(field.typeKey, current);
	}
	return customFieldsByTypeKey;
}

function buildSubtaskStatsByParentId({
	scopeId,
	topLevelCards,
	scopedCards,
	registryTypeByKey,
}: {
	scopeId: string;
	topLevelCards: Doc<"cards">[];
	scopedCards: Doc<"cards">[];
	registryTypeByKey: Map<string, Doc<"cardTypeRegistry">>;
}) {
	const parentCards = topLevelCards.filter((card) => {
		const registry = registryTypeByKey.get(card.typeKey);
		return registry?.manifest.hierarchyPolicy?.supportsChildren;
	});

	if (parentCards.length === 0) {
		return new Map<string, { total: number; completed: number }>();
	}

	const parentIdSet = new Set(parentCards.map((card) => card._id));
	const subtaskStatsByParentId = new Map<
		string,
		{ total: number; completed: number }
	>();
	for (const card of scopedCards) {
		if (!card.parentId || !parentIdSet.has(card.parentId)) {
			continue;
		}
		if (getCardScopeId(card) !== scopeId) {
			continue;
		}
		const key = String(card.parentId);
		const current = subtaskStatsByParentId.get(key) ?? {
			total: 0,
			completed: 0,
		};
		current.total += 1;
		if (card.fields.core.completed === true) {
			current.completed += 1;
		}
		subtaskStatsByParentId.set(key, current);
	}
	return subtaskStatsByParentId;
}

export function buildCardTypeSummaries({
	allCustomFields,
	boardTypeId,
	registryTypes,
}: {
	allCustomFields: Doc<"workspaceCardTypeCustomFields">[];
	boardTypeId: Id<"boardTypes">;
	registryTypes: Doc<"cardTypeRegistry">[];
}) {
	const customFieldsByTypeKey = buildCustomFieldsByTypeKey(allCustomFields);

	return registryTypes
		.filter((row) => row.status === "active")
		.map((row) => {
			const coreSchema = row.manifest.fields.core.map((field, index) => ({
				key: field.key,
				name: field.label,
				type:
					(field.enumOptions?.length ?? 0) > 0 ||
					(field.enumValues?.length ?? 0) > 0
						? "select"
						: field.valueType,
				orderKey: String(index),
				required: field.required,
				config: {
					options: normalizePropertyOptions({
						enumOptions: field.enumOptions,
						enumValues: field.enumValues,
					}),
				},
			}));
			const customSchema = (customFieldsByTypeKey.get(row.typeKey) ?? []).map(
				(field, index) => ({
					key: field.key,
					name: field.label,
					type: field.propertyType ?? field.valueType,
					orderKey: String(coreSchema.length + index),
					required: field.required,
					config: {
						source: "custom",
						options: normalizePropertyOptions({
							enumOptions: field.enumOptions,
							enumValues: field.enumValues,
						}),
					},
				}),
			);

			return {
				id: row.typeKey,
				workspaceId: row.workspaceId,
				boardTypeId,
				key: row.typeKey,
				name: row.typeKey,
				description: `${row.pluginId} (${row.schemaVersion})`,
				schemaVersion: row.schemaVersion,
				propertiesSchema: [...coreSchema, ...customSchema],
				defaultTagIds: [],
				capabilities: row.manifest.capabilities?.provides,
				hierarchyPolicy: row.manifest.hierarchyPolicy,
			};
		})
		.sort((left, right) => left.key.localeCompare(right.key));
}

export function buildTagSummaries(tags: Doc<"tagDefinitions">[]) {
	return tags.map((tag) => ({
		id: tag._id,
		workspaceId: tag.workspaceId,
		key: tag.key,
		name: tag.name,
		color: tag.color,
		description: tag.description,
	}));
}

export function buildCardSummaries({
	activeScopeId,
	cardDigestByCardId,
	cardSeenAtByCardId,
	cards,
	registryTypes,
}: {
	activeScopeId: string;
	cardDigestByCardId: Map<string, Doc<"cardDigests">>;
	cardSeenAtByCardId: Map<string, number>;
	cards: Doc<"cards">[];
	registryTypes: Doc<"cardTypeRegistry">[];
}) {
	const scopedCards = cards.filter(
		(card) => getCardScopeId(card) === activeScopeId,
	);
	const topLevelCards = scopedCards.filter((card) => !card.parentId);
	const registryTypeByKey = new Map(
		registryTypes.map((row) => [row.typeKey, row]),
	);
	const subtaskStatsByParentId = buildSubtaskStatsByParentId({
		scopeId: activeScopeId,
		topLevelCards,
		scopedCards,
		registryTypeByKey,
	});

	return sortByOrderKey(topLevelCards).map((card) => {
		const digest = cardDigestByCardId.get(String(card._id));
		return {
			id: card._id,
			boardId: card.boardId,
			scopeId: getCardScopeId(card),
			typeKey: card.typeKey,
			parentId: card.parentId ?? null,
			typeSchemaVersion: card.typeSchemaVersion,
			title: card.meta.title,
			meta: card.meta,
			statusKey: card.statusKey,
			orderKey: card.orderKey,
			properties: { ...card.fields.core, ...card.fields.custom },
			fields: card.fields,
			relations: card.relations,
			tagIds: card.tagIds,
			body: card.body,
			subtaskStats: subtaskStatsByParentId.get(String(card._id)),
			latestExternalChange: digest
				? {
						actorId: digest.latestExternalActorId,
						kind: digest.latestExternalKind,
						createdAt: digest.latestExternalChangeAt,
					}
				: undefined,
			viewerSeenAt: cardSeenAtByCardId.get(String(card._id)),
			createdBy: card.createdBy,
			createdAt: card.createdAt,
			updatedAt: card.updatedAt,
		};
	});
}
