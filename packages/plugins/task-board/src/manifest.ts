import { DEFAULT_PRIORITY_PROPERTY_OPTIONS } from "@plank/domain";
import type { PluginManifest } from "@plank/domain";
import type { CardTypeManifest, PlankBoardTypeTemplate } from "@plank/plugin-sdk";

export const taskBoardPluginId = "task-board";
export const taskCardTypeKey = "task-board:task";

export const taskBoardPluginManifest: PluginManifest = {
  id: taskBoardPluginId,
  name: "Task Board",
  version: "1.0.0",
  hooks: [
    "registerView",
    "registerPropertyType",
    "registerCommand",
    "registerBoardTypeTemplate",
  ],
  capabilities: ["cards:read", "cards:write", "boardViews:read"],
  trustLevel: "trusted-local",
  description: "Adds task cards, sub-tasks, and a task-focused board view.",
  serverModule: "task-board",
};

export const taskCardManifest: CardTypeManifest = {
  pluginId: taskBoardPluginId,
  typeKey: taskCardTypeKey,
  schemaVersion: 1,
  fields: {
    core: [
      {
        key: "description",
        label: "Description",
        valueType: "string",
        searchable: true,
      },
      {
        key: "dueDate",
        label: "Due date",
        valueType: "timestamp",
        indexed: true,
      },
      {
        key: "priority",
        label: "Priority",
        valueType: "string",
        enumValues: DEFAULT_PRIORITY_PROPERTY_OPTIONS.map((option) => option.value),
        enumOptions: DEFAULT_PRIORITY_PROPERTY_OPTIONS,
        indexed: true,
        defaultValue: "medium",
      },
      {
        key: "completed",
        label: "Completed",
        valueType: "boolean",
        defaultValue: false,
        indexed: true,
      },
    ],
  },
  bodyPolicy: { allowEmpty: true },
  metaPolicy: { titleRequired: true },
  automationExposedFields: ["dueDate", "priority", "completed"],
  queryIndexHints: [
    { namespace: "core", fieldKey: "dueDate", valueType: "timestamp" },
    { namespace: "core", fieldKey: "priority", valueType: "string" },
    { namespace: "core", fieldKey: "completed", valueType: "boolean" },
  ],
  capabilities: {
    provides: {
      hasDeadline: { kind: "field", path: "fields.core.dueDate" },
      hasPriority: { kind: "field", path: "fields.core.priority" },
      hasCompletion: { kind: "field", path: "fields.core.completed" },
      hasBody: { kind: "body" },
      hasTitle: { kind: "meta", path: "meta.title" },
      hasSubtasks: { kind: "system", path: "parentId" },
      hasStatus: { kind: "system", path: "statusKey" },
    },
  },
  hierarchyPolicy: {
    supportsChildren: true,
    maxDepth: 1,
    allowedChildTypeKeys: [taskCardTypeKey],
  },
};

export const taskBoardTemplate: PlankBoardTypeTemplate = {
  id: "task-board:default",
  name: "Task Board",
  description:
    "A board optimized for task management with deadlines, priorities, and sub-tasks.",
  defaultLifecycleStatuses: [
    { key: "backlog", label: "Backlog", category: "todo", orderKey: "a0" },
    { key: "todo", label: "To Do", category: "todo", orderKey: "a1" },
    {
      key: "in_progress",
      label: "In Progress",
      category: "active",
      orderKey: "a2",
    },
    { key: "done", label: "Done", category: "done", orderKey: "a3" },
  ],
  defaultViewIds: ["task-board:board"],
  defaultCardTypeKey: taskCardTypeKey,
  version: 1,
};

export const taskPriorityOptions = DEFAULT_PRIORITY_PROPERTY_OPTIONS;

export const taskBoardClientSummaries = {
  views: [
    {
      id: "task-board:board",
      label: "Tasks",
      description: "Task-focused columns with due dates, priority, and sub-tasks.",
      seedMode: "enabled" as const,
    },
  ],
  propertyTypes: [{ id: "task-board:priority", label: "Priority" }],
};
