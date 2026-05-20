import { defineServerPlugin } from "@plank/plugin-sdk";
import type { PlankBoardTypeTemplate } from "@plank/plugin-sdk";

const coreKanbanBoardTemplate: PlankBoardTypeTemplate = {
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

export const coreKanbanServerPlugin = defineServerPlugin(
  {
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
  },
  ({ registerBoardTypeTemplate }) => {
    registerBoardTypeTemplate(coreKanbanBoardTemplate);
  },
  {
    clientSummaries: {
      views: [
        {
          id: "core-kanban:board",
          label: "Board",
          description: "The default kanban board view.",
          seedMode: "always",
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
    },
  },
);
