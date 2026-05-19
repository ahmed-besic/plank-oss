import type {
  CardEventPayload,
  ExtensionStatus,
  WorkspaceExtensionRecord,
} from "@plank/domain";
import type {
  PlankPlugin,
  PlankCardChangeHandler,
} from "@plank/plugin-sdk";

export interface PluginRegistry<TExtra = Record<string, never>> {
  plugins: PlankPlugin<TExtra>[];
  pluginMap: Map<string, PlankPlugin<TExtra>>;
  boardTypeTemplateMap: Map<string, PlankPlugin<TExtra>>;
  cardTypeManifestMap: Map<string, PlankPlugin<TExtra>>;
}

type WorkspaceExtensionStatusRecord = Pick<WorkspaceExtensionRecord, "pluginId"> & {
  status?: ExtensionStatus;
};

export function createPluginRegistry<TExtra = Record<string, never>>(
  plugins: PlankPlugin<TExtra>[],
): PluginRegistry<TExtra> {
  const pluginMap = new Map<string, PlankPlugin<TExtra>>();
  const boardTypeTemplateMap = new Map<string, PlankPlugin<TExtra>>();
  const cardTypeManifestMap = new Map<string, PlankPlugin<TExtra>>();

  for (const plugin of plugins) {
    if (pluginMap.has(plugin.manifest.id)) {
      throw new Error(`Duplicate plugin id: ${plugin.manifest.id}`);
    }
    pluginMap.set(plugin.manifest.id, plugin);

    for (const template of plugin.boardTypeTemplates) {
      if (boardTypeTemplateMap.has(template.id)) {
        throw new Error(`Duplicate board type template id: ${template.id}`);
      }
      boardTypeTemplateMap.set(template.id, plugin);
    }

    for (const manifest of plugin.cardTypeManifests) {
      if (cardTypeManifestMap.has(manifest.typeKey)) {
        throw new Error(`Duplicate card type manifest key: ${manifest.typeKey}`);
      }
      cardTypeManifestMap.set(manifest.typeKey, plugin);
    }
  }

  return {
    plugins,
    pluginMap,
    boardTypeTemplateMap,
    cardTypeManifestMap,
  };
}

export function getEnabledPluginIds(
  records: WorkspaceExtensionStatusRecord[],
  fallbackStatus: ExtensionStatus = "enabled",
) {
  return records
    .filter((record) => (record.status ?? fallbackStatus) === "enabled")
    .map((record) => record.pluginId);
}

export function getEnabledPlugins<TExtra = Record<string, never>>(
  registry: PluginRegistry<TExtra>,
  records: WorkspaceExtensionStatusRecord[],
) {
  const enabledIds = new Set(getEnabledPluginIds(records));
  return registry.plugins.filter((plugin) => enabledIds.has(plugin.manifest.id));
}

export interface DispatchCardEventOptions<TExtra = Record<string, never>> {
  registry: PluginRegistry<TExtra>;
  enabledPluginIds: string[];
  event: CardEventPayload;
  extra: TExtra;
}

function shouldHandleEvent<TExtra>(
  handler: PlankCardChangeHandler<TExtra>,
  event: CardEventPayload,
) {
  return handler.event === "*" || handler.event === event.name;
}

export async function dispatchCardEvent<TExtra = Record<string, never>>(
  options: DispatchCardEventOptions<TExtra>,
) {
  const enabledIds = new Set(options.enabledPluginIds);

  for (const plugin of options.registry.plugins) {
    if (!enabledIds.has(plugin.manifest.id)) {
      continue;
    }

    for (const handler of plugin.cardChangeHandlers) {
      if (shouldHandleEvent(handler, options.event)) {
        await handler.handle({
          event: options.event,
          extra: options.extra,
        });
      }
    }
  }
}

export * from "./builtins";
