import { defineServerPlugin } from "@plank/plugin-sdk";
import {
  coreKanbanBoardTemplate,
  coreKanbanClientSummaries,
  coreKanbanManifest,
} from "./manifest";

export const coreKanbanServerPlugin = defineServerPlugin(
  coreKanbanManifest,
  ({ registerBoardTypeTemplate }) => {
    registerBoardTypeTemplate(coreKanbanBoardTemplate);
  },
  {
    clientSummaries: coreKanbanClientSummaries,
  },
);
