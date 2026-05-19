import { definePlugin } from "@plank/plugin-sdk";
import type { PlankBoardTypeTemplate } from "@plank/plugin-sdk";
import { BoardView } from "./board-view";
import { CardSummarySlot } from "./card-summary-slot";
import { registerCorePropertyTypes } from "./property-editors";

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

export const coreKanbanPlugin = definePlugin(
  {
    id: "core-kanban",
    name: "Core Kanban",
    version: "1.0.0",
    hooks: [
      "registerView",
      "registerPropertyType",
      "registerCommand",
      "registerCardSlot",
      "registerCardChange",
      "registerBoardTypeTemplate",
    ],
    capabilities: ["cards:read", "cards:write", "boardViews:read"],
    description: "The default board view and builtin property editors.",
  },
  ({
    registerCardSlot,
    registerBoardTypeTemplate,
    registerCommand,
    registerPropertyType,
    registerView,
  }) => {
    registerBoardTypeTemplate(coreKanbanBoardTemplate);

    registerView({
      id: "core-kanban:board",
      label: "Board",
      description: "The default kanban board view.",
      seedMode: "always",
      defaultForBoard: true,
      render: (props) => <BoardView {...props} />,
    });

    registerCorePropertyTypes(registerPropertyType);

    registerCommand({
      id: "core-kanban:create-card",
      label: "Create card in first column",
      keywords: ["card", "create", "new"],
      run: async ({ createCard }) => {
        await createCard?.();
      },
    });
    registerCommand({
      id: "core-kanban:add-text-property",
      label: "Add text property",
      keywords: ["property", "text"],
      run: async ({ addProperty, toast }) => {
        if (!addProperty) {
          toast?.("Open a board first to add a property.");
          return;
        }

        await addProperty("Text property", "text", {});
        toast?.("Text property added.");
      },
    });

    registerCardSlot({
      id: "core-kanban:status",
      title: "Current status",
      render: (props) => <CardSummarySlot {...props} />,
    });
  },
);
