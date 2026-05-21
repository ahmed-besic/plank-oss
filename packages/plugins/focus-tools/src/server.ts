import { defineServerPlugin } from "@plank/plugin-sdk";
import type { PlatformServerServices } from "@plank/plugin-sdk";
import {
  focusBoardTemplate,
  focusToolsClientSummaries,
  focusToolsManifest,
} from "./manifest";

export const focusToolsServerPlugin = defineServerPlugin<{
  api: PlatformServerServices;
}>(
  focusToolsManifest,
  ({ registerBoardTypeTemplate, registerCardChange }) => {
    registerBoardTypeTemplate(focusBoardTemplate);

    registerCardChange({
      id: "focus-tools:card-change-audit",
      event: "*",
      handle: async ({ event, extra }) => {
        await extra.api.cards.get(event.cardId);
      },
    });
  },
  {
    clientSummaries: focusToolsClientSummaries,
  },
);
