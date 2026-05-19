import { describe, expect, it } from "vitest";
import {
	createDefaultBoardColumns,
	createDefaultLifecycleStatuses,
	createKeyAfter,
} from "@plank/domain";
import {
	archivePack,
	bindPack,
	compilePack,
	saveSimplePack,
	setBindingEnabled,
	unbindPack,
	updatePackSource,
} from "./behaviors";
import { moveCard } from "./cards";
import { MockConvexDb, createMockCtx } from "./test_helpers";

function createBaseDb() {
	const statuses = createDefaultLifecycleStatuses();
	const columns = createDefaultBoardColumns(statuses);

	return new MockConvexDb({
		boardTypes: [
			{
				_id: "boardType_1",
				workspaceId: "workspace_1",
				key: "task-tracking",
				name: "Task tracking",
				lifecycleConfig: {
					statuses,
					initialStatusKey: statuses[0]?.key ?? "backlog",
				},
				defaultViewIds: ["core-kanban:board"],
				defaultCardTypeKey: "core.todo",
				createdAt: 1,
				updatedAt: 1,
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
				columns: [
					{ ...columns[0], id: "column-backlog" },
					{ ...columns[1], id: "column-in-progress" },
					{ ...columns[2], id: "column-done" },
				],
			},
		],
		cardTypeRegistry: [
			{
				_id: "cardTypeRegistry_1",
				workspaceId: "workspace_1",
				pluginId: "core-cards",
				typeKey: "core.todo",
				schemaVersion: 1,
				manifest: {
					pluginId: "core-cards",
					typeKey: "core.todo",
					schemaVersion: 1,
					fields: {
						core: [
							{
								key: "focus",
								label: "Focus",
								valueType: "string",
							},
							{
								key: "dueDate",
								label: "Due date",
								valueType: "timestamp",
							},
						],
					},
					bodyPolicy: { allowEmpty: true },
					metaPolicy: { titleRequired: true },
					automationExposedFields: ["focus", "dueDate"],
					queryIndexHints: [],
					renderer: {
						tileRendererId: "todo.tile.v1",
						detailRendererId: "todo.detail.v1",
					},
				},
				status: "active",
				createdAt: 1,
				updatedAt: 1,
			},
		],
		cards: [
			{
				_id: "card_1",
				workspaceId: "workspace_1",
				boardId: "board_1",
				typeKey: "core.todo",
				typeSchemaVersion: 1,
				meta: { title: "Implement engine" },
				statusKey: "backlog",
				viewState: {
					kanban: {
						columnId: "column-backlog",
					},
				},
				orderKey: createKeyAfter(),
				fields: { core: {}, custom: {} },
				relations: [],
				tagIds: [],
				body: {
					type: "blocknote",
					content: [{ id: "paragraph-1", type: "paragraph" }],
				},
				createdAt: 1,
				updatedAt: 1,
				createdBy: "user_1",
			},
		],
		tagDefinitions: [
			{
				_id: "tag_1",
				workspaceId: "workspace_1",
				key: "priority",
				name: "Priority",
				createdAt: 1,
				updatedAt: 1,
			},
		],
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
				email: "teammate@example.com",
				role: "member",
				createdAt: 1,
			},
		],
	});
}

describe("behavior engine", () => {
	it("rejects invalid actions for card.deleted at compile time", async () => {
		const db = createBaseDb();
		db.rows("behaviorPacks").push({
			_id: "behaviorPack_1",
			workspaceId: "workspace_1",
			key: "cleanup",
			name: "Cleanup",
			allowedTargetTypes: ["workspace"],
			source: ["rule Cleanup", "when card deleted", "add tag priority"].join(
				"\n",
			),
			compileDiagnostics: [],
			status: "draft",
			version: 1,
			createdBy: "user_1",
			createdAt: 1,
			updatedAt: 1,
		});
		const ctx = createMockCtx({ db });

		const result = await (
			compilePack as unknown as (ctx: unknown, args: unknown) => Promise<any>
		)(ctx, {
			workspaceSlug: "acme",
			packId: "behaviorPack_1",
		});

		expect(result.hasErrors).toBe(true);
		expect(result.diagnostics).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					message: expect.stringContaining("only supports `notify` and `stop`"),
				}),
			]),
		);
	});

	it("archives packs by disabling their bindings", async () => {
		const db = createBaseDb();
		db.rows("behaviorPacks").push({
			_id: "behaviorPack_1",
			workspaceId: "workspace_1",
			key: "cleanup",
			name: "Cleanup",
			allowedTargetTypes: ["workspace"],
			source: "",
			compileDiagnostics: [],
			status: "active",
			version: 1,
			createdBy: "user_1",
			createdAt: 1,
			updatedAt: 1,
		});
		db.rows("behaviorBindings").push({
			_id: "behaviorBinding_1",
			workspaceId: "workspace_1",
			targetType: "workspace",
			targetId: "workspace_1",
			behaviorPackId: "behaviorPack_1",
			priority: 100,
			enabled: true,
			createdBy: "user_1",
			createdAt: 1,
			updatedAt: 1,
		});
		const ctx = createMockCtx({ db });

		await (
			archivePack as unknown as (ctx: unknown, args: unknown) => Promise<any>
		)(ctx, {
			workspaceSlug: "acme",
			packId: "behaviorPack_1",
		});

		expect(db.rows("behaviorPacks")[0]).toMatchObject({ status: "archived" });
		expect(db.rows("behaviorBindings")[0]).toMatchObject({ enabled: false });
	});

	it("executes active bindings on card events and logs automation runs", async () => {
		const db = createBaseDb();
		db.rows("behaviorPacks").push({
			_id: "behaviorPack_1",
			workspaceId: "workspace_1",
			key: "tag-done-cards",
			name: "Tag done cards",
			allowedTargetTypes: ["workspace"],
			source: "rule Tag Done\nwhen card moved\nadd tag priority",
			compiledProgram: {
				version: 1,
				rules: [
					{
						id: "rule_1",
						name: "Tag Done",
						trigger: {
							eventName: "card.moved",
						},
						branches: [
							{
								actions: [{ type: "add_tag", tagKey: "priority" }],
							},
						],
					},
				],
			},
			compileDiagnostics: [],
			status: "active",
			version: 1,
			createdBy: "user_1",
			createdAt: 1,
			updatedAt: 1,
			lastCompiledAt: 1,
			lastActivatedAt: 1,
		});
		db.rows("behaviorBindings").push({
			_id: "behaviorBinding_1",
			workspaceId: "workspace_1",
			targetType: "workspace",
			targetId: "workspace_1",
			behaviorPackId: "behaviorPack_1",
			priority: 100,
			enabled: true,
			createdBy: "user_1",
			createdAt: 1,
			updatedAt: 1,
		});
		const ctx = createMockCtx({ db });

		await (
			moveCard as unknown as (ctx: unknown, args: unknown) => Promise<any>
		)(ctx, {
			workspaceSlug: "acme",
			boardId: "board_1",
			cardId: "card_1",
			statusKey: "done",
			columnId: "column-done",
		});

		expect(db.rows("cards")[0]).toMatchObject({
			statusKey: "done",
			tagIds: ["tag_1"],
		});
		expect(db.rows("automationRuns")).toHaveLength(3);
		expect(db.rows("automationRuns")[0]).toMatchObject({
			eventName: "card.moved",
			status: "ok",
			matchedRuleIds: ["rule_1"],
			actionsExecuted: 1,
			trace: [
				expect.objectContaining({
					ruleId: "rule_1",
					status: "ok",
				}),
			],
		});
		expect(db.rows("workflowEvents")).toHaveLength(3);
		expect(db.rows("workflowEvents").map((event) => event.eventName)).toEqual([
			"card.moved",
			"card.updated",
			"tag.applied",
		]);
		expect(db.rows("automationRuns")[0]?.workflowEventId).toBe(
			db.rows("workflowEvents")[0]?._id,
		);
		expect(db.rows("automationRuns").map((run) => run.eventName)).toEqual([
			"card.moved",
			"card.updated",
			"tag.applied",
		]);
		expect(db.rows("cardChangeEvents").map((event) => event.kind)).toEqual([
			"move",
			"tag",
		]);
		expect(db.rows("workflowEvents")[1]).toMatchObject({
			origin: "automation",
			parentEventId: db.rows("workflowEvents")[0]?.eventId,
			rootEventId: db.rows("workflowEvents")[0]?.eventId,
			eventName: "card.updated",
		});
	});

	it("does not execute card moved bindings on same-status reorders", async () => {
		const db = createBaseDb();
		db.rows("behaviorPacks").push({
			_id: "behaviorPack_1",
			workspaceId: "workspace_1",
			key: "tag-moved-cards",
			name: "Tag moved cards",
			allowedTargetTypes: ["workspace"],
			source: "rule Tag Moved\nwhen card moved\nadd tag priority",
			compiledProgram: {
				version: 1,
				rules: [
					{
						id: "rule_1",
						name: "Tag Moved",
						trigger: {
							eventName: "card.moved",
						},
						branches: [
							{
								actions: [{ type: "add_tag", tagKey: "priority" }],
							},
						],
					},
				],
			},
			compileDiagnostics: [],
			status: "active",
			version: 1,
			createdBy: "user_1",
			createdAt: 1,
			updatedAt: 1,
			lastCompiledAt: 1,
			lastActivatedAt: 1,
		});
		db.rows("behaviorBindings").push({
			_id: "behaviorBinding_1",
			workspaceId: "workspace_1",
			targetType: "workspace",
			targetId: "workspace_1",
			behaviorPackId: "behaviorPack_1",
			priority: 100,
			enabled: true,
			createdBy: "user_1",
			createdAt: 1,
			updatedAt: 1,
		});
		const ctx = createMockCtx({ db });

		await (
			moveCard as unknown as (ctx: unknown, args: unknown) => Promise<any>
		)(ctx, {
			workspaceSlug: "acme",
			boardId: "board_1",
			cardId: "card_1",
			statusKey: "backlog",
			columnId: "backlog",
			previousOrderKey: "a0",
			nextOrderKey: "a2",
		});

		expect(db.rows("cards")[0]).toMatchObject({
			statusKey: "backlog",
			tagIds: [],
		});
		expect(db.rows("workflowEvents")).toHaveLength(0);
		expect(db.rows("automationRuns")).toHaveLength(0);
		expect(db.rows("cardChangeEvents")).toHaveLength(0);
	});

	it("stamps the current date from a card moved behavior", async () => {
		const db = createBaseDb();
		db.rows("behaviorPacks").push({
			_id: "behaviorPack_1",
			workspaceId: "workspace_1",
			key: "stamp-moved-cards",
			name: "Stamp moved cards",
			allowedTargetTypes: ["workspace"],
			source: "rule Stamp Moved\nwhen card moved\nset dueDate to current date",
			compiledProgram: {
				version: 1,
				rules: [
					{
						id: "rule_1",
						name: "Stamp Moved",
						trigger: {
							eventName: "card.moved",
						},
						branches: [
							{
								actions: [{ type: "set_current_date", propertyKey: "dueDate" }],
							},
						],
					},
				],
			},
			compileDiagnostics: [],
			status: "active",
			version: 1,
			createdBy: "user_1",
			createdAt: 1,
			updatedAt: 1,
			lastCompiledAt: 1,
			lastActivatedAt: 1,
		});
		db.rows("behaviorBindings").push({
			_id: "behaviorBinding_1",
			workspaceId: "workspace_1",
			targetType: "workspace",
			targetId: "workspace_1",
			behaviorPackId: "behaviorPack_1",
			priority: 100,
			enabled: true,
			createdBy: "user_1",
			createdAt: 1,
			updatedAt: 1,
		});
		const ctx = createMockCtx({ db });

		await (
			moveCard as unknown as (ctx: unknown, args: unknown) => Promise<any>
		)(ctx, {
			workspaceSlug: "acme",
			boardId: "board_1",
			cardId: "card_1",
			statusKey: "done",
			columnId: "done",
		});

		expect(db.rows("cards")[0]).toMatchObject({
			fields: {
				core: {
					dueDate: expect.any(Number),
				},
			},
		});
		expect(db.rows("workflowEvents").map((event) => event.eventName)).toEqual([
			"card.moved",
			"card.updated",
			"property.changed",
		]);
		expect(db.rows("automationRuns")[0]).toMatchObject({
			eventName: "card.moved",
			status: "ok",
			actionsExecuted: 1,
			trace: [
				expect.objectContaining({
					action: "set dueDate to current date",
					status: "ok",
				}),
			],
		});
	});

	it("delivers notify actions to a single recipient property and excludes the actor", async () => {
		const db = createBaseDb();
		db.rows("cards")[0] = {
			...db.rows("cards")[0],
			fields: {
				core: {
					focus: "user_2",
				},
				custom: {},
			},
		};
		db.rows("behaviorPacks").push({
			_id: "behaviorPack_1",
			workspaceId: "workspace_1",
			key: "notify-focus",
			name: "Notify focus owner",
			allowedTargetTypes: ["workspace"],
			source: "rule Notify Focus\nwhen card moved\nnotify focus: Card entered done",
			compiledProgram: {
				version: 1,
				rules: [
					{
						id: "rule_1",
						name: "Notify Focus",
						trigger: {
							eventName: "card.moved",
						},
						branches: [
							{
								actions: [
									{
										type: "notify",
										recipientPropertyKey: "focus",
										message: "Card entered done",
									},
								],
							},
						],
					},
				],
			},
			compileDiagnostics: [],
			status: "active",
			version: 1,
			createdBy: "user_1",
			createdAt: 1,
			updatedAt: 1,
			lastCompiledAt: 1,
			lastActivatedAt: 1,
		});
		db.rows("behaviorBindings").push({
			_id: "behaviorBinding_1",
			workspaceId: "workspace_1",
			targetType: "workspace",
			targetId: "workspace_1",
			behaviorPackId: "behaviorPack_1",
			priority: 100,
			enabled: true,
			createdBy: "user_1",
			createdAt: 1,
			updatedAt: 1,
		});
		const ctx = createMockCtx({ db });

		await (
			moveCard as unknown as (ctx: unknown, args: unknown) => Promise<any>
		)(ctx, {
			workspaceSlug: "acme",
			boardId: "board_1",
			cardId: "card_1",
			statusKey: "done",
			columnId: "column-done",
		});

		expect(db.rows("notifications")).toHaveLength(1);
		expect(db.rows("notifications")[0]).toMatchObject({
			workspaceId: "workspace_1",
			recipientUserId: "user_2",
			actorId: "user_1",
			boardId: "board_1",
			cardId: "card_1",
			message: "Card entered done",
			workflowEventId: db.rows("workflowEvents")[0]?._id,
		});
		expect(db.rows("automationRuns")[0]?.trace).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					action: "notify focus: Card entered done",
					status: "ok",
				}),
			]),
		);
	});

	it("skips notify when the actor matches the recipient property", async () => {
		const db = createBaseDb();
		db.rows("cards")[0] = {
			...db.rows("cards")[0],
			fields: {
				core: {
					focus: "user_1",
				},
				custom: {},
			},
		};
		db.rows("behaviorPacks").push({
			_id: "behaviorPack_1",
			workspaceId: "workspace_1",
			key: "notify-focus",
			name: "Notify focus owner",
			allowedTargetTypes: ["workspace"],
			source: "rule Notify Focus\nwhen card moved\nnotify focus: Card entered done",
			compiledProgram: {
				version: 1,
				rules: [
					{
						id: "rule_1",
						name: "Notify Focus",
						trigger: {
							eventName: "card.moved",
						},
						branches: [
							{
								actions: [
									{
										type: "notify",
										recipientPropertyKey: "focus",
										message: "Card entered done",
									},
								],
							},
						],
					},
				],
			},
			compileDiagnostics: [],
			status: "active",
			version: 1,
			createdBy: "user_1",
			createdAt: 1,
			updatedAt: 1,
			lastCompiledAt: 1,
			lastActivatedAt: 1,
		});
		db.rows("behaviorBindings").push({
			_id: "behaviorBinding_1",
			workspaceId: "workspace_1",
			targetType: "workspace",
			targetId: "workspace_1",
			behaviorPackId: "behaviorPack_1",
			priority: 100,
			enabled: true,
			createdBy: "user_1",
			createdAt: 1,
			updatedAt: 1,
		});
		const ctx = createMockCtx({ db });

		await (
			moveCard as unknown as (ctx: unknown, args: unknown) => Promise<any>
		)(ctx, {
			workspaceSlug: "acme",
			boardId: "board_1",
			cardId: "card_1",
			statusKey: "done",
			columnId: "column-done",
		});

		expect(db.rows("notifications")).toHaveLength(0);
		expect(db.rows("automationRuns")[0]?.trace).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					action: "notify focus: Card entered done",
					status: "skipped",
					detail: "actor is the recipient",
				}),
			]),
		);
	});

	it("creates and binds a simple pack through the structured builder", async () => {
		const db = createBaseDb();
		const ctx = createMockCtx({ db });

		const result = await (
			saveSimplePack as unknown as (ctx: unknown, args: unknown) => Promise<any>
		)(ctx, {
			workspaceSlug: "acme",
			config: {
				name: "Move done cards",
				trigger: {
					eventName: "card.created",
				},
				action: {
					type: "move_status",
					statusKey: "done",
				},
				targetType: "workspace",
				targetId: "workspace_1",
				priority: 75,
				enabled: true,
			},
		});

		expect(result.hasErrors).toBe(false);
		expect(db.rows("behaviorPacks")).toHaveLength(1);
		expect(db.rows("behaviorPacks")[0]).toMatchObject({
			name: "Move done cards",
			status: "active",
			authoringMode: "simple",
			simpleRuleConfig: {
				name: "Move done cards",
				trigger: {
					eventName: "card.created",
				},
				action: {
					type: "move_status",
					statusKey: "done",
				},
				targetType: "workspace",
				targetId: "workspace_1",
				priority: 75,
				enabled: true,
			},
			source: "rule Move done cards\nwhen card created\nmove card to status done",
		});
		expect(db.rows("behaviorBindings")).toHaveLength(1);
		expect(db.rows("behaviorBindings")[0]).toMatchObject({
			targetType: "workspace",
			targetId: "workspace_1",
			priority: 75,
			enabled: true,
		});
	});

	it("supports direct teammate notifications in the structured builder", async () => {
		const db = createBaseDb();
		const ctx = createMockCtx({ db });

		const result = await (
			saveSimplePack as unknown as (ctx: unknown, args: unknown) => Promise<any>
		)(ctx, {
			workspaceSlug: "acme",
			config: {
				name: "Notify teammate",
				trigger: {
					eventName: "card.created",
				},
				action: {
					type: "notify",
					recipientUserId: "user_2",
					message: "Card created",
				},
				targetType: "workspace",
				targetId: "workspace_1",
				priority: 50,
				enabled: true,
			},
		});

		expect(result.hasErrors).toBe(false);
		expect(db.rows("behaviorPacks")[0]).toMatchObject({
			source: "rule Notify teammate\nwhen card created\nnotify user user_2: Card created",
			simpleRuleConfig: {
				action: {
					type: "notify",
					recipientUserId: "user_2",
					message: "Card created",
				},
			},
		});
	});

	it("creates a simple current-date pack through the structured builder", async () => {
		const db = createBaseDb();
		const ctx = createMockCtx({ db });

		const result = await (
			saveSimplePack as unknown as (ctx: unknown, args: unknown) => Promise<any>
		)(ctx, {
			workspaceSlug: "acme",
			config: {
				name: "Stamp moved cards",
				trigger: {
					eventName: "card.moved",
				},
				action: {
					type: "set_current_date",
					propertyKey: "dueDate",
				},
				targetType: "workspace",
				targetId: "workspace_1",
				priority: 75,
				enabled: true,
			},
		});

		expect(result.hasErrors).toBe(false);
		expect(db.rows("behaviorPacks")[0]).toMatchObject({
			name: "Stamp moved cards",
			status: "active",
			authoringMode: "simple",
			simpleRuleConfig: {
				action: {
					type: "set_current_date",
					propertyKey: "dueDate",
				},
			},
			source: "rule Stamp moved cards\nwhen card moved\nset dueDate to current date",
		});
	});

	it("converts simple packs to dsl mode when raw source is edited", async () => {
		const db = createBaseDb();
		db.rows("behaviorPacks").push({
			_id: "behaviorPack_1",
			workspaceId: "workspace_1",
			key: "move-done-cards",
			name: "Move done cards",
			allowedTargetTypes: ["workspace"],
			source: "rule Move done cards\nwhen card created\nmove card to status done",
			compiledProgram: {
				version: 1,
				rules: [
					{
						id: "rule_1",
						name: "Move done cards",
						trigger: {
							eventName: "card.created",
						},
						branches: [
							{
								actions: [{ type: "move_status", statusKey: "done" }],
							},
						],
					},
				],
			},
			compileDiagnostics: [],
			status: "active",
			authoringMode: "simple",
			simpleRuleConfig: {
				name: "Move done cards",
				trigger: {
					eventName: "card.created",
				},
				action: {
					type: "move_status",
					statusKey: "done",
				},
				targetType: "workspace",
				targetId: "workspace_1",
				priority: 100,
				enabled: true,
			},
			version: 1,
			failFast: false,
			createdBy: "user_1",
			createdAt: 1,
			updatedAt: 1,
			lastCompiledAt: 1,
			lastActivatedAt: 1,
		});
		const ctx = createMockCtx({ db });

		await (
			updatePackSource as unknown as (ctx: unknown, args: unknown) => Promise<any>
		)(ctx, {
			workspaceSlug: "acme",
			packId: "behaviorPack_1",
			source: "rule Move done cards\nwhen card moved\nadd tag priority",
		});

		expect(db.rows("behaviorPacks")[0]).toMatchObject({
			authoringMode: "dsl",
			simpleRuleConfig: undefined,
			status: "draft",
			source: "rule Move done cards\nwhen card moved\nadd tag priority",
		});
	});

	it("rejects advanced binding operations for simple packs", async () => {
		const db = createBaseDb();
		db.rows("behaviorPacks").push({
			_id: "behaviorPack_1",
			workspaceId: "workspace_1",
			key: "move-done-cards",
			name: "Move done cards",
			allowedTargetTypes: ["workspace"],
			source: "rule Move done cards\nwhen card created\nmove card to status done",
			compiledProgram: {
				version: 1,
				rules: [
					{
						id: "rule_1",
						name: "Move done cards",
						trigger: {
							eventName: "card.created",
						},
						branches: [
							{
								actions: [{ type: "move_status", statusKey: "done" }],
							},
						],
					},
				],
			},
			compileDiagnostics: [],
			status: "active",
			authoringMode: "simple",
			simpleRuleConfig: {
				name: "Move done cards",
				trigger: {
					eventName: "card.created",
				},
				action: {
					type: "move_status",
					statusKey: "done",
				},
				targetType: "workspace",
				targetId: "workspace_1",
				priority: 100,
				enabled: true,
			},
			version: 1,
			failFast: false,
			createdBy: "user_1",
			createdAt: 1,
			updatedAt: 1,
			lastCompiledAt: 1,
			lastActivatedAt: 1,
		});
		db.rows("behaviorBindings").push({
			_id: "behaviorBinding_1",
			workspaceId: "workspace_1",
			targetType: "workspace",
			targetId: "workspace_1",
			behaviorPackId: "behaviorPack_1",
			priority: 100,
			enabled: true,
			createdBy: "user_1",
			createdAt: 1,
			updatedAt: 1,
		});
		const ctx = createMockCtx({ db });

		await expect(
			(bindPack as unknown as (ctx: unknown, args: unknown) => Promise<any>)(
				ctx,
				{
					workspaceSlug: "acme",
					packId: "behaviorPack_1",
					targetType: "board",
					targetId: "board_1",
					priority: 25,
				},
			),
		).rejects.toThrow(/Simple packs manage bindings in simple mode/);

		await expect(
			(setBindingEnabled as unknown as (ctx: unknown, args: unknown) => Promise<any>)(
				ctx,
				{
					workspaceSlug: "acme",
					bindingId: "behaviorBinding_1",
					enabled: false,
				},
			),
		).rejects.toThrow(/Simple packs manage bindings in simple mode/);

		await expect(
			(unbindPack as unknown as (ctx: unknown, args: unknown) => Promise<any>)(
				ctx,
				{
					workspaceSlug: "acme",
					bindingId: "behaviorBinding_1",
				},
			),
		).rejects.toThrow(/Simple packs manage bindings in simple mode/);
	});
});
