import { describe, expect, it } from "vitest";
import {
	persistPluginDiagnostic,
	persistRuntimeDiagnostics,
} from "./pluginDiagnostics";
import { MockConvexDb, createMockCtx } from "../test_helpers";

describe("plugin diagnostic persistence", () => {
	it("persists runtime failures but skips routine disabled-plugin diagnostics", async () => {
		const db = new MockConvexDb();
		const ctx = createMockCtx({ db });

		await persistRuntimeDiagnostics({
			ctx: ctx as never,
			workspaceId: "workspace_1" as never,
			event: {
				actorId: "user_1",
				boardId: "board_1",
				cardId: "card_1",
				eventId: "event_1",
				timestamp: 10,
			},
			diagnostics: [
				{
					kind: "handler-skipped",
					pluginId: "disabled",
					message: "Plugin disabled is not enabled for this event",
				},
				{
					kind: "handler-failed",
					pluginId: "focus-tools",
					handlerId: "focus-tools:handler",
					message: "Plugin exploded",
				},
			],
		});

		expect(db.rows("pluginDiagnostics")).toEqual([
			expect.objectContaining({
				pluginId: "focus-tools",
				kind: "handler-failed",
				severity: "error",
				handlerId: "focus-tools:handler",
				message: "Plugin exploded",
			}),
		]);
	});

	it("persists admin extension audit events", async () => {
		const db = new MockConvexDb();
		const ctx = createMockCtx({ db });

		await persistPluginDiagnostic(ctx as never, {
			workspaceId: "workspace_1" as never,
			pluginId: "focus-tools",
			kind: "extension-status-changed",
			message: "Extension focus-tools enabled",
			actorId: "user_1",
			nextStatus: "enabled",
			createdAt: 20,
		});

		expect(db.rows("pluginDiagnostics")[0]).toMatchObject({
			pluginId: "focus-tools",
			kind: "extension-status-changed",
			severity: "info",
			actorId: "user_1",
			nextStatus: "enabled",
			createdAt: 20,
		});
	});
});
