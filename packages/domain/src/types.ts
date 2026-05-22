import type {
	BoardColumnMapping,
	CardBodyDocument,
	LifecycleCategory,
	PropertyDefinitionConfig,
	PropertyTypeId,
} from "./board";
import type { WorkspaceRole } from "./auth";
import type { CardCapabilityMap, HierarchyPolicy } from "./capabilities";

export interface WorkspaceSummary {
	id: string;
	name: string;
	slug: string;
	role: WorkspaceRole;
}

export interface BoardTypeSummary {
	id: string;
	workspaceId: string;
	key: string;
	name: string;
	description?: string;
	lifecycleConfig: {
		statuses: LifecycleStatusSummary[];
		initialStatusKey: string;
	};
	defaultViewIds: string[];
	defaultCardTypeKey: string;
}

export interface LifecycleStatusSummary {
	key: string;
	label: string;
	category: LifecycleCategory;
	orderKey: string;
}

export interface BoardColumnSummary extends BoardColumnMapping {
	title: string;
}

export interface BoardSummary {
	id: string;
	name: string;
	workspaceId: string;
	boardTypeId: string;
	columns: BoardColumnSummary[];
}

export interface CardPropertyDefinitionSummary {
	key: string;
	name: string;
	type: PropertyTypeId;
	orderKey: string;
	required?: boolean;
	config?: PropertyDefinitionConfig;
	defaultValue?: unknown;
}

export interface CardTypeSummary {
	id: string;
	workspaceId: string;
	key: string;
	name: string;
	description?: string;
	schemaVersion: number;
	propertiesSchema: CardPropertyDefinitionSummary[];
	defaultTagIds: string[];
	capabilities?: CardCapabilityMap;
	hierarchyPolicy?: HierarchyPolicy;
}

export interface TagDefinitionSummary {
	id: string;
	workspaceId: string;
	key: string;
	name: string;
	color?: string;
	description?: string;
}

export type CardRelationType = "relates_to" | "blocked_by" | "references";

export interface CardRelationSummary {
	type: CardRelationType;
	targetCardId: string;
}

export interface CardSummary {
	id: string;
	boardId: string;
	typeKey: string;
	parentId?: string | null;
	cardTypeId?: string;
	typeSchemaVersion: number;
	title: string;
	meta: {
		title: string;
	};
	statusKey: string;
	orderKey: string;
	properties: Record<string, unknown>;
	fields: {
		core: Record<string, unknown>;
		custom: Record<string, unknown>;
	};
	relations: CardRelationSummary[];
	tagIds: string[];
	body: CardBodyDocument;
	subtaskStats?: {
		total: number;
		completed: number;
	};
	createdBy: string;
	createdAt: number;
	updatedAt: number;
}

export interface WorkspaceMemberSummary {
	id: string;
	userId: string;
	name?: string;
	email?: string;
	role: WorkspaceRole;
}

export type BehaviorTargetType =
	| "workspace"
	| "boardType"
	| "board"
	| "cardType"
	| "tag";

export type BehaviorEventName =
	| "card.created"
	| "card.updated"
	| "card.moved"
	| "card.deleted"
	| "tag.applied"
	| "property.changed";

export type BehaviorSetValue = string | number | boolean | null;

export type BehaviorAction =
	| {
			type: "set_property";
			propertyKey: string;
			value: BehaviorSetValue;
	  }
	| {
			type: "set_current_date";
			propertyKey: string;
	  }
	| {
			type: "add_tag";
			tagKey: string;
	  }
	| {
			type: "remove_tag";
			tagKey: string;
	  }
	| {
			type: "move_status";
			statusKey: string;
	  }
	| {
			type: "notify";
			recipientPropertyKey?: string;
			recipientUserId?: string;
			message: string;
	  }
	| {
			type: "stop";
	  };

export interface BehaviorTrigger {
	eventName: BehaviorEventName;
	propertyKey?: string;
}

export interface BehaviorRuleBranch {
	condition?: string;
	actions: BehaviorAction[];
}

export interface CompiledBehaviorRule {
	id: string;
	name: string;
	trigger: BehaviorTrigger;
	branches: BehaviorRuleBranch[];
}

export interface CompiledBehaviorProgram {
	version: number;
	rules: CompiledBehaviorRule[];
}

export interface BehaviorCompileDiagnostic {
	level: "error" | "warning";
	message: string;
	line?: number;
	column?: number;
	ruleName?: string;
}

export type BehaviorPackStatus = "draft" | "active" | "archived";

export type BehaviorPackAuthoringMode = "simple" | "dsl";

export type SimpleBehaviorTrigger =
	| {
			eventName: "card.created";
	  }
	| {
			eventName: "card.moved";
	  }
	| {
			eventName: "tag.applied";
	  };

export type SimpleBehaviorAction =
	| {
			type: "set_property";
			propertyKey: string;
			value: BehaviorSetValue;
	  }
	| {
			type: "set_current_date";
			propertyKey: string;
	  }
	| {
			type: "add_tag";
			tagKey: string;
	  }
	| {
			type: "remove_tag";
			tagKey: string;
	  }
	| {
			type: "move_status";
			statusKey: string;
	  }
	| {
			type: "notify";
			recipientPropertyKey?: string;
			recipientUserId?: string;
			message: string;
	  };

export interface SimpleBehaviorRuleConfig {
	name: string;
	trigger: SimpleBehaviorTrigger;
	action: SimpleBehaviorAction;
	targetType: BehaviorTargetType;
	targetId: string;
	priority: number;
	enabled: boolean;
}

export type SimulateEventInput =
	| {
			name: "card.created";
			cardId: string;
			boardId: string;
			actorId: string;
	  }
	| {
			name: "card.updated";
			cardId: string;
			boardId: string;
			actorId: string;
			changedPropertyKeys?: string[];
			previousProperties?: Record<string, unknown>;
	  }
	| {
			name: "card.moved";
			cardId: string;
			boardId: string;
			actorId: string;
			previousStatusKey: string;
			nextStatusKey: string;
	  }
	| {
			name: "card.deleted";
			cardId: string;
			boardId: string;
			actorId: string;
	  }
	| {
			name: "tag.applied";
			cardId: string;
			boardId: string;
			actorId: string;
			tagKey: string;
	  }
	| {
			name: "property.changed";
			cardId: string;
			boardId: string;
			actorId: string;
			changedPropertyKeys: string[];
			previousProperties?: Record<string, unknown>;
	  };

export type TraceStep = {
	ruleId: string;
	ruleName: string;
	action: string;
	status: "ok" | "skipped" | "error";
	detail?: string;
};
