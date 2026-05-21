import { describe, expect, it } from "vitest";
import {
	createBoardSettingsEnvelope,
	createBoardTypeViewDefaultsEnvelope,
	createWorkspaceExtensionConfigEnvelope,
	unwrapBoardSettings,
	unwrapBoardTypeViewDefaults,
	unwrapWorkspaceExtensionConfig,
} from "./persistedState";

describe("persisted state helpers", () => {
	it("wraps and unwraps workspace extension config envelopes", () => {
		const envelope = createWorkspaceExtensionConfigEnvelope({
			pluginPackageId: "focus-tools",
			config: {
				panel: true,
				tags: ["focus", "triage"],
				nested: {
					enabled: true,
				},
				unsupported: [{ nope: true }],
			},
		});

		expect(envelope).toEqual({
			schemaVersion: 1,
			pluginPackageId: "focus-tools",
			value: {
				panel: true,
				tags: ["focus", "triage"],
				nested: {
					enabled: true,
				},
			},
		});
		expect(unwrapWorkspaceExtensionConfig(envelope)).toEqual(envelope.value);
		expect(unwrapWorkspaceExtensionConfig({ panel: true })).toEqual({
			panel: true,
		});
	});

	it("wraps and unwraps board settings envelopes", () => {
		const envelope = createBoardSettingsEnvelope({
			density: "compact",
			inboxVisible: true,
		});

		expect(unwrapBoardSettings(envelope)).toEqual({
			density: "compact",
			inboxVisible: true,
		});
		expect(unwrapBoardSettings({ density: "comfortable" })).toEqual({
			density: "comfortable",
		});
	});

	it("wraps and unwraps board type view defaults envelopes", () => {
		const envelope = createBoardTypeViewDefaultsEnvelope({
			defaultViewIds: ["core-kanban:board"],
			viewConfigByViewId: {
				"core-kanban:board": {
					inboxVisible: true,
				},
			},
		});

		expect(unwrapBoardTypeViewDefaults(envelope)).toEqual({
			defaultViewIds: ["core-kanban:board"],
			viewConfigByViewId: {
				"core-kanban:board": {
					inboxVisible: true,
				},
			},
		});
		expect(
			unwrapBoardTypeViewDefaults({
				defaultViewIds: ["calendar-board:month"],
			}),
		).toEqual({
			defaultViewIds: ["calendar-board:month"],
		});
	});
});
