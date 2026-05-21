import { defineServerPlugin } from "@plank/plugin-sdk";
import {
  taskBoardClientSummaries,
  taskBoardPluginManifest,
  taskBoardTemplate,
  taskCardManifest,
} from "./manifest";

export const taskBoardServerPlugin = defineServerPlugin(
  taskBoardPluginManifest,
  ({ registerBoardTypeTemplate, registerCardTypeManifest }) => {
    registerBoardTypeTemplate(taskBoardTemplate);
    registerCardTypeManifest(taskCardManifest);
  },
  {
    clientSummaries: taskBoardClientSummaries,
  },
);
