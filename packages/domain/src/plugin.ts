import type { CardCapabilityMap, HierarchyPolicy } from "./capabilities";
import type { PropertyOption, PropertyTypeId } from "./board";

export const pluginHooks = [
	"registerView",
	"registerPropertyType",
	"registerCommand",
	"registerCardSlot",
	"registerCardChange",
	"registerBoardTypeTemplate",
	"registerCardTypeManifest",
] as const;

export type PluginHook = (typeof pluginHooks)[number];

export type ExtensionStatus = "enabled" | "disabled";

export type CardEventName =
	| "card.created"
	| "card.updated"
	| "card.moved"
	| "card.deleted"
	| "tag.applied"
	| "property.changed";

export type CardActivityKind =
	| "new_card"
	| "title"
	| "description"
	| "property"
	| "tag"
	| "move"
	| "delete";

export interface CardActivityProjectionEntry {
	kind: CardActivityKind;
	propertyKeys?: string[];
}

interface BaseCardEventPayload {
	name: CardEventName;
	eventId: string;
	workflowEventId?: string;
	rootEventId?: string;
	parentEventId?: string;
	boardId: string;
	cardId: string;
	workspaceId: string;
	actorId: string;
	timestamp: number;
	depth?: number;
	origin?: "user" | "automation";
	statusKey?: string;
	previousStatusKey?: string;
	nextStatusKey?: string;
	typeKey?: string;
	cardTypeId?: string;
	tagIds?: string[];
	previousTagIds?: string[];
	tagKey?: string;
	previousColumnId?: string;
	nextColumnId?: string;
	changedPropertyKeys?: string[];
	previousProperties?: Record<string, unknown>;
	patch?: Record<string, unknown>;
	activityEntries?: CardActivityProjectionEntry[];
}

export type CardEventPayload = BaseCardEventPayload;

export interface PluginManifest {
	id: string;
	name: string;
	version: string;
	hooks: PluginHook[];
	capabilities: string[];
	description?: string;
	serverModule?: string;
}

export type ViewSharingPolicy =
	| "shared_with_private"
	| "force_shared"
	| "force_private";

export type CardFieldValueType = "string" | "number" | "boolean" | "timestamp";

export interface CardFieldManifest {
	key: string;
	label: string;
	valueType: CardFieldValueType;
	required?: boolean;
	defaultValue?: unknown;
	enumValues?: string[];
	enumOptions?: PropertyOption[];
	searchable?: boolean;
	indexed?: boolean;
}

export interface CardBodyPolicy {
	allowEmpty: boolean;
	maxBlocks?: number;
}

export interface CardMetaPolicy {
	titleRequired: boolean;
}

export interface QueryIndexHint {
	namespace: "core" | "custom";
	fieldKey: string;
	valueType: CardFieldValueType;
}

export interface CardTypeManifest {
	pluginId: string;
	typeKey: string;
	schemaVersion: number;
	fields: {
		core: CardFieldManifest[];
	};
	bodyPolicy: CardBodyPolicy;
	metaPolicy: CardMetaPolicy;
	automationExposedFields: string[];
	queryIndexHints: QueryIndexHint[];
	capabilities?: {
		provides: CardCapabilityMap;
	};
	hierarchyPolicy?: HierarchyPolicy;
}

export interface WorkspaceExtensionRecord {
	pluginId: string;
	status: ExtensionStatus;
}

export interface PropertyTypeSummary {
	id: PropertyTypeId;
	key: string;
	name: string;
	pluginId?: string;
}
