import type { ReactNode } from "react";
import type {
	BoardTypeSummary,
	CardTypeManifest,
	CardEventPayload,
	CardPropertyDefinitionSummary,
	CardSummary,
	CardTypeSummary,
	LifecycleStatus,
	PluginManifest,
	TagDefinitionSummary,
	ViewSharingPolicy,
	WorkspaceMemberSummary,
	ViewCapabilities,
} from "@plank/domain";
export type { CardTypeManifest } from "@plank/domain";

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
	viewConfig?: Record<string, unknown>;
	updateViewConfig?: (config: Record<string, unknown>) => Promise<void>;
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
	actions: BoardViewActions;
}

export interface PropertyEditorProps {
	definition: CardPropertyDefinitionSummary;
	value: unknown;
	onChange: (value: unknown) => void;
	members: WorkspaceMemberSummary[];
}

export interface CardSlotProps {
	card: CardSummary;
	boardType: BoardTypeSummary;
	cardType?: CardTypeSummary;
	tagDefinitions: TagDefinitionSummary[];
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

export interface PlankCardSlotDefinition {
	id: string;
	title: string;
	render: (props: CardSlotProps) => ReactNode;
}

export interface PlankCardChangeHandler<TExtra = Record<string, never>> {
	id: string;
	event: CardEventPayload["name"] | "*";
	handle: (context: CardChangeContext<TExtra>) => Promise<void> | void;
}

export interface RegisterPluginApi<TExtra = Record<string, never>> {
	registerView: (definition: PlankViewDefinition) => void;
	registerPropertyType: (definition: PlankPropertyTypeDefinition) => void;
	registerCommand: (definition: PlankCommandDefinition) => void;
	registerCardSlot: (definition: PlankCardSlotDefinition) => void;
	registerCardChange: (definition: PlankCardChangeHandler<TExtra>) => void;
	registerBoardTypeTemplate: (definition: PlankBoardTypeTemplate) => void;
	registerCardTypeManifest: (definition: CardTypeManifest) => void;
}

export interface PlankPlugin<TExtra = Record<string, never>> {
	manifest: PluginManifest;
	views: PlankViewDefinition[];
	propertyTypes: PlankPropertyTypeDefinition[];
	commands: PlankCommandDefinition[];
	cardSlots: PlankCardSlotDefinition[];
	cardChangeHandlers: PlankCardChangeHandler<TExtra>[];
	boardTypeTemplates: PlankBoardTypeTemplate[];
	cardTypeManifests: CardTypeManifest[];
}

export function definePlugin<TExtra = Record<string, never>>(
	manifest: PluginManifest,
	register: (api: RegisterPluginApi<TExtra>) => void,
): PlankPlugin<TExtra> {
	const plugin: PlankPlugin<TExtra> = {
		manifest,
		views: [],
		propertyTypes: [],
		commands: [],
		cardSlots: [],
		cardChangeHandlers: [],
		boardTypeTemplates: [],
		cardTypeManifests: [],
	};

	register({
		registerView(definition) {
			plugin.views.push(definition);
		},
		registerPropertyType(definition) {
			plugin.propertyTypes.push(definition);
		},
		registerCommand(definition) {
			plugin.commands.push(definition);
		},
		registerCardSlot(definition) {
			plugin.cardSlots.push(definition);
		},
		registerCardChange(definition) {
			plugin.cardChangeHandlers.push(definition);
		},
		registerBoardTypeTemplate(definition) {
			plugin.boardTypeTemplates.push(definition);
		},
		registerCardTypeManifest(definition) {
			plugin.cardTypeManifests.push(definition);
		},
	});

	return plugin;
}
