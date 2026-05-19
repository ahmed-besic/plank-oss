import { describe, expect, it, vi } from "vitest";
import { definePlugin } from "@plank/plugin-sdk";
import {
	createPluginRegistry,
	dispatchCardEvent,
	getEnabledPluginIds,
	getEnabledPlugins,
} from "./index";

describe("plugin runtime", () => {
	it("rejects duplicate plugin ids", () => {
		const first = definePlugin(
			{
				id: "duplicate",
				name: "First",
				version: "1.0.0",
				hooks: [],
				capabilities: [],
			},
			() => {},
		);

		const second = definePlugin(
			{
				id: "duplicate",
				name: "Second",
				version: "1.0.0",
				hooks: [],
				capabilities: [],
			},
			() => {},
		);

		expect(() => createPluginRegistry([first, second])).toThrowError(
			/duplicate plugin id/i,
		);
	});

	it("rejects duplicate template ids", () => {
		const first = definePlugin(
			{
				id: "first",
				name: "First",
				version: "1.0.0",
				hooks: ["registerBoardTypeTemplate"],
				capabilities: [],
			},
			({ registerBoardTypeTemplate }) => {
				registerBoardTypeTemplate({
					id: "shared:template",
					name: "Shared",
					defaultLifecycleStatuses: [
						{ key: "todo", label: "To do", category: "todo", orderKey: "a0" },
					],
					defaultViewIds: ["core-kanban:board"],
					version: 1,
				});
			},
		);

		const duplicateTemplate = definePlugin(
			{
				id: "duplicate-template",
				name: "Duplicate template",
				version: "1.0.0",
				hooks: ["registerBoardTypeTemplate"],
				capabilities: [],
			},
			({ registerBoardTypeTemplate }) => {
				registerBoardTypeTemplate({
					id: "shared:template",
					name: "Shared again",
					defaultLifecycleStatuses: [
						{ key: "todo", label: "To do", category: "todo", orderKey: "a0" },
					],
					defaultViewIds: ["core-kanban:board"],
					version: 1,
				});
			},
		);

		expect(() => createPluginRegistry([first, duplicateTemplate])).toThrowError(
			/duplicate board type template id/i,
		);
	});

	it("rejects duplicate card type manifest keys", () => {
		const first = definePlugin(
			{
				id: "first",
				name: "First",
				version: "1.0.0",
				hooks: ["registerCardTypeManifest"],
				capabilities: [],
			},
			({ registerCardTypeManifest }) => {
				registerCardTypeManifest({
					pluginId: "first",
					typeKey: "shared:task",
					schemaVersion: 1,
					fields: { core: [] },
					bodyPolicy: { allowEmpty: true },
					metaPolicy: { titleRequired: true },
					automationExposedFields: [],
					queryIndexHints: [],
				});
			},
		);

		const second = definePlugin(
			{
				id: "second",
				name: "Second",
				version: "1.0.0",
				hooks: ["registerCardTypeManifest"],
				capabilities: [],
			},
			({ registerCardTypeManifest }) => {
				registerCardTypeManifest({
					pluginId: "second",
					typeKey: "shared:task",
					schemaVersion: 1,
					fields: { core: [] },
					bodyPolicy: { allowEmpty: true },
					metaPolicy: { titleRequired: true },
					automationExposedFields: [],
					queryIndexHints: [],
				});
			},
		);

		expect(() => createPluginRegistry([first, second])).toThrowError(
			/duplicate card type manifest key/i,
		);
	});

	it("filters dispatch to enabled plugins", async () => {
		const calls: string[] = [];
		const plugin = definePlugin<{ calls: string[] }>(
			{
				id: "focus-tools",
				name: "Focus tools",
				version: "1.0.0",
				hooks: ["registerCardChange"],
				capabilities: ["cards:read"],
			},
			({ registerCardChange }) => {
				registerCardChange({
					id: "track-card-create",
					event: "card.created",
					handle: ({ extra, event }) => {
						extra.calls.push(event.name);
					},
				});
			},
		);

		const registry = createPluginRegistry([plugin]);
		await dispatchCardEvent({
			registry,
			enabledPluginIds: ["focus-tools"],
			event: {
				name: "card.created",
				eventId: "event_1",
				actorId: "user_1",
				boardId: "board_1",
				cardId: "card_1",
				workspaceId: "workspace_1",
				timestamp: Date.now(),
			},
			extra: { calls },
		});

		expect(calls).toEqual(["card.created"]);
	});

	it("supports wildcard handlers", async () => {
		const calls: string[] = [];
		const plugin = definePlugin<{ calls: string[] }>(
			{
				id: "auditor",
				name: "Auditor",
				version: "1.0.0",
				hooks: ["registerCardChange"],
				capabilities: ["cards:read"],
			},
			({ registerCardChange }) => {
				registerCardChange({
					id: "track-all-events",
					event: "*",
					handle: ({ extra, event }) => {
						extra.calls.push(event.name);
					},
				});
			},
		);

		const registry = createPluginRegistry([plugin]);
		await dispatchCardEvent({
			registry,
			enabledPluginIds: ["auditor"],
			event: {
				name: "card.updated",
				eventId: "event_2",
				actorId: "user_1",
				boardId: "board_1",
				cardId: "card_1",
				workspaceId: "workspace_1",
				timestamp: Date.now(),
			},
			extra: { calls },
		});

		expect(calls).toEqual(["card.updated"]);
	});

	it("uses the fallback status when records omit a status", () => {
		expect(
			getEnabledPluginIds(
				[
					{ pluginId: "focus-tools", status: undefined },
					{ pluginId: "calendar-board", status: "disabled" },
				],
				"enabled",
			),
		).toEqual(["focus-tools"]);

		expect(
			getEnabledPluginIds([{ pluginId: "focus-tools", status: undefined }], "disabled"),
		).toEqual([]);
	});

	it("returns only enabled plugins from the registry", () => {
		const focus = definePlugin(
			{
				id: "focus-tools",
				name: "Focus tools",
				version: "1.0.0",
				hooks: [],
				capabilities: [],
			},
			() => {},
		);
		const calendar = definePlugin(
			{
				id: "calendar-board",
				name: "Calendar board",
				version: "1.0.0",
				hooks: [],
				capabilities: [],
			},
			() => {},
		);

		const registry = createPluginRegistry([focus, calendar]);
		expect(
			getEnabledPlugins(registry, [
				{ pluginId: "focus-tools", status: "enabled" },
				{ pluginId: "calendar-board", status: "disabled" },
			]).map((plugin) => plugin.manifest.id),
		).toEqual(["focus-tools"]);
	});

	it("does nothing when no plugins are enabled", async () => {
		const handler = vi.fn(async () => {});
		const plugin = definePlugin(
			{
				id: "focus-tools",
				name: "Focus tools",
				version: "1.0.0",
				hooks: ["registerCardChange"],
				capabilities: [],
			},
			({ registerCardChange }) => {
				registerCardChange({
					id: "noop",
					event: "*",
					handle: handler,
				});
			},
		);

		await dispatchCardEvent({
			registry: createPluginRegistry([plugin]),
			enabledPluginIds: [],
			event: {
				name: "card.created",
				eventId: "event_3",
				actorId: "user_1",
				boardId: "board_1",
				cardId: "card_1",
				workspaceId: "workspace_1",
				timestamp: Date.now(),
			},
			extra: {},
		});

		expect(handler).not.toHaveBeenCalled();
	});

	it("preserves handler order across plugins and handlers", async () => {
		const calls: string[] = [];
		const first = definePlugin<{ calls: string[] }>(
			{
				id: "first",
				name: "First",
				version: "1.0.0",
				hooks: ["registerCardChange"],
				capabilities: [],
			},
			({ registerCardChange }) => {
				registerCardChange({
					id: "first:a",
					event: "*",
					handle: ({ extra }) => {
						extra.calls.push("first:a");
					},
				});
				registerCardChange({
					id: "first:b",
					event: "*",
					handle: ({ extra }) => {
						extra.calls.push("first:b");
					},
				});
			},
		);
		const second = definePlugin<{ calls: string[] }>(
			{
				id: "second",
				name: "Second",
				version: "1.0.0",
				hooks: ["registerCardChange"],
				capabilities: [],
			},
			({ registerCardChange }) => {
				registerCardChange({
					id: "second:a",
					event: "*",
					handle: ({ extra }) => {
						extra.calls.push("second:a");
					},
				});
			},
		);

		await dispatchCardEvent({
			registry: createPluginRegistry([first, second]),
			enabledPluginIds: ["first", "second"],
			event: {
				name: "card.updated",
				eventId: "event_4",
				actorId: "user_1",
				boardId: "board_1",
				cardId: "card_1",
				workspaceId: "workspace_1",
				timestamp: Date.now(),
			},
			extra: { calls },
		});

		expect(calls).toEqual(["first:a", "first:b", "second:a"]);
	});
});
