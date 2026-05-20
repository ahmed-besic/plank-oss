import { createPermissionedServerServices } from "@plank/plugin-runtime";
import type {
	PlankServerPlugin,
	PlatformServerServices,
} from "@plank/plugin-runtime";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

function toCardSummary(card: Doc<"cards">) {
	return {
		id: String(card._id),
		workspaceId: String(card.workspaceId),
		boardId: String(card.boardId),
		typeKey: String(card.typeKey),
		statusKey: String(card.statusKey),
		title: String(card.meta.title),
		properties: { ...card.fields.core, ...card.fields.custom },
		updatedAt: Number(card.updatedAt),
	};
}

export function createPluginServerApi({
	ctx,
	plugin,
	workspaceId,
}: {
	ctx: MutationCtx;
	plugin: PlankServerPlugin;
	workspaceId: Id<"workspaces">;
}): PlatformServerServices {
	const rawServices: PlatformServerServices = {
		cards: {
			get: async (cardId) => {
				const card = await ctx.db.get(cardId as Id<"cards">);
				if (!card) {
					return null;
				}
				if (card.workspaceId !== workspaceId) {
					throw new Error("Plugin card read is outside the event workspace");
				}
				return toCardSummary(card);
			},
		},
	};

	return createPermissionedServerServices({
		plugin,
		services: rawServices,
	});
}
