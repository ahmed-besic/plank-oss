import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUserId, requireWorkspaceAccessBySlug } from "./lib/auth";

export const listMine = query({
	args: {
		workspaceSlug: v.string(),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const { workspace, userId } = await requireWorkspaceAccessBySlug(
			ctx,
			args.workspaceSlug,
		);
		const allRows = await ctx.db
			.query("notifications")
			.withIndex("by_workspace_recipient_created_at", (query) =>
				query
					.eq("workspaceId", workspace._id)
					.eq("recipientUserId", userId),
			)
			.collect();
		const rows = allRows
			.sort((a, b) => b.createdAt - a.createdAt)
			.slice(0, args.limit ?? 20);

		const unreadCount = allRows.filter((row) => row.readAt === undefined).length;

		return {
			items: rows.map((row) => ({
				...row,
				id: row._id,
			})),
			unreadCount,
		};
	},
});

export const markRead = mutation({
	args: {
		workspaceSlug: v.string(),
		notificationId: v.id("notifications"),
	},
	handler: async (ctx, args) => {
		const { workspace } = await requireWorkspaceAccessBySlug(ctx, args.workspaceSlug);
		const userId = await getCurrentUserId(ctx);
		const notification = await ctx.db.get(args.notificationId);
		if (
			!notification ||
			notification.workspaceId !== workspace._id ||
			notification.recipientUserId !== userId
		) {
			throw new Error("Notification not found");
		}
		if (!notification.readAt) {
			await ctx.db.patch(notification._id, {
				readAt: Date.now(),
			});
		}
		return { notificationId: notification._id };
	},
});

export const markAllRead = mutation({
	args: {
		workspaceSlug: v.string(),
	},
	handler: async (ctx, args) => {
		const { workspace } = await requireWorkspaceAccessBySlug(ctx, args.workspaceSlug);
		const userId = await getCurrentUserId(ctx);
		const notifications = await ctx.db
			.query("notifications")
			.withIndex("by_workspace_recipient_created_at", (query) =>
				query
					.eq("workspaceId", workspace._id)
					.eq("recipientUserId", userId),
			)
			.collect();
		let updated = 0;
		for (const notification of notifications) {
			if (notification.readAt) {
				continue;
			}
			await ctx.db.patch(notification._id, {
				readAt: Date.now(),
			});
			updated += 1;
		}
		return { updated };
	},
});
