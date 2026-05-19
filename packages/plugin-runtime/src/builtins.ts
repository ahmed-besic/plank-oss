import { createPluginRegistry } from "./index";
import { generatedBuiltinPlugins } from "./builtins.generated";

export const requiredBuiltinPluginIds = new Set(["core-kanban", "calendar-board"]);

// This is the trusted local plugin catalog. The file is generated from
// packages/plugins/* so add/remove stays folder-driven while workspace
// extensions still control activation.
export const builtinPlugins = generatedBuiltinPlugins;

export const builtinPluginRegistry = createPluginRegistry(builtinPlugins);

export function isRequiredBuiltinPluginId(pluginId: string) {
  return requiredBuiltinPluginIds.has(pluginId);
}
