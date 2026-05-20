import type { PluginRuntimeDiagnostic } from "@plank/plugin-runtime";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

export type PersistedPluginDiagnosticKind =
	| PluginRuntimeDiagnostic["kind"]
	| "extension-status-changed";

export interface PersistPluginDiagnosticInput {
	workspaceId: Id<"workspaces">;
	pluginId?: string;
	kind: PersistedPluginDiagnosticKind;
	severity?: "info" | "warning" | "error";
	message: string;
	permission?: string;
	handlerId?: string;
	eventId?: string;
	workflowEventId?: Id<"workflowEvents">;
	boardId?: Id<"boards">;
	cardId?: Id<"cards">;
	actorId?: string;
	previousStatus?: "enabled" | "disabled";
	nextStatus?: "enabled" | "disabled";
	createdAt?: number;
}

function severityForDiagnostic(kind: PersistedPluginDiagnosticKind) {
	switch (kind) {
		case "handler-failed":
		case "permission-denied":
		case "invalid-trust-level":
			return "error";
		default:
			return "info";
	}
}

export async function persistPluginDiagnostic(
	ctx: MutationCtx,
	input: PersistPluginDiagnosticInput,
) {
	if (input.kind === "handler-skipped") {
		return null;
	}

	return await ctx.db.insert("pluginDiagnostics", {
		workspaceId: input.workspaceId,
		pluginId: input.pluginId,
		kind: input.kind,
		severity: input.severity ?? severityForDiagnostic(input.kind),
		message: input.message,
		permission: input.permission,
		handlerId: input.handlerId,
		eventId: input.eventId,
		workflowEventId: input.workflowEventId,
		boardId: input.boardId,
		cardId: input.cardId,
		actorId: input.actorId,
		previousStatus: input.previousStatus,
		nextStatus: input.nextStatus,
		createdAt: input.createdAt ?? Date.now(),
	});
}

export async function persistRuntimeDiagnostics({
	ctx,
	diagnostics,
	event,
	workspaceId,
}: {
	ctx: MutationCtx;
	diagnostics: PluginRuntimeDiagnostic[];
	event: {
		actorId: string;
		boardId: string;
		cardId: string;
		eventId: string;
		workflowEventId?: string;
		timestamp: number;
	};
	workspaceId: Id<"workspaces">;
}) {
	for (const diagnostic of diagnostics) {
		await persistPluginDiagnostic(ctx, {
			workspaceId,
			pluginId: diagnostic.pluginId,
			kind: diagnostic.kind,
			message: diagnostic.message,
			permission: diagnostic.permission,
			handlerId: diagnostic.handlerId,
			eventId: event.eventId,
			workflowEventId: event.workflowEventId as Id<"workflowEvents"> | undefined,
			boardId: event.boardId as Id<"boards">,
			cardId: event.cardId as Id<"cards">,
			actorId: event.actorId,
			createdAt: event.timestamp,
		});
	}
}
