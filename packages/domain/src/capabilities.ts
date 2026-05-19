export type CapabilityBinding =
  | { kind: "field"; path: string }
  | { kind: "system"; path: string }
  | { kind: "meta"; path: string }
  | { kind: "body" }
  | { kind: "tag" };

export type CardCapabilityId =
  | "hasDeadline"
  | "hasPriority"
  | "hasCompletion"
  | "hasAssignee"
  | "hasBody"
  | "hasTitle"
  | "hasSubtasks"
  | "hasStatus"
  | "hasProgress";

export interface CardCapabilityMap {
  [capabilityId: string]: CapabilityBinding | undefined;
}

export interface CardTypeCapabilities {
  provides: CardCapabilityMap;
}

export interface ViewCapabilities {
  requires?: CardCapabilityId[];
  enhances?: CardCapabilityId[];
}

export interface HierarchyPolicy {
  supportsChildren: boolean;
  maxDepth?: number;
  allowedChildTypeKeys?: string[];
}
