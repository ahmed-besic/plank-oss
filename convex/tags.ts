import { createSlug } from "@plank/domain";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUserId, requireWorkspaceAccessBySlug } from "./lib/auth";
import { emitCardEvent } from "./lib/plugins";

export const listForWorkspace = query({
	args: {
		workspaceSlug: v.string(),
	},
	handler: async (ctx, args) => {
		const { workspace } = await requireWorkspaceAccessBySlug(
			ctx,
			args.workspaceSlug,
		);
		const tags = await ctx.db
			.query("tagDefinitions")
			.withIndex("by_workspace", (query) =>
				query.eq("workspaceId", workspace._id),
			)
			.collect();

		return tags
			.map((tag) => ({
				id: tag._id,
				key: tag.key,
				name: tag.name,
				color: tag.color,
				description: tag.description,
			}))
			.sort((left, right) => left.name.localeCompare(right.name));
	},
});

export const createTag = mutation({
	args: {
		workspaceSlug: v.string(),
		name: v.string(),
		key: v.optional(v.string()),
		color: v.optional(v.string()),
		description: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { workspace } = await requireWorkspaceAccessBySlug(
			ctx,
			args.workspaceSlug,
		);
		const now = Date.now();
		const baseKey = createSlug(args.key ?? args.name) || "tag";

		let key = baseKey;
		let suffix = 2;
		while (
			await ctx.db
				.query("tagDefinitions")
				.withIndex("by_workspace_key", (query) =>
					query.eq("workspaceId", workspace._id).eq("key", key),
				)
				.unique()
		) {
			key = `${baseKey}-${suffix}`;
			suffix += 1;
		}

		const tagId = await ctx.db.insert("tagDefinitions", {
			workspaceId: workspace._id,
			key,
			name: args.name,
			color: args.color ?? "violet",
			description: args.description,
			createdAt: now,
			updatedAt: now,
		});

		return { tagId };
	},
});

export const updateTag = mutation({
	args: {
		workspaceSlug: v.string(),
		tagId: v.id("tagDefinitions"),
		name: v.optional(v.string()),
		color: v.optional(v.string()),
		description: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const { workspace } = await requireWorkspaceAccessBySlug(
			ctx,
			args.workspaceSlug,
		);
		const tag = await ctx.db.get(args.tagId);
		if (!tag || tag.workspaceId !== workspace._id) {
			throw new Error("Tag not found");
		}

		const patch: {
			name?: string;
			color?: string;
			description?: string;
			updatedAt: number;
		} = {
			updatedAt: Date.now(),
		};

		if (typeof args.name === "string") {
			patch.name = args.name;
		}
		if (typeof args.color === "string") {
			patch.color = args.color;
		}
		if (typeof args.description === "string") {
			patch.description = args.description;
		}

		await ctx.db.patch(tag._id, patch);

		return { tagId: tag._id };
	},
});

export const deleteTag = mutation({
	args: {
		workspaceSlug: v.string(),
		tagId: v.id("tagDefinitions"),
	},
	handler: async (ctx, args) => {
		const { workspace } = await requireWorkspaceAccessBySlug(
			ctx,
			args.workspaceSlug,
		);
		const userId = await getCurrentUserId(ctx);
		const tag = await ctx.db.get(args.tagId);
		if (!tag || tag.workspaceId !== workspace._id) {
			throw new Error("Tag not found");
		}

		const boards = await ctx.db
			.query("boards")
			.withIndex("by_workspace", (query) =>
				query.eq("workspaceId", workspace._id),
			)
			.collect();

		for (const board of boards) {
			const cards = await ctx.db
				.query("cards")
				.withIndex("by_board", (query) => query.eq("boardId", board._id))
				.collect();

			for (const card of cards) {
				if (!card.tagIds.includes(tag._id)) {
					continue;
				}
				const nextTagIds = card.tagIds.filter((tagId) => tagId !== tag._id);
				await ctx.db.patch(card._id, {
					tagIds: nextTagIds,
					updatedAt: Date.now(),
				});
				await emitCardEvent(ctx, workspace._id, {
					name: "card.updated",
					actorId: userId,
					boardId: card.boardId,
					cardId: card._id,
					statusKey: card.statusKey,
					cardTypeId: card.typeKey,
					tagIds: nextTagIds,
					previousTagIds: card.tagIds,
					activityEntries: [{ kind: "tag" }],
					workspaceId: workspace._id,
				});
			}
		}

		const bindings = await ctx.db
			.query("behaviorBindings")
			.withIndex("by_workspace_target", (query) =>
				query
					.eq("workspaceId", workspace._id)
					.eq("targetType", "tag")
					.eq("targetId", tag._id),
			)
			.collect();
		for (const binding of bindings) {
			await ctx.db.delete(binding._id);
		}

		await ctx.db.delete(tag._id);

		return { tagId: tag._id };
	},
});
