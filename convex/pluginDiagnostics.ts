import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireExtensionManager, requireWorkspaceAccessBySlug } from "./lib/auth";

export const listRecent = query({
	args: {
		workspaceSlug: v.string(),
		pluginId: v.optional(v.string()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member, workspace } = await requireWorkspaceAccessBySlug(
			ctx,
			args.workspaceSlug,
		);
		requireExtensionManager(member.role);
		const limit = Math.max(1, Math.min(args.limit ?? 20, 100));
		const rows = args.pluginId
			? await ctx.db
					.query("pluginDiagnostics")
					.withIndex("by_workspace_plugin_created_at", (query) =>
						query
							.eq("workspaceId", workspace._id)
							.eq("pluginId", args.pluginId),
					)
					.order("desc")
					.take(limit)
			: await ctx.db
					.query("pluginDiagnostics")
					.withIndex("by_workspace_created_at", (query) =>
						query.eq("workspaceId", workspace._id),
					)
					.order("desc")
					.take(limit);

		return rows.map((row) => ({
			id: row._id,
			pluginId: row.pluginId,
			kind: row.kind,
			severity: row.severity,
			message: row.message,
			permission: row.permission,
			handlerId: row.handlerId,
			eventId: row.eventId,
			boardId: row.boardId,
			cardId: row.cardId,
			actorId: row.actorId,
			previousStatus: row.previousStatus,
			nextStatus: row.nextStatus,
			createdAt: row.createdAt,
		}));
	},
});

export const pruneOlderThan = mutation({
	args: {
		workspaceSlug: v.string(),
		olderThan: v.number(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { member, workspace } = await requireWorkspaceAccessBySlug(
			ctx,
			args.workspaceSlug,
		);
		requireExtensionManager(member.role);
		const limit = Math.max(1, Math.min(args.limit ?? 100, 500));
		const rows = await ctx.db
			.query("pluginDiagnostics")
			.withIndex("by_workspace_created_at", (query) =>
				query.eq("workspaceId", workspace._id).lt("createdAt", args.olderThan),
			)
			.take(limit);
		for (const row of rows) {
			await ctx.db.delete(row._id);
		}
		return { deleted: rows.length };
	},
});
