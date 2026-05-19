import { definePlugin } from "@plank/plugin-sdk";
import { TaskBoardView } from "./views/TaskBoardView";
import { PriorityEditor } from "./properties/PriorityEditor";
import {
  taskCardManifest,
  taskBoardPluginId,
  taskBoardTemplate,
} from "./manifest";

export const taskBoardPlugin = definePlugin(
  {
    id: taskBoardPluginId,
    name: "Task Board",
    version: "1.0.0",
    hooks: [
      "registerView",
      "registerPropertyType",
      "registerCommand",
      "registerBoardTypeTemplate",
    ],
    capabilities: ["cards:read", "cards:write", "boardViews:read"],
    description: "Adds task cards, sub-tasks, and a task-focused board view.",
    serverModule: "task-board",
  },
  ({
    registerBoardTypeTemplate,
    registerCardTypeManifest,
    registerCommand,
    registerPropertyType,
    registerView,
  }) => {
    registerBoardTypeTemplate(taskBoardTemplate);
    registerCardTypeManifest(taskCardManifest);

    registerView({
      id: "task-board:board",
      label: "Tasks",
      description: "Task-focused columns with due dates, priority, and sub-tasks.",
      seedMode: "enabled",
      render: (props) => <TaskBoardView {...props} />,
    });

    registerPropertyType({
      id: "task-board:priority",
      label: "Priority",
      renderEditor: (props) => <PriorityEditor {...props} />,
    });

    registerCommand({
      id: "task-board:add-task",
      label: "Create task",
      keywords: ["task", "todo", "create"],
      run: async ({ createCard, toast }) => {
        await createCard?.();
        toast?.("Task created.");
      },
    });
  },
);

export * from "./manifest";
