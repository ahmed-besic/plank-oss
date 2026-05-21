import { describe, expect, it } from "vitest";
import {
	cleanupPluginArtifacts,
	previewPluginArtifactCleanup,
} from "./maintenance";
import { MockConvexDb, createMockCtx } from "./test_helpers";

function createMaintenanceDb() {
	return new MockConvexDb({
		workspaces: [
			{
				_id: "workspace_1",
				name: "Acme",
				slug: "acme",
				ownerId: "user_1",
				createdAt: 1,
				updatedAt: 1,
			},
		],
		workspaceMembers: [
			{
				_id: "member_1",
				workspaceId: "workspace_1",
				userId: "user_1",
				email: "owner@example.com",
				role: "owner",
				createdAt: 1,
			},
			{
				_id: "member_2",
				workspaceId: "workspace_1",
				userId: "user_2",
				email: "member@example.com",
				role: "member",
				createdAt: 1,
			},
		],
		boards: [
			{
				_id: "board_1",
				workspaceId: "workspace_1",
				boardTypeId: "boardType_1",
				name: "Team board",
				slug: "team-board",
				createdBy: "user_1",
				createdAt: 1,
				updatedAt: 1,
			},
		],
		workspaceExtensions: [
			{
				_id: "workspaceExtension_orphan",
				workspaceId: "workspace_1",
				pluginId: "boring-plugin",
				status: "enabled",
				installedBy: "user_1",
				installedAt: 1,
				updatedAt: 1,
			},
			{
				_id: "workspaceExtension_current",
				workspaceId: "workspace_1",
				pluginId: "core-kanban",
				status: "enabled",
				installedBy: "user_1",
				installedAt: 1,
				updatedAt: 1,
			},
		],
		pluginDiagnostics: [
			{
				_id: "pluginDiagnostic_orphan",
				workspaceId: "workspace_1",
				pluginId: "boring-plugin",
				kind: "handler-failed",
				severity: "error",
				message: "Old plugin failed",
				createdAt: 1,
			},
			{
				_id: "pluginDiagnostic_current",
				workspaceId: "workspace_1",
				pluginId: "core-kanban",
				kind: "handler-failed",
				severity: "error",
				message: "Current plugin failed",
				createdAt: 2,
			},
		],
		boardViews: [
			{
				_id: "boardView_orphan_empty",
				workspaceId: "workspace_1",
				boardId: "board_1",
				viewId: "boring-plugin:board",
				instanceId: "boring-empty",
				instanceMode: "private",
				pluginId: "boring-plugin",
				kind: "board",
				label: "Boring",
				orderKey: "a",
				isDefault: false,
			},
			{
				_id: "boardView_orphan_scoped",
				workspaceId: "workspace_1",
				boardId: "board_1",
				viewId: "boring-plugin:scoped",
				instanceId: "boring-scoped",
				instanceMode: "private",
				featureInstance: {
					pluginPackageId: "boring-plugin",
					featureId: "boring-plugin:scoped",
					instanceId: "boring-scoped",
				},
				kind: "board",
				label: "Scoped Boring",
				orderKey: "b",
				isDefault: false,
			},
			{
				_id: "boardView_current",
				workspaceId: "workspace_1",
				boardId: "board_1",
				viewId: "core-kanban:board",
				instanceId: "core-kanban:board",
				instanceMode: "shared",
				pluginId: "core-kanban",
				kind: "board",
				label: "Board",
				orderKey: "c",
				isDefault: true,
			},
		],
		cardTypeRegistry: [
			{
				_id: "cardTypeRegistry_orphan_empty",
				workspaceId: "workspace_1",
				pluginId: "boring-plugin",
				typeKey: "boring.empty",
				schemaVersion: 1,
				manifest: {
					pluginId: "boring-plugin",
					typeKey: "boring.empty",
					schemaVersion: 1,
					fields: { core: [] },
					bodyPolicy: { allowEmpty: true },
					metaPolicy: { titleRequired: true },
					automationExposedFields: [],
					queryIndexHints: [],
				},
				status: "active",
				createdAt: 1,
				updatedAt: 1,
			},
			{
				_id: "cardTypeRegistry_orphan_used",
				workspaceId: "workspace_1",
				pluginId: "boring-plugin",
				typeKey: "boring.used",
				schemaVersion: 1,
				manifest: {
					pluginId: "boring-plugin",
					typeKey: "boring.used",
					schemaVersion: 1,
					fields: { core: [] },
					bodyPolicy: { allowEmpty: true },
					metaPolicy: { titleRequired: true },
					automationExposedFields: [],
					queryIndexHints: [],
				},
				status: "active",
				createdAt: 1,
				updatedAt: 1,
			},
			{
				_id: "cardTypeRegistry_current",
				workspaceId: "workspace_1",
				pluginId: "task-board",
				typeKey: "core.todo",
				schemaVersion: 1,
				manifest: {
					pluginId: "task-board",
					typeKey: "core.todo",
					schemaVersion: 1,
					fields: { core: [] },
					bodyPolicy: { allowEmpty: true },
					metaPolicy: { titleRequired: true },
					automationExposedFields: [],
					queryIndexHints: [],
				},
				status: "active",
				createdAt: 1,
				updatedAt: 1,
			},
		],
		cards: [
			{
				_id: "card_scoped",
				workspaceId: "workspace_1",
				boardId: "board_1",
				scopeId: "boring-scoped",
				typeKey: "core.todo",
				typeSchemaVersion: 1,
				meta: { title: "Scoped content" },
				statusKey: "backlog",
				orderKey: "a",
				fields: { core: {}, custom: {} },
				relations: [],
				tagIds: [],
				body: [],
				createdAt: 1,
				updatedAt: 1,
				createdBy: "user_1",
			},
			{
				_id: "card_orphan_type",
				workspaceId: "workspace_1",
				boardId: "board_1",
				typeKey: "boring.used",
				typeSchemaVersion: 1,
				meta: { title: "Typed content" },
				statusKey: "backlog",
				orderKey: "b",
				fields: { core: {}, custom: {} },
				relations: [],
				tagIds: [],
				body: [],
				createdAt: 1,
				updatedAt: 1,
				createdBy: "user_1",
			},
		],
		behaviorPacks: [
			{
				_id: "behaviorPack_1",
				workspaceId: "workspace_1",
				key: "boring-automation",
				name: "Boring automation",
				allowedTargetTypes: ["workspace"],
				source: "",
				compileDiagnostics: [],
				status: "draft",
				version: 1,
				createdBy: "user_1",
				createdAt: 1,
				updatedAt: 1,
			},
		],
		behaviorBindings: [
			{
				_id: "behaviorBinding_1",
				workspaceId: "workspace_1",
				targetType: "workspace",
				targetId: "workspace_1",
				behaviorPackId: "behaviorPack_1",
				priority: 1,
				enabled: true,
				createdBy: "user_1",
				createdAt: 1,
				updatedAt: 1,
			},
		],
		automationRuns: [
			{
				_id: "automationRun_1",
				workspaceId: "workspace_1",
				workflowEventId: "workflowEvent_1",
				eventId: "event_1",
				rootEventId: "event_1",
				eventName: "card.created",
				cardId: "card_scoped",
				boardId: "board_1",
				actorId: "user_1",
				origin: "user",
				eventRef: {
					boardId: "board_1",
					cardId: "card_scoped",
					actorId: "user_1",
				},
				depth: 0,
				status: "ok",
				matchedRuleIds: [],
				actionsPlanned: 0,
				actionsExecuted: 0,
				durationMs: 1,
				trace: [],
				createdAt: 1,
			},
		],
	});
}

describe("plugin artifact maintenance cleanup", () => {
	it("previews orphan plugin artifacts and reports content blockers", async () => {
		const db = createMaintenanceDb();
		const ctx = createMockCtx({ db });

		const preview = await (
			previewPluginArtifactCleanup as unknown as (
				ctx: unknown,
				args: unknown,
			) => Promise<any>
		)(ctx, { workspaceSlug: "acme" });

		expect(preview.orphanPluginIds).toEqual(["boring-plugin"]);
		expect(preview.counts).toMatchObject({
			workspaceExtensions: 1,
			pluginDiagnostics: 1,
			boardViews: 1,
			cardTypeRegistry: 1,
			behaviorPacks: 1,
			behaviorBindings: 1,
			automationRuns: 1,
		});
		expect(preview.blocked).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					table: "boardViews",
					id: "boardView_orphan_scoped",
					reason: "scoped_cards_exist",
				}),
				expect.objectContaining({
					table: "cardTypeRegistry",
					id: "cardTypeRegistry_orphan_used",
					reason: "cards_use_type_key",
				}),
			]),
		);
		expect(preview.deletable.boardViews).toEqual(["boardView_orphan_empty"]);
		expect(preview.deletable.cardTypeRegistry).toEqual([
			"cardTypeRegistry_orphan_empty",
		]);
	});

	it("deletes only preview-approved artifacts and preserves content", async () => {
		const db = createMaintenanceDb();
		const ctx = createMockCtx({ db });

		const result = await (
			cleanupPluginArtifacts as unknown as (
				ctx: unknown,
				args: unknown,
			) => Promise<any>
		)(ctx, { workspaceSlug: "acme" });

		expect(result.deleted).toMatchObject({
			workspaceExtensions: 1,
			pluginDiagnostics: 1,
			boardViews: 1,
			cardTypeRegistry: 1,
			behaviorPacks: 1,
			behaviorBindings: 1,
			automationRuns: 1,
		});
		expect(db.rows("workspaceExtensions").map((row) => row._id)).toEqual([
			"workspaceExtension_current",
		]);
		expect(db.rows("pluginDiagnostics").map((row) => row._id)).toEqual([
			"pluginDiagnostic_current",
		]);
		expect(db.rows("boardViews").map((row) => row._id).sort()).toEqual([
			"boardView_current",
			"boardView_orphan_scoped",
		]);
		expect(db.rows("cardTypeRegistry").map((row) => row._id).sort()).toEqual([
			"cardTypeRegistry_current",
			"cardTypeRegistry_orphan_used",
		]);
		expect(db.rows("cards").map((row) => row._id).sort()).toEqual([
			"card_orphan_type",
			"card_scoped",
		]);
		expect(db.rows("behaviorPacks")).toHaveLength(0);
		expect(db.rows("behaviorBindings")).toHaveLength(0);
		expect(db.rows("automationRuns")).toHaveLength(0);
	});

	it("requires the workspace owner", async () => {
		const db = createMaintenanceDb();
		const ctx = createMockCtx({ db, tokenIdentifier: "user_2" });

		await expect(
			(
				previewPluginArtifactCleanup as unknown as (
					ctx: unknown,
					args: unknown,
				) => Promise<any>
			)(ctx, { workspaceSlug: "acme" }),
		).rejects.toThrow("Only workspace owners can run maintenance cleanup");
	});
});
