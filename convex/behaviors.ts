import { createSlug } from "@plank/domain";
import type {
	SimpleBehaviorAction,
	SimpleBehaviorRuleConfig,
	SimpleBehaviorTrigger,
} from "@plank/domain";
import type { SimulateEventInput } from "@plank/domain";
import { v } from "convex/values";
import {
	mutation,
	query,
	type MutationCtx,
	type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { compileBehaviorSource } from "./lib/behaviors/compiler";
import { evaluateProgram } from "./lib/behaviors/evaluator";
import {
	behaviorTargetTypeValidator,
	simulateEventInputValidator,
} from "./lib/behaviors/validators";
import {
	requireWorkspaceAccessBySlug,
	requireWorkspaceManager,
} from "./lib/auth";

const DEFAULT_ALLOWED_TARGET_TYPES: Array<
	Doc<"behaviorPacks">["allowedTargetTypes"][number]
> = ["workspace", "boardType", "board", "cardType", "tag"];

type AnyCtx = QueryCtx | MutationCtx;

async function requireManagerWorkspace(ctx: AnyCtx, workspaceSlug: string) {
	const access = await requireWorkspaceAccessBySlug(ctx, workspaceSlug);
	requireWorkspaceManager(access.member.role);
	return access;
}

async function requirePackInWorkspace({
	ctx,
	workspaceId,
	packId,
}: {
	ctx: AnyCtx;
	workspaceId: Id<"workspaces">;
	packId: Id<"behaviorPacks">;
}) {
	const pack = await ctx.db.get(packId);
	if (!pack || pack.workspaceId !== workspaceId) {
		throw new Error("Behavior pack not found");
	}
	return pack;
}

async function requireBindingInWorkspace({
	ctx,
	workspaceId,
	bindingId,
}: {
	ctx: AnyCtx;
	workspaceId: Id<"workspaces">;
	bindingId: Id<"behaviorBindings">;
}) {
	const binding = await ctx.db.get(bindingId);
	if (!binding || binding.workspaceId !== workspaceId) {
		throw new Error("Behavior binding not found");
	}
	return binding;
}

async function ensureUniquePackKey({
	ctx,
	workspaceId,
	key,
}: {
	ctx: AnyCtx;
	workspaceId: Id<"workspaces">;
	key: string;
}) {
	const existing = await ctx.db
		.query("behaviorPacks")
		.withIndex("by_workspace_key", (query) =>
			query.eq("workspaceId", workspaceId).eq("key", key),
		)
		.unique();
	if (existing) {
		throw new Error("Behavior pack key already exists");
	}
}

async function validateBindingTarget({
	ctx,
	workspaceId,
	targetType,
	targetId,
}: {
	ctx: AnyCtx;
	workspaceId: Id<"workspaces">;
	targetType: Doc<"behaviorBindings">["targetType"];
	targetId: string;
}) {
	if (targetType === "workspace") {
		if (targetId !== workspaceId) {
			throw new Error(
				"Workspace binding target must use the current workspace id",
			);
		}
		return;
	}

	if (targetType === "cardType") {
		const registry = await ctx.db
			.query("cardTypeRegistry")
			.withIndex("by_workspace_type_key", (query) =>
				query.eq("workspaceId", workspaceId).eq("typeKey", targetId),
			)
			.unique();
		if (!registry) {
			throw new Error("Binding target not found in workspace");
		}
		return;
	}

	const doc = await ctx.db.get(
		targetId as Id<"boards"> &
			Id<"boardTypes"> &
			Id<"tagDefinitions">,
	);
	if (!doc || !("workspaceId" in doc) || doc.workspaceId !== workspaceId) {
		throw new Error("Binding target not found in workspace");
	}
}

function normalizePack(pack: Doc<"behaviorPacks">) {
	return {
		id: pack._id,
		workspaceId: pack.workspaceId,
		key: pack.key,
		name: pack.name,
		description: pack.description,
		allowedTargetTypes: pack.allowedTargetTypes,
		source: pack.source,
		compiledProgram: pack.compiledProgram,
		compileDiagnostics: pack.compileDiagnostics,
		status: pack.status,
		authoringMode: pack.authoringMode,
		simpleRuleConfig: pack.simpleRuleConfig,
		version: pack.version,
		failFast: pack.failFast,
		createdBy: pack.createdBy,
		createdAt: pack.createdAt,
		updatedAt: pack.updatedAt,
		lastCompiledAt: pack.lastCompiledAt,
		lastActivatedAt: pack.lastActivatedAt,
	};
}

export const listPacks = query({
	args: {
		workspaceSlug: v.string(),
	},
	handler: async (ctx, args) => {
		const { workspace } = await requireManagerWorkspace(
			ctx,
			args.workspaceSlug,
		);
		const packs = await ctx.db
			.query("behaviorPacks")
			.withIndex("by_workspace", (query) =>
				query.eq("workspaceId", workspace._id),
			)
			.collect();
		return packs.map(normalizePack);
	},
});

export const createPack = mutation({
	args: {
		workspaceSlug: v.string(),
		name: v.string(),
		key: v.optional(v.string()),
		source: v.optional(v.string()),
		allowedTargetTypes: v.optional(v.array(behaviorTargetTypeValidator)),
	},
	handler: async (ctx, args) => {
		const { workspace, userId } = await requireManagerWorkspace(
			ctx,
			args.workspaceSlug,
		);
		const normalizedKey = createSlug(args.key ?? args.name) || "behavior-pack";
		await ensureUniquePackKey({
			ctx,
			workspaceId: workspace._id,
			key: normalizedKey,
		});

		const now = Date.now();
		const packId = await ctx.db.insert("behaviorPacks", {
			workspaceId: workspace._id,
			key: normalizedKey,
			name: args.name,
			allowedTargetTypes:
				args.allowedTargetTypes ?? DEFAULT_ALLOWED_TARGET_TYPES,
			source: args.source ?? "",
			compileDiagnostics: [],
			status: "draft",
			authoringMode: "dsl",
			version: 1,
			failFast: false,
			createdBy: userId,
			createdAt: now,
			updatedAt: now,
		});

		return { packId };
	},
});

export const updatePackSource = mutation({
	args: {
		workspaceSlug: v.string(),
		packId: v.id("behaviorPacks"),
		source: v.string(),
	},
	handler: async (ctx, args) => {
		const { workspace } = await requireManagerWorkspace(
			ctx,
			args.workspaceSlug,
		);
		const pack = await requirePackInWorkspace({
			ctx,
			workspaceId: workspace._id,
			packId: args.packId,
		});

		await ctx.db.patch(pack._id, {
			source: args.source,
			status: "draft",
			authoringMode: "dsl",
			simpleRuleConfig: undefined,
			compileDiagnostics: [],
			updatedAt: Date.now(),
			version: pack.version + 1,
		});

		return { packId: pack._id };
	},
});

export const compilePack = mutation({
	args: {
		workspaceSlug: v.string(),
		packId: v.id("behaviorPacks"),
	},
	handler: async (ctx, args) => {
		const { workspace } = await requireManagerWorkspace(
			ctx,
			args.workspaceSlug,
		);
		const pack = await requirePackInWorkspace({
			ctx,
			workspaceId: workspace._id,
			packId: args.packId,
		});

		const result = await compileBehaviorSource({
			ctx,
			workspaceId: workspace._id,
			source: pack.source,
		});

		const {
			compiledProgram: _previousCompiledProgram,
			...packWithoutCompiledProgram
		} = pack;
		const nextPack: Doc<"behaviorPacks"> = {
			...packWithoutCompiledProgram,
			compileDiagnostics: result.diagnostics,
			lastCompiledAt: Date.now(),
			updatedAt: Date.now(),
			...(result.program ? { compiledProgram: result.program } : {}),
		};

		await ctx.db.replace(pack._id, nextPack);

		return {
			packId: pack._id,
			diagnostics: result.diagnostics,
			hasErrors: result.diagnostics.some(
				(diagnostic) => diagnostic.level === "error",
			),
		};
	},
});

export const activatePack = mutation({
	args: {
		workspaceSlug: v.string(),
		packId: v.id("behaviorPacks"),
	},
	handler: async (ctx, args) => {
		const { workspace } = await requireManagerWorkspace(
			ctx,
			args.workspaceSlug,
		);
		const pack = await requirePackInWorkspace({
			ctx,
			workspaceId: workspace._id,
			packId: args.packId,
		});
		if (pack.authoringMode === "simple") {
			throw new Error(
				"Simple packs activate through the simple editor. Edit the rule there or convert it to DSL mode first.",
			);
		}

		if (!pack.compiledProgram) {
			throw new Error("Compile the behavior pack before activating it");
		}
		if (
			pack.compileDiagnostics.some((diagnostic) => diagnostic.level === "error")
		) {
			throw new Error("Behavior pack has compile errors");
		}

		await ctx.db.patch(pack._id, {
			status: "active",
			lastActivatedAt: Date.now(),
			updatedAt: Date.now(),
		});

		return { packId: pack._id };
	},
});

export const archivePack = mutation({
	args: {
		workspaceSlug: v.string(),
		packId: v.id("behaviorPacks"),
	},
	handler: async (ctx, args) => {
		const { workspace } = await requireManagerWorkspace(
			ctx,
			args.workspaceSlug,
		);
		const pack = await requirePackInWorkspace({
			ctx,
			workspaceId: workspace._id,
			packId: args.packId,
		});
		if (pack.authoringMode === "simple") {
			throw new Error(
				"Simple packs are managed in simple mode. Disable the rule there or convert it to DSL mode first.",
			);
		}

		const bindings = await ctx.db
			.query("behaviorBindings")
			.withIndex("by_pack", (query) => query.eq("behaviorPackId", pack._id))
			.collect();
		for (const binding of bindings) {
			if (binding.enabled) {
				await ctx.db.patch(binding._id, {
					enabled: false,
					updatedAt: Date.now(),
				});
			}
		}

		await ctx.db.patch(pack._id, {
			status: "archived",
			updatedAt: Date.now(),
		});

		return { packId: pack._id };
	},
});

export const listBindings = query({
	args: {
		workspaceSlug: v.string(),
		targetType: v.optional(behaviorTargetTypeValidator),
		targetId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { workspace } = await requireManagerWorkspace(
			ctx,
			args.workspaceSlug,
		);
		const bindings =
			args.targetType && args.targetId
				? await ctx.db
						.query("behaviorBindings")
						.withIndex("by_workspace_target", (query) =>
							query
								.eq("workspaceId", workspace._id)
								.eq("targetType", args.targetType!)
								.eq("targetId", args.targetId!),
						)
						.collect()
				: await ctx.db
						.query("behaviorBindings")
						.withIndex("by_workspace", (query) =>
							query.eq("workspaceId", workspace._id),
						)
						.collect();

		return Promise.all(
			bindings.map(async (binding) => {
				const pack = await ctx.db.get(binding.behaviorPackId);
				return {
					id: binding._id,
					workspaceId: binding.workspaceId,
					targetType: binding.targetType,
					targetId: binding.targetId,
					behaviorPackId: binding.behaviorPackId,
					priority: binding.priority,
					enabled: binding.enabled,
					createdBy: binding.createdBy,
					createdAt: binding.createdAt,
					updatedAt: binding.updatedAt,
					packName: pack?.name,
					packStatus: pack?.status,
					packAuthoringMode: pack?.authoringMode,
				};
			}),
		);
	},
});

function assertPackCanBindTarget({
	pack,
	targetType,
}: {
	pack: Doc<"behaviorPacks">;
	targetType: Doc<"behaviorBindings">["targetType"];
}) {
	if (!pack.allowedTargetTypes.includes(targetType)) {
		throw new Error("Behavior pack cannot be bound to this target type");
	}
}

function assertAdvancedBindingManagementAllowed(pack: Doc<"behaviorPacks">) {
	if (pack.authoringMode === "simple") {
		throw new Error(
			"Simple packs manage bindings in simple mode. Convert the pack to DSL by editing its source before using advanced binding controls.",
		);
	}
}

async function assertNoDuplicateBinding({
	ctx,
	workspaceId,
	targetType,
	targetId,
	packId,
}: {
	ctx: MutationCtx;
	workspaceId: Id<"workspaces">;
	targetType: Doc<"behaviorBindings">["targetType"];
	targetId: string;
	packId: Id<"behaviorPacks">;
}) {
	const existing = await ctx.db
		.query("behaviorBindings")
		.withIndex("by_workspace_target", (query) =>
			query
				.eq("workspaceId", workspaceId)
				.eq("targetType", targetType)
				.eq("targetId", targetId),
		)
		.collect();
	const duplicate = existing.find((binding) => binding.behaviorPackId === packId);
	if (duplicate) {
		throw new Error("Behavior pack is already bound to that target");
	}
}

async function insertBehaviorBinding({
	ctx,
	workspaceId,
	pack,
	targetType,
	targetId,
	priority,
	enabled,
	userId,
}: {
	ctx: MutationCtx;
	workspaceId: Id<"workspaces">;
	pack: Doc<"behaviorPacks">;
	targetType: Doc<"behaviorBindings">["targetType"];
	targetId: string;
	priority?: number;
	enabled?: boolean;
	userId: string;
}) {
	const now = Date.now();
	return await ctx.db.insert("behaviorBindings", {
		workspaceId,
		targetType,
		targetId,
		behaviorPackId: pack._id,
		priority: priority ?? 100,
		enabled: enabled ?? pack.status === "active",
		createdBy: userId,
		createdAt: now,
		updatedAt: now,
	});
}

function serializeBehaviorLiteral(value: string | number | boolean | null) {
	if (value === null) {
		return "null";
	}
	if (typeof value === "string") {
		return JSON.stringify(value);
	}
	return String(value);
}

function toSimpleTriggerLine(trigger: SimpleBehaviorTrigger) {
	switch (trigger.eventName) {
		case "card.created":
			return "when card created";
		case "card.moved":
			return "when card moved";
		case "tag.applied":
			return "when tag applied";
	}
}

function toSimpleActionLine(action: SimpleBehaviorAction) {
	switch (action.type) {
		case "set_property":
			return `set ${action.propertyKey} to ${serializeBehaviorLiteral(action.value)}`;
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
	}
}

function buildSimplePackSource(config: SimpleBehaviorRuleConfig) {
	return [
		`rule ${config.name}`,
		toSimpleTriggerLine(config.trigger),
		toSimpleActionLine(config.action),
	].join("\n");
}

async function removeBindingsForPack({
	ctx,
	packId,
}: {
	ctx: MutationCtx;
	packId: Id<"behaviorPacks">;
}) {
	const bindings = await ctx.db
		.query("behaviorBindings")
		.withIndex("by_pack", (query) => query.eq("behaviorPackId", packId))
		.collect();
	for (const binding of bindings) {
		await ctx.db.delete(binding._id);
	}
}

export const saveSimplePack = mutation({
	args: {
		workspaceSlug: v.string(),
		packId: v.optional(v.id("behaviorPacks")),
		config: v.object({
			name: v.string(),
			trigger: v.union(
				v.object({
					eventName: v.literal("card.created"),
				}),
				v.object({
					eventName: v.literal("card.moved"),
				}),
				v.object({
					eventName: v.literal("tag.applied"),
				}),
			),
			action: v.union(
				v.object({
					type: v.literal("set_property"),
					propertyKey: v.string(),
					value: v.union(v.string(), v.number(), v.boolean(), v.null()),
				}),
				v.object({
					type: v.literal("set_current_date"),
					propertyKey: v.string(),
				}),
				v.object({
					type: v.literal("add_tag"),
					tagKey: v.string(),
				}),
				v.object({
					type: v.literal("remove_tag"),
					tagKey: v.string(),
				}),
				v.object({
					type: v.literal("move_status"),
					statusKey: v.string(),
				}),
				v.object({
					type: v.literal("notify"),
					recipientPropertyKey: v.optional(v.string()),
					recipientUserId: v.optional(v.string()),
					message: v.string(),
				}),
			),
			targetType: behaviorTargetTypeValidator,
			targetId: v.string(),
			priority: v.number(),
			enabled: v.boolean(),
		}),
	},
	handler: async (ctx, args) => {
		const { workspace, userId } = await requireManagerWorkspace(
			ctx,
			args.workspaceSlug,
		);
		const source = buildSimplePackSource(args.config);
		const compileResult = await compileBehaviorSource({
			ctx,
			workspaceId: workspace._id,
			source,
		});
		const hasErrors = compileResult.diagnostics.some(
			(diagnostic) => diagnostic.level === "error",
		);

		await validateBindingTarget({
			ctx,
			workspaceId: workspace._id,
			targetType: args.config.targetType,
			targetId: args.config.targetId,
		});

		const now = Date.now();
		let packId = args.packId;
		if (!packId) {
			const normalizedKey = createSlug(args.config.name) || "behavior-pack";
			await ensureUniquePackKey({
				ctx,
				workspaceId: workspace._id,
				key: normalizedKey,
			});
			packId = await ctx.db.insert("behaviorPacks", {
				workspaceId: workspace._id,
				key: normalizedKey,
				name: args.config.name,
				allowedTargetTypes: [args.config.targetType],
				source,
				compiledProgram: compileResult.program,
				compileDiagnostics: compileResult.diagnostics,
				status: hasErrors ? "draft" : "active",
				authoringMode: "simple",
				simpleRuleConfig: args.config,
				version: 1,
				failFast: false,
				createdBy: userId,
				createdAt: now,
				updatedAt: now,
				lastCompiledAt: now,
				lastActivatedAt: hasErrors ? undefined : now,
			});
		} else {
			const pack = await requirePackInWorkspace({
				ctx,
				workspaceId: workspace._id,
				packId,
			});
			if (pack.authoringMode === "dsl") {
				throw new Error("Advanced DSL packs cannot be edited in simple mode");
			}
			const {
				compiledProgram: _previousCompiledProgram,
				...packWithoutCompiledProgram
			} = pack;
			const nextPack: Doc<"behaviorPacks"> = {
				...packWithoutCompiledProgram,
				name: args.config.name,
				allowedTargetTypes: [args.config.targetType],
				source,
				compileDiagnostics: compileResult.diagnostics,
				status: hasErrors ? "draft" : "active",
				authoringMode: "simple",
				simpleRuleConfig: args.config,
				version: pack.version + 1,
				updatedAt: now,
				lastCompiledAt: now,
				lastActivatedAt: hasErrors ? pack.lastActivatedAt : now,
				...(compileResult.program ? { compiledProgram: compileResult.program } : {}),
			};
			await ctx.db.replace(pack._id, nextPack);
			await removeBindingsForPack({
				ctx,
				packId: pack._id,
			});
		}

		const savedPack = await requirePackInWorkspace({
			ctx,
			workspaceId: workspace._id,
			packId: packId!,
		});
		if (!hasErrors) {
			await insertBehaviorBinding({
				ctx,
				workspaceId: workspace._id,
				pack: savedPack,
				targetType: args.config.targetType,
				targetId: args.config.targetId,
				priority: args.config.priority,
				enabled: args.config.enabled,
				userId,
			});
		}

		return {
			packId,
			diagnostics: compileResult.diagnostics,
			hasErrors,
		};
	},
});

export const bindPack = mutation({
	args: {
		workspaceSlug: v.string(),
		packId: v.id("behaviorPacks"),
		targetType: behaviorTargetTypeValidator,
		targetId: v.string(),
		priority: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { workspace, userId } = await requireManagerWorkspace(
			ctx,
			args.workspaceSlug,
		);
		const pack = await requirePackInWorkspace({
			ctx,
			workspaceId: workspace._id,
			packId: args.packId,
		});
		assertAdvancedBindingManagementAllowed(pack);

		assertPackCanBindTarget({ pack, targetType: args.targetType });

		await validateBindingTarget({
			ctx,
			workspaceId: workspace._id,
			targetType: args.targetType,
			targetId: args.targetId,
		});

		await assertNoDuplicateBinding({
			ctx,
			workspaceId: workspace._id,
			targetType: args.targetType,
			targetId: args.targetId,
			packId: pack._id,
		});
		const bindingId = await insertBehaviorBinding({
			ctx,
			workspaceId: workspace._id,
			pack,
			targetType: args.targetType,
			targetId: args.targetId,
			priority: args.priority,
			userId,
		});

		return { bindingId };
	},
});

export const setBindingEnabled = mutation({
	args: {
		workspaceSlug: v.string(),
		bindingId: v.id("behaviorBindings"),
		enabled: v.boolean(),
	},
	handler: async (ctx, args) => {
		const { workspace } = await requireManagerWorkspace(
			ctx,
			args.workspaceSlug,
		);
		const binding = await requireBindingInWorkspace({
			ctx,
			workspaceId: workspace._id,
			bindingId: args.bindingId,
		});
		const pack = await requirePackInWorkspace({
			ctx,
			workspaceId: workspace._id,
			packId: binding.behaviorPackId,
		});
		assertAdvancedBindingManagementAllowed(pack);
		if (args.enabled && pack.status === "archived") {
			throw new Error("Archived behavior packs cannot have enabled bindings");
		}

		await ctx.db.patch(binding._id, {
			enabled: args.enabled,
			updatedAt: Date.now(),
		});

		return { bindingId: binding._id };
	},
});

export const unbindPack = mutation({
	args: {
		workspaceSlug: v.string(),
		bindingId: v.id("behaviorBindings"),
	},
	handler: async (ctx, args) => {
		const { workspace } = await requireManagerWorkspace(
			ctx,
			args.workspaceSlug,
		);
		const binding = await requireBindingInWorkspace({
			ctx,
			workspaceId: workspace._id,
			bindingId: args.bindingId,
		});
		const pack = await requirePackInWorkspace({
			ctx,
			workspaceId: workspace._id,
			packId: binding.behaviorPackId,
		});
		assertAdvancedBindingManagementAllowed(pack);
		await ctx.db.delete(binding._id);
		return { bindingId: binding._id };
	},
});

function buildSimulationEvent({
	workspaceId,
	card,
	input,
}: {
	workspaceId: Id<"workspaces">;
	card: Doc<"cards">;
	input: SimulateEventInput;
}) {
	const base = {
		name: input.name,
		eventId: crypto.randomUUID(),
		boardId: input.boardId,
		cardId: input.cardId,
		workspaceId,
		actorId: input.actorId,
		timestamp: Date.now(),
		statusKey: card.statusKey,
		typeKey: card.typeKey,
		cardTypeId: card.typeKey,
		tagIds: card.tagIds,
		previousColumnId: card.statusKey,
	};
	const patchFromKeys = (keys: string[] | undefined) =>
		keys
			? Object.fromEntries(
					keys.map((key) => [key, card.fields.core[key] ?? card.fields.custom[key]]),
				)
			: {};

	if (input.name === "card.created") {
		return base;
	}
	if (input.name === "card.updated") {
		return {
			...base,
			changedPropertyKeys: input.changedPropertyKeys,
			previousProperties: input.previousProperties,
			patch: patchFromKeys(input.changedPropertyKeys),
		};
	}
	if (input.name === "card.moved") {
		return {
			...base,
			previousStatusKey: input.previousStatusKey,
			nextStatusKey: input.nextStatusKey,
			statusKey: input.nextStatusKey,
		};
	}
	if (input.name === "card.deleted") {
		return {
			...base,
			previousStatusKey: card.statusKey,
		};
	}
	if (input.name === "tag.applied") {
		return {
			...base,
			tagKey: input.tagKey,
		};
	}
	return {
		...base,
		changedPropertyKeys: input.changedPropertyKeys,
		previousProperties: input.previousProperties,
		patch: patchFromKeys(input.changedPropertyKeys),
	};
}

export const simulate = query({
	args: {
		workspaceSlug: v.string(),
		packId: v.id("behaviorPacks"),
		event: simulateEventInputValidator,
	},
	handler: async (ctx, args) => {
		const { workspace } = await requireManagerWorkspace(
			ctx,
			args.workspaceSlug,
		);
		const pack = await requirePackInWorkspace({
			ctx,
			workspaceId: workspace._id,
			packId: args.packId,
		});

		if (!pack.compiledProgram) {
			throw new Error("Behavior pack must be compiled before simulation");
		}

		const card = await ctx.db.get(args.event.cardId);
		if (
			!card ||
			card.workspaceId !== workspace._id ||
			card.boardId !== args.event.boardId
		) {
			throw new Error("Card not found for simulation");
		}

		const event = buildSimulationEvent({
			workspaceId: workspace._id,
			card,
			input: args.event as SimulateEventInput,
		});

		const evaluation = evaluateProgram({
			event,
			program: pack.compiledProgram,
		});

		return {
			event,
			matchedRuleIds: evaluation.matchedRuleIds,
			actions: evaluation.actions,
			trace: evaluation.trace,
		};
	},
});

async function loadRunsByPrimaryFilter({
	ctx,
	workspaceId,
	args,
}: {
	ctx: QueryCtx;
	workspaceId: Id<"workspaces">;
	args: {
		cardId?: Id<"cards">;
		boardId?: Id<"boards">;
		eventName?:
			| "card.created"
			| "card.updated"
			| "card.moved"
			| "card.deleted"
			| "tag.applied"
			| "property.changed";
	};
}) {
	if (args.cardId) {
		return await ctx.db
			.query("automationRuns")
			.withIndex("by_card", (query) =>
				query.eq("workspaceId", workspaceId).eq("cardId", args.cardId!),
			)
			.take(50);
	}
	if (args.boardId) {
		return await ctx.db
			.query("automationRuns")
			.withIndex("by_board", (query) =>
				query.eq("workspaceId", workspaceId).eq("boardId", args.boardId!),
			)
			.take(50);
	}
	if (args.eventName) {
		return await ctx.db
			.query("automationRuns")
			.withIndex("by_event", (query) =>
				query
					.eq("workspaceId", workspaceId)
					.eq("eventName", args.eventName!),
			)
			.take(50);
	}
	return await ctx.db
		.query("automationRuns")
		.withIndex("by_workspace", (query) => query.eq("workspaceId", workspaceId))
		.take(50);
}

export const listRuns = query({
	args: {
		workspaceSlug: v.string(),
		eventName: v.optional(
			v.union(
				v.literal("card.created"),
				v.literal("card.updated"),
				v.literal("card.moved"),
				v.literal("card.deleted"),
				v.literal("tag.applied"),
				v.literal("property.changed"),
			),
		),
		status: v.optional(
			v.union(
				v.literal("ok"),
				v.literal("error"),
				v.literal("partial"),
				v.literal("guard_stopped"),
			),
		),
		cardId: v.optional(v.id("cards")),
		boardId: v.optional(v.id("boards")),
	},
	handler: async (ctx, args) => {
		const { workspace } = await requireManagerWorkspace(
			ctx,
			args.workspaceSlug,
		);
		let runs = await loadRunsByPrimaryFilter({
			ctx,
			workspaceId: workspace._id,
			args: {
				cardId: args.cardId,
				boardId: args.boardId,
				eventName: args.eventName,
			},
		});

		if (args.status) {
			runs = runs.filter((run) => run.status === args.status);
		}

		return runs;
	},
});

export const getRun = query({
	args: {
		workspaceSlug: v.string(),
		runId: v.id("automationRuns"),
	},
	handler: async (ctx, args) => {
		const { workspace } = await requireManagerWorkspace(
			ctx,
			args.workspaceSlug,
		);
		const run = await ctx.db.get(args.runId);
		if (!run || run.workspaceId !== workspace._id) {
			throw new Error("Automation run not found");
		}
		return run;
	},
});
