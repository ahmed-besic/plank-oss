import { defineServerPlugin } from "@plank/plugin-sdk";
import type { PlankBoardTypeTemplate } from "@plank/plugin-sdk";

const calendarBoardTemplate: PlankBoardTypeTemplate = {
  id: "calendar-board:default",
  name: "Calendar Board",
  description: "A date-focused board that opens in a calendar view.",
  defaultLifecycleStatuses: [
    { key: "scheduled", label: "Scheduled", category: "todo", orderKey: "a0" },
    {
      key: "in_progress",
      label: "In Progress",
      category: "active",
      orderKey: "a1",
    },
    { key: "done", label: "Done", category: "done", orderKey: "a2" },
  ],
  defaultViewIds: ["calendar-board:month"],
  version: 1,
};

export const calendarBoardServerPlugin = defineServerPlugin(
  {
    id: "calendar-board",
    name: "Calendar Board",
    version: "1.0.0",
    hooks: ["registerView", "registerBoardTypeTemplate"],
    capabilities: ["cards:read", "cards:write", "boardViews:read"],
    trustLevel: "builtin",
    description: "Adds a month calendar view over timestamp fields.",
  },
  ({ registerBoardTypeTemplate }) => {
    registerBoardTypeTemplate(calendarBoardTemplate);
  },
  {
    clientSummaries: {
      views: [
        {
          id: "calendar-board:month",
          label: "Calendar",
          description: "See cards on a month grid and move them by day.",
          seedMode: "always",
        },
      ],
    },
  },
);
