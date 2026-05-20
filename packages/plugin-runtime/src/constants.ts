export const requiredBuiltinPluginIds = new Set(["core-kanban", "calendar-board"]);

export function isRequiredBuiltinPluginId(pluginId: string) {
  return requiredBuiltinPluginIds.has(pluginId);
}
