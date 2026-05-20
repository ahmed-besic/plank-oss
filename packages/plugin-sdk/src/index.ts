import type { ReactNode } from "react";
import type {
	BoardTypeSummary,
	BoardViewConfigValue,
	CardTypeManifest,
	CardEventPayload,
	CardPropertyDefinitionSummary,
	CardSummary,
	CardTypeSummary,
	FeatureInstanceRef,
	LifecycleStatus,
	PluginFeatureKind,
	PluginManifest,
	PluginRuntimePermission,
	TagDefinitionSummary,
	ViewSharingPolicy,
	WorkspaceMemberSummary,
	ViewCapabilities,
} from "@plank/domain";
export type { CardTypeManifest } from "@plank/domain";

export type PlatformPermission = PluginRuntimePermission;
export type PlatformUiSlotId =
	| "shell.sidebar.navigation"
	| "board.header.actions"
	| "card.drawer.panels"
	| "settings.workspace.panels";

export interface PlatformServerCardSummary {
	id: string;
	workspaceId: string;
	boardId: string;
	typeKey: string;
	statusKey: string;
	title: string;
	properties: Record<string, unknown>;
	updatedAt: number;
}

export interface PlatformServerServices {
	cards: {
		get: (cardId: string) => Promise<PlatformServerCardSummary | null>;
	};
}

export interface PlatformClientServices {
	navigation: {
		openCard: (cardId: string) => void;
		navigate: (options: {
			to: string;
			search?: Record<string, unknown>;
		}) => void;
	};
	cards: {
		create: (
			title: string,
			columnId?: string,
			typeKey?: string,
			parentId?: string,
		) => Promise<string | undefined | void>;
		update: BoardViewActions["updateCard"];
		move: BoardViewActions["moveCard"];
		open: (cardId: string) => void;
	};
	properties: {
		add: (
			name: string,
			type: string,
			config?: Record<string, unknown>,
			typeKey?: string,
		) => Promise<void>;
	};
	views: {
		updateConfig: (config: BoardViewConfigValue) => Promise<void>;
	};
	toast: {
		show: (message: string) => void;
	};
}

export interface BoardViewActions {
	createCard: (
		title: string,
		columnId?: string,
		typeKey?: string,
		parentId?: string,
	) => Promise<string | undefined | void>;
	createSubTask?: (
		parentId: string,
		title: string,
		typeKey?: string,
	) => Promise<string | undefined | void>;
	createColumn: (label: string) => Promise<void>;
	deleteColumn: (columnId: string) => Promise<void>;
	moveCard: (
		cardId: string,
		columnId: string,
		previousOrderKey?: string,
		nextOrderKey?: string,
	) => Promise<void>;
	updateCard: (payload: {
		cardId: string;
		title?: string;
		body?: unknown;
		baseUpdatedAt?: number;
		propertyUpdates?: Record<string, unknown>;
		tagIds?: string[];
	}) => Promise<{ stale?: boolean; serverUpdatedAt?: number } | void>;
	openCard: (cardId: string) => void;
	renameColumn: (columnId: string, label: string) => Promise<void>;
	reorderColumn: (
		columnId: string,
		previousOrderKey?: string,
		nextOrderKey?: string,
	) => Promise<void>;
}

export interface ViewRenderProps {
	boardId: string;
	boardName: string;
	viewId: string;
	viewInstanceId?: string;
	viewMode?: "shared" | "private";
	viewLabel: string;
	viewConfig?: BoardViewConfigValue;
	featureInstance?: FeatureInstanceRef;
	updateViewConfig?: (config: BoardViewConfigValue) => Promise<void>;
	boardType: BoardTypeSummary;
	columns: Array<{
		id: string;
		statusKey: string;
		title: string;
		orderKey?: string;
	}>;
	cardTypes: CardTypeSummary[];
	tagDefinitions: TagDefinitionSummary[];
	cards: CardSummary[];
	members: WorkspaceMemberSummary[];
	ui?: {
		unreadCardIds?: string[];
	};
	services?: PlatformClientServices;
	actions: BoardViewActions;
}

export interface PropertyEditorProps {
	definition: CardPropertyDefinitionSummary;
	value: unknown;
	onChange: (value: unknown) => void;
	members: WorkspaceMemberSummary[];
}

export interface UiExtensionRenderProps {
	slot: PlatformUiSlotId;
	pluginId: string;
	workspaceSlug?: string;
	boardId?: string;
	services?: PlatformClientServices;
	boardType?: BoardTypeSummary;
	card?: CardSummary;
	cardType?: CardTypeSummary;
	tagDefinitions?: TagDefinitionSummary[];
	members?: WorkspaceMemberSummary[];
}

export interface CommandContext {
	workspaceSlug: string;
	boardId?: string;
	search?: string;
	createCard?: () => Promise<void>;
	addProperty?: (
		name: string,
		type: string,
		config?: Record<string, unknown>,
		typeKey?: string,
	) => Promise<void>;
	navigate?: (options: {
		to: string;
		search?: Record<string, unknown>;
	}) => void;
	toast?: (message: string) => void;
	services: PlatformClientServices;
}

export interface CardChangeContext<TExtra = Record<string, never>> {
	event: CardEventPayload;
	extra: TExtra;
}

export interface PlankViewDefinition {
	id: string;
	label: string;
	description?: string;
	sharingPolicy?: ViewSharingPolicy;
	seedMode?: "always" | "enabled";
	defaultForBoard?: boolean;
	capabilities?: ViewCapabilities;
	render: (props: ViewRenderProps) => ReactNode;
}

export interface PlankBoardTypeTemplate {
	id: string;
	name: string;
	description?: string;
	defaultLifecycleStatuses: LifecycleStatus[];
	defaultViewIds: string[];
	defaultCardTypeKey?: string;
	version: number;
}

export interface PlankPropertyTypeDefinition {
	id: string;
	label: string;
	description?: string;
	getDefaultValue?: () => unknown;
	renderValue?: (value: unknown) => ReactNode;
	renderEditor: (props: PropertyEditorProps) => ReactNode;
}

export interface PlankCommandDefinition {
	id: string;
	label: string;
	keywords?: string[];
	run: (context: CommandContext) => Promise<void> | void;
}

export interface PlankUiExtensionDefinition {
	id: string;
	slot: PlatformUiSlotId;
	label: string;
	order?: number;
	requiredPermissions?: PlatformPermission[];
	render: (props: UiExtensionRenderProps) => ReactNode;
}

export interface PlankCardChangeHandler<TExtra = Record<string, never>> {
	id: string;
	event: CardEventPayload["name"] | "*";
	handle: (context: CardChangeContext<TExtra>) => Promise<void> | void;
}

export type PlankClientPluginFeature =
	| {
			kind: "view";
			id: string;
			definition: PlankViewDefinition;
	  }
	| {
			kind: "propertyType";
			id: string;
			definition: PlankPropertyTypeDefinition;
	  }
	| {
			kind: "command";
			id: string;
			definition: PlankCommandDefinition;
	  }
	| {
			kind: "uiExtension";
			id: string;
			definition: PlankUiExtensionDefinition;
	  };

export type PlankServerPluginFeature<TExtra = Record<string, never>> =
	| {
			kind: "cardType";
			id: string;
			definition: CardTypeManifest;
	  }
	| {
			kind: "boardTypeTemplate";
			id: string;
			definition: PlankBoardTypeTemplate;
	  }
	| {
			kind: "cardChangeHandler";
			id: string;
			definition: PlankCardChangeHandler<TExtra>;
	  };

export type PlankPluginFeature<TExtra = any> =
	| PlankClientPluginFeature
	| PlankServerPluginFeature<TExtra>;

export interface RegisterClientPluginApi {
	registerView: (definition: PlankViewDefinition) => void;
	registerPropertyType: (definition: PlankPropertyTypeDefinition) => void;
	registerCommand: (definition: PlankCommandDefinition) => void;
	registerUiExtension: (definition: PlankUiExtensionDefinition) => void;
	registerFeature: (feature: PlankClientPluginFeature) => void;
}

export interface RegisterServerPluginApi<TExtra = Record<string, never>> {
	registerCardChange: (definition: PlankCardChangeHandler<TExtra>) => void;
	registerBoardTypeTemplate: (definition: PlankBoardTypeTemplate) => void;
	registerCardTypeManifest: (definition: CardTypeManifest) => void;
	registerFeature: (feature: PlankServerPluginFeature<TExtra>) => void;
}

export interface PlankClientPlugin {
	manifest: PluginManifest;
	features: PlankPluginFeature[];
	views: PlankViewDefinition[];
	propertyTypes: PlankPropertyTypeDefinition[];
	commands: PlankCommandDefinition[];
	uiExtensions: PlankUiExtensionDefinition[];
}

export interface PlankServerPlugin<TExtra = Record<string, never>> {
	manifest: PluginManifest;
	features: PlankPluginFeature<TExtra>[];
	cardChangeHandlers: PlankCardChangeHandler<TExtra>[];
	boardTypeTemplates: PlankBoardTypeTemplate[];
	cardTypeManifests: CardTypeManifest[];
	clientSummaries?: {
		views?: Array<
			Pick<
				PlankViewDefinition,
				| "id"
				| "label"
				| "description"
				| "sharingPolicy"
				| "seedMode"
				| "defaultForBoard"
			>
		>;
		propertyTypes?: Array<
			Pick<PlankPropertyTypeDefinition, "id" | "label" | "description">
		>;
	};
}

function createFeature<K extends PluginFeatureKind, D>(
	kind: K,
	id: string,
	definition: D,
) {
	return { kind, id, definition };
}

export function defineViewFeature(
	definition: PlankViewDefinition,
): PlankClientPluginFeature {
	return createFeature("view", definition.id, definition);
}

export function definePropertyTypeFeature(
	definition: PlankPropertyTypeDefinition,
): PlankClientPluginFeature {
	return createFeature("propertyType", definition.id, definition);
}

export function defineCommandFeature(
	definition: PlankCommandDefinition,
): PlankClientPluginFeature {
	return createFeature("command", definition.id, definition);
}

export function defineUiExtensionFeature(
	definition: PlankUiExtensionDefinition,
): PlankClientPluginFeature {
	return createFeature("uiExtension", definition.id, definition);
}

export function defineCardTypeFeature(
	definition: CardTypeManifest,
): PlankServerPluginFeature<any> {
	return createFeature("cardType", definition.typeKey, definition);
}

export function defineBoardTypeTemplateFeature(
	definition: PlankBoardTypeTemplate,
): PlankServerPluginFeature<any> {
	return createFeature("boardTypeTemplate", definition.id, definition);
}

export function defineCardChangeFeature<TExtra = Record<string, never>>(
	definition: PlankCardChangeHandler<TExtra>,
): PlankServerPluginFeature<TExtra> {
	return createFeature("cardChangeHandler", definition.id, definition);
}

function applyClientFeature(
	plugin: Pick<
		PlankClientPlugin,
		"features" | "views" | "propertyTypes" | "commands" | "uiExtensions"
	>,
	feature: PlankClientPluginFeature,
) {
	plugin.features.push(feature);
	switch (feature.kind) {
		case "view":
			plugin.views.push(feature.definition);
			break;
		case "propertyType":
			plugin.propertyTypes.push(feature.definition);
			break;
		case "command":
			plugin.commands.push(feature.definition);
			break;
		case "uiExtension":
			plugin.uiExtensions.push(feature.definition);
			break;
	}
}

function applyServerFeature<TExtra>(
	plugin: Pick<
		PlankServerPlugin<TExtra>,
		"features" | "cardTypeManifests" | "boardTypeTemplates" | "cardChangeHandlers"
	>,
	feature: PlankServerPluginFeature<TExtra>,
) {
	plugin.features.push(feature);
	switch (feature.kind) {
		case "cardType":
			plugin.cardTypeManifests.push(feature.definition);
			break;
		case "boardTypeTemplate":
			plugin.boardTypeTemplates.push(feature.definition);
			break;
		case "cardChangeHandler":
			plugin.cardChangeHandlers.push(feature.definition);
			break;
	}
}

export function defineClientPlugin(
	manifest: PluginManifest,
	register: (api: RegisterClientPluginApi) => void,
): PlankClientPlugin {
	const plugin: PlankClientPlugin = {
		manifest,
		features: [],
		views: [],
		propertyTypes: [],
		commands: [],
		uiExtensions: [],
	};

	register({
		registerView(definition) {
			applyClientFeature(plugin, defineViewFeature(definition));
		},
		registerPropertyType(definition) {
			applyClientFeature(plugin, definePropertyTypeFeature(definition));
		},
		registerCommand(definition) {
			applyClientFeature(plugin, defineCommandFeature(definition));
		},
		registerUiExtension(definition) {
			applyClientFeature(plugin, defineUiExtensionFeature(definition));
		},
		registerFeature(feature) {
			applyClientFeature(plugin, feature);
		},
	});

	return plugin;
}

export function defineServerPlugin<TExtra = Record<string, never>>(
	manifest: PluginManifest,
	register: (api: RegisterServerPluginApi<TExtra>) => void,
	options: Pick<PlankServerPlugin<TExtra>, "clientSummaries"> = {},
): PlankServerPlugin<TExtra> {
	const plugin: PlankServerPlugin<TExtra> = {
		manifest,
		features: [],
		cardChangeHandlers: [],
		boardTypeTemplates: [],
		cardTypeManifests: [],
		clientSummaries: options.clientSummaries,
	};

	register({
		registerCardChange(definition) {
			applyServerFeature(plugin, defineCardChangeFeature<TExtra>(definition));
		},
		registerBoardTypeTemplate(definition) {
			applyServerFeature(plugin, defineBoardTypeTemplateFeature(definition));
		},
		registerCardTypeManifest(definition) {
			applyServerFeature(plugin, defineCardTypeFeature(definition));
		},
		registerFeature(feature) {
			applyServerFeature(plugin, feature);
		},
	});

	return plugin;
}
