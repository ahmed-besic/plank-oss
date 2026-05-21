import { defineClientPlugin } from "@plank/plugin-sdk";
import type { UiExtensionRenderProps } from "@plank/plugin-sdk";
import { BoardView } from "./board-view";
import { CardSummarySlot } from "./card-summary-slot";
import { coreKanbanManifest } from "./manifest";
import { registerCorePropertyTypes } from "./property-editors";

export { coreKanbanBoardTemplate } from "./manifest";

function StatusPanel(props: UiExtensionRenderProps) {
  if (!props.card || !props.boardType) {
    return null;
  }
  return <CardSummarySlot card={props.card} boardType={props.boardType} />;
}

export const coreKanbanPlugin = defineClientPlugin(
  coreKanbanManifest,
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
      slot: "card.sidebar.panels",
      label: "Current status",
      render: (props) => <StatusPanel {...props} />,
    });
  },
);
