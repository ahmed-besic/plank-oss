import { defineServerPlugin } from "@plank/plugin-sdk";
import {
  calendarBoardClientSummaries,
  calendarBoardManifest,
  calendarBoardTemplate,
} from "./manifest";

export const calendarBoardServerPlugin = defineServerPlugin(
  calendarBoardManifest,
  ({ registerBoardTypeTemplate }) => {
    registerBoardTypeTemplate(calendarBoardTemplate);
  },
  {
    clientSummaries: calendarBoardClientSummaries,
  },
);
