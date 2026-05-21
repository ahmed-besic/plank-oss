import type { PluginManifest } from "@plank/domain";
import type { PlankBoardTypeTemplate } from "@plank/plugin-sdk";

export const coreKanbanManifest: PluginManifest = {
  id: "core-kanban",
  name: "Core Kanban",
  version: "1.0.0",
  hooks: [
    "registerView",
    "registerPropertyType",
    "registerCommand",
    "registerUiExtension",
    "registerCardChange",
    "registerBoardTypeTemplate",
  ],
  capabilities: ["cards:read", "cards:write", "boardViews:read"],
  trustLevel: "builtin",
  description: "The default board view and builtin property editors.",
  serverModule: "./server",
};

export const coreKanbanBoardTemplate: PlankBoardTypeTemplate = {
  id: "core-kanban:default",
  name: "Kanban Board",
  description: "A simple status-based board with shared cards and columns.",
  defaultLifecycleStatuses: [
    { key: "backlog", label: "Backlog", category: "todo", orderKey: "a0" },
    {
      key: "in-progress",
      label: "In progress",
      category: "active",
      orderKey: "a1",
    },
    { key: "done", label: "Done", category: "done", orderKey: "a2" },
  ],
  defaultViewIds: ["core-kanban:board"],
  version: 1,
};

export const coreKanbanClientSummaries = {
  views: [
    {
      id: "core-kanban:board",
      label: "Board",
      description: "The default kanban board view.",
      seedMode: "always" as const,
      defaultForBoard: true,
    },
  ],
  propertyTypes: [
    { id: "text", label: "Text" },
    { id: "number", label: "Number" },
    { id: "checkbox", label: "Checkbox" },
    { id: "select", label: "Select" },
    { id: "date", label: "Date" },
  ],
  commands: [
    {
      id: "core-kanban:create-card",
      label: "Create card in first column",
      keywords: ["card", "create", "new"],
    },
    {
      id: "core-kanban:add-text-property",
      label: "Add text property",
      keywords: ["property", "text"],
    },
  ],
  uiExtensions: [
    {
      id: "core-kanban:status",
      slot: "card.sidebar.panels" as const,
      label: "Current status",
    },
  ],
};
