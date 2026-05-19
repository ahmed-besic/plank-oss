import {
  builtinPluginRegistry,
  isRequiredBuiltinPluginId,
} from "@plank/plugin-runtime";
import { v } from "convex/values";
import { query } from "./_generated/server";
import { requireWorkspaceAccessBySlug } from "./lib/auth";
import { getWorkspaceExtensionRecords } from "./lib/plugins";

export const listBoardTypeTemplates = query({
  args: {
    workspaceSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const { workspace } = await requireWorkspaceAccessBySlug(
      ctx,
      args.workspaceSlug,
    );
    const records = await getWorkspaceExtensionRecords(ctx, workspace._id);
    const statusByPluginId = new Map(
      records.map((record) => [record.pluginId, record.status]),
    );

    return builtinPluginRegistry.plugins.flatMap((plugin) => {
      return plugin.boardTypeTemplates.map((template) => ({
        pluginId: plugin.manifest.id,
        templateId: template.id,
        version: template.version,
        name: template.name,
        description: template.description,
        defaultViewIds: template.defaultViewIds,
        defaultCardTypeKey: template.defaultCardTypeKey ?? "core.todo",
        isEnabled:
          isRequiredBuiltinPluginId(plugin.manifest.id) ||
          statusByPluginId.get(plugin.manifest.id) === "enabled",
        requiresExtensionEnable: !isRequiredBuiltinPluginId(plugin.manifest.id),
      }));
    });
  },
});
