import type { CardCapabilityMap, HierarchyPolicy } from "./capabilities";
import type { PropertyOption, PropertyTypeId } from "./board";

export const pluginHooks = [
	"registerView",
	"registerPropertyType",
	"registerCommand",
	"registerUiExtension",
	"registerCardChange",
	"registerBoardTypeTemplate",
	"registerCardTypeManifest",
] as const;

export type PluginHook = (typeof pluginHooks)[number];

export type ExtensionStatus = "enabled" | "disabled";
export const pluginTrustLevels = ["builtin", "trusted-local", "restricted"] as const;
export type PluginTrustLevel = (typeof pluginTrustLevels)[number];
export const pluginRuntimePermissions = [
	"cards:read",
	"cards:write",
	"boardViews:read",
] as const;
export type PluginRuntimePermission = (typeof pluginRuntimePermissions)[number];
export type PluginPackageId = string;
export type PluginFeatureKind =
	| "view"
	| "cardType"
	| "boardTypeTemplate"
	| "uiExtension"
	| "cardChangeHandler"
	| "propertyType"
	| "command";

export interface WorkspaceExtensionState {
	pluginPackageId: PluginPackageId;
	status: ExtensionStatus;
	config?: unknown;
	installedAt?: number;
	updatedAt?: number;
}

export interface FeatureInstanceRef {
	schemaVersion: 1;
	kind: "view";
	pluginPackageId: PluginPackageId;
	featureId: string;
	instanceId: string;
	instanceMode: "shared" | "private";
}

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
	capabilities: PluginRuntimePermission[];
	trustLevel?: PluginTrustLevel;
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

export type PlatformConfigScalar = string | number | boolean | null;
export type PlatformConfigValue =
	| PlatformConfigScalar
	| PlatformConfigScalar[]
	| Record<string, PlatformConfigScalar>;

export interface WorkspaceExtensionConfigEnvelope {
	schemaVersion: 1;
	pluginPackageId: PluginPackageId;
	value: Record<string, PlatformConfigValue>;
}

export type BoardSettingsValue = Record<string, PlatformConfigValue>;

export interface BoardSettingsEnvelope {
	schemaVersion: 1;
	value: BoardSettingsValue;
}

export interface BoardTypeViewDefaultsValue {
	defaultViewIds: string[];
	viewConfigByViewId?: Record<string, Record<string, PlatformConfigValue>>;
}

export interface BoardTypeViewDefaultsEnvelope {
	schemaVersion: 1;
	value: BoardTypeViewDefaultsValue;
}

export type BoardViewConfigScalar = string | number | boolean | null;

export interface BoardViewConfigValue {
	dateFieldKey?: string | null;
	inboxVisible?: boolean;
	kanbanDefaultPropertyValuesByType?: Record<
		string,
		Record<string, BoardViewConfigScalar>
	>;
}

export interface BoardViewConfigEnvelope {
	schemaVersion: 1;
	viewId: string;
	value: BoardViewConfigValue;
}

export interface PropertyTypeSummary {
	id: PropertyTypeId;
	key: string;
	name: string;
	pluginId?: string;
}
