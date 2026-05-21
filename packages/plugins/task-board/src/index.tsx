import { defineClientPlugin } from "@plank/plugin-sdk";
import { TaskBoardView } from "./views/TaskBoardView";
import { PriorityEditor } from "./properties/PriorityEditor";
import {
  taskBoardPluginManifest,
} from "./manifest";

export const taskBoardPlugin = defineClientPlugin(
  taskBoardPluginManifest,
  ({
    registerCommand,
    registerPropertyType,
    registerView,
  }) => {
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
