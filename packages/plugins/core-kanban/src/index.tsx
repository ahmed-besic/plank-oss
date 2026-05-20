import { defineClientPlugin } from "@plank/plugin-sdk";
import type {
  PlankBoardTypeTemplate,
  UiExtensionRenderProps,
} from "@plank/plugin-sdk";
import { BoardView } from "./board-view";
import { CardSummarySlot } from "./card-summary-slot";
import { registerCorePropertyTypes } from "./property-editors";

function StatusPanel(props: UiExtensionRenderProps) {
  if (!props.card || !props.boardType) {
    return null;
  }
  return <CardSummarySlot card={props.card} boardType={props.boardType} />;
}

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

export const coreKanbanPlugin = defineClientPlugin(
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
  ({
    registerCommand,
    registerPropertyType,
    registerUiExtension,
    registerView,
  }) => {
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

    registerUiExtension({
      id: "core-kanban:status",
      slot: "card.drawer.panels",
      label: "Current status",
      render: (props) => <StatusPanel {...props} />,
    });
  },
);
