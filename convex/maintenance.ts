import {
	builtinServerPluginRegistry,
	isRequiredBuiltinPluginId,
} from "@plank/plugin-runtime/server";
import { v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireWorkspaceAccessBySlug } from "./lib/auth";

type CleanupCtx = QueryCtx | MutationCtx;

type CleanupTable =
	| "workspaceExtensions"
	| "pluginDiagnostics"
	| "boardViews"
	| "cardTypeRegistry"
	| "behaviorPacks"
	| "behaviorBindings"
	| "automationRuns";

type BlockedRow =
	| {
			table: "boardViews";
			id: Id<"boardViews">;
			pluginId: string;
			boardId: Id<"boards">;
			instanceId: string;
			reason: "scoped_cards_exist";
	  }
	| {
			table: "cardTypeRegistry";
			id: Id<"cardTypeRegistry">;
			pluginId: string;
			typeKey: string;
			reason: "cards_use_type_key";
	  };

type CleanupPlan = {
	orphanPluginIds: string[];
	counts: Record<CleanupTable, number>;
	blocked: BlockedRow[];
	blockedCounts: {
		boardViews: number;
		cardTypeRegistry: number;
	};
	deletable: {
		workspaceExtensions: Id<"workspaceExtensions">[];
		pluginDiagnostics: Id<"pluginDiagnostics">[];
		boardViews: Id<"boardViews">[];
		cardTypeRegistry: Id<"cardTypeRegistry">[];
		behaviorPacks: Id<"behaviorPacks">[];
		behaviorBindings: Id<"behaviorBindings">[];
		automationRuns: Id<"automationRuns">[];
	};
};

function requireWorkspaceOwner(role: Doc<"workspaceMembers">["role"]) {
	if (role !== "owner") {
		throw new Error("Only workspace owners can run maintenance cleanup");
	}
}

function getCurrentPluginIds() {
	return new Set(
		builtinServerPluginRegistry.plugins.map((plugin) => plugin.manifest.id),
	);
}

function getOrphanPluginId(pluginId: string | undefined, currentPluginIds: Set<string>) {
	if (!pluginId || currentPluginIds.has(pluginId) || isRequiredBuiltinPluginId(pluginId)) {
		return null;
	}
	return pluginId;
}

function emptyPlan(): CleanupPlan {
	return {
		orphanPluginIds: [],
		counts: {
			workspaceExtensions: 0,
			pluginDiagnostics: 0,
			boardViews: 0,
			cardTypeRegistry: 0,
			behaviorPacks: 0,
			behaviorBindings: 0,
			automationRuns: 0,
		},
		blocked: [],
		blockedCounts: {
			boardViews: 0,
			cardTypeRegistry: 0,
		},
		deletable: {
			workspaceExtensions: [],
			pluginDiagnostics: [],
			boardViews: [],
			cardTypeRegistry: [],
			behaviorPacks: [],
			behaviorBindings: [],
			automationRuns: [],
		},
	};
}

function finalizePlan(plan: CleanupPlan, orphanPluginIds: Set<string>) {
	plan.orphanPluginIds = [...orphanPluginIds].sort();
	plan.blockedCounts = {
		boardViews: plan.blocked.filter((row) => row.table === "boardViews").length,
		cardTypeRegistry: plan.blocked.filter(
			(row) => row.table === "cardTypeRegistry",
		).length,
	};
	for (const table of Object.keys(plan.deletable) as CleanupTable[]) {
		plan.counts[table] = plan.deletable[table].length;
	}
	return plan;
}

async function buildPluginArtifactCleanupPlan(
	ctx: CleanupCtx,
	workspaceId: Id<"workspaces">,
): Promise<CleanupPlan> {
	const currentPluginIds = getCurrentPluginIds();
	const orphanPluginIds = new Set<string>();
	const plan = emptyPlan();

	const workspaceExtensions = await ctx.db
		.query("workspaceExtensions")
		.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
		.collect();
	for (const extension of workspaceExtensions) {
		const orphanPluginId = getOrphanPluginId(extension.pluginId, currentPluginIds);
		if (!orphanPluginId) {
			continue;
		}
		orphanPluginIds.add(orphanPluginId);
		plan.deletable.workspaceExtensions.push(extension._id);
	}

	const diagnostics = await ctx.db
		.query("pluginDiagnostics")
		.withIndex("by_workspace_created_at", (q) => q.eq("workspaceId", workspaceId))
		.collect();
	for (const diagnostic of diagnostics) {
		const orphanPluginId = getOrphanPluginId(diagnostic.pluginId, currentPluginIds);
		if (!orphanPluginId) {
			continue;
		}
		orphanPluginIds.add(orphanPluginId);
		plan.deletable.pluginDiagnostics.push(diagnostic._id);
	}

	const boardViews = await ctx.db
		.query("boardViews")
		.withIndex("by_workspace_board_view", (q) => q.eq("workspaceId", workspaceId))
		.collect();
	for (const boardView of boardViews) {
		const directPluginId = getOrphanPluginId(boardView.pluginId, currentPluginIds);
		const featurePluginId = getOrphanPluginId(
			boardView.featureInstance?.pluginPackageId,
			currentPluginIds,
		);
		const orphanPluginId = directPluginId ?? featurePluginId;
		if (!orphanPluginId) {
			continue;
		}
		orphanPluginIds.add(orphanPluginId);
		if (boardView.instanceId) {
			const scopedCard = await ctx.db
				.query("cards")
				.withIndex("by_board_scope", (q) =>
					q.eq("boardId", boardView.boardId).eq("scopeId", boardView.instanceId),
				)
				.first();
			if (scopedCard) {
				plan.blocked.push({
					table: "boardViews",
					id: boardView._id,
					pluginId: orphanPluginId,
					boardId: boardView.boardId,
					instanceId: boardView.instanceId,
					reason: "scoped_cards_exist",
				});
				continue;
			}
		}
		plan.deletable.boardViews.push(boardView._id);
	}

	const cardTypeRows = await ctx.db
		.query("cardTypeRegistry")
		.withIndex("by_workspace_plugin", (q) => q.eq("workspaceId", workspaceId))
		.collect();
	for (const cardType of cardTypeRows) {
		const orphanPluginId = getOrphanPluginId(cardType.pluginId, currentPluginIds);
		if (!orphanPluginId) {
			continue;
		}
		orphanPluginIds.add(orphanPluginId);
		const typedCard = await ctx.db
			.query("cards")
			.withIndex("by_type_key", (q) =>
				q.eq("workspaceId", workspaceId).eq("typeKey", cardType.typeKey),
			)
			.first();
		if (typedCard) {
			plan.blocked.push({
				table: "cardTypeRegistry",
				id: cardType._id,
				pluginId: orphanPluginId,
				typeKey: cardType.typeKey,
				reason: "cards_use_type_key",
			});
			continue;
		}
		plan.deletable.cardTypeRegistry.push(cardType._id);
	}

	const behaviorBindings = await ctx.db
		.query("behaviorBindings")
		.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
		.collect();
	plan.deletable.behaviorBindings.push(
		...behaviorBindings.map((binding) => binding._id),
	);

	const behaviorPacks = await ctx.db
		.query("behaviorPacks")
		.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
		.collect();
	plan.deletable.behaviorPacks.push(...behaviorPacks.map((pack) => pack._id));

	const automationRuns = await ctx.db
		.query("automationRuns")
		.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
		.collect();
	plan.deletable.automationRuns.push(...automationRuns.map((run) => run._id));

	return finalizePlan(plan, orphanPluginIds);
}

async function deleteRows(ctx: MutationCtx, ids: Id<CleanupTable>[]) {
	for (const id of ids) {
		await ctx.db.delete(id);
	}
}

export const previewPluginArtifactCleanup = query({
	args: {
		workspaceSlug: v.string(),
	},
	handler: async (ctx, args) => {
		const { member, workspace } = await requireWorkspaceAccessBySlug(
			ctx,
			args.workspaceSlug,
		);
		requireWorkspaceOwner(member.role);
		return await buildPluginArtifactCleanupPlan(ctx, workspace._id);
	},
});

export const cleanupPluginArtifacts = mutation({
	args: {
		workspaceSlug: v.string(),
	},
	handler: async (ctx, args) => {
		const { member, workspace } = await requireWorkspaceAccessBySlug(
			ctx,
			args.workspaceSlug,
		);
		requireWorkspaceOwner(member.role);

		const plan = await buildPluginArtifactCleanupPlan(ctx, workspace._id);
		await deleteRows(ctx, plan.deletable.pluginDiagnostics);
		await deleteRows(ctx, plan.deletable.workspaceExtensions);
		await deleteRows(ctx, plan.deletable.boardViews);
		await deleteRows(ctx, plan.deletable.cardTypeRegistry);
		await deleteRows(ctx, plan.deletable.automationRuns);
		await deleteRows(ctx, plan.deletable.behaviorBindings);
		await deleteRows(ctx, plan.deletable.behaviorPacks);

		return {
			...plan,
			deleted: plan.counts,
		};
	},
});
