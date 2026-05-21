import type {
  CardEventPayload,
  ExtensionStatus,
  PluginManifest,
  PluginTrustLevel,
  WorkspaceExtensionRecord,
} from "@plank/domain";
import { pluginRuntimePermissions, pluginTrustLevels } from "@plank/domain";
import type {
  PlankClientPlugin,
  PlankServerPlugin,
  PlankCardChangeHandler,
  PlankPluginFeature,
  PlankUiExtensionDefinition,
  PlatformPermission,
  PlatformServerServices,
  PlatformUiSlotId,
} from "@plank/plugin-sdk";

export interface ClientPluginRegistry {
  plugins: PlankClientPlugin[];
  pluginMap: Map<string, PlankClientPlugin>;
  features: ResolvedPluginFeature[];
}

export type PluginDiagnosticKind =
  | "permission-denied"
  | "invalid-trust-level"
  | "handler-failed"
  | "handler-skipped";

export interface PluginRuntimeDiagnostic {
  kind: PluginDiagnosticKind;
  pluginId: string;
  handlerId?: string;
  permission?: PlatformPermission;
  message: string;
}

export interface PluginSecurityContext {
  pluginId: string;
  trustLevel: PluginTrustLevel;
  permissions: PlatformPermission[];
  diagnostics: PluginRuntimeDiagnostic[];
}

export interface ResolvedPluginFeature {
  pluginId: string;
  feature: PlankPluginFeature<any>;
}

export interface ResolvedUiExtension {
  plugin: PlankClientPlugin;
  pluginId: string;
  extension: PlankUiExtensionDefinition;
  source: "native";
}

export interface GetEnabledUiExtensionsOptions {
  registry: Pick<ClientPluginRegistry, "plugins">;
  enabledPluginIds: string[];
  slot?: PlatformUiSlotId;
}

export interface ServerPluginRegistry<TExtra = Record<string, never>> {
  plugins: PlankServerPlugin<TExtra>[];
  pluginMap: Map<string, PlankServerPlugin<TExtra>>;
  features: ResolvedPluginFeature[];
  boardTypeTemplateMap: Map<string, PlankServerPlugin<TExtra>>;
  cardTypeManifestMap: Map<string, PlankServerPlugin<TExtra>>;
}

type WorkspaceExtensionStatusRecord = Pick<WorkspaceExtensionRecord, "pluginId"> & {
  status?: ExtensionStatus;
};

export function getPluginTrustLevel(
  plugin: Pick<PlankClientPlugin | PlankServerPlugin, "manifest">,
): PluginTrustLevel {
  const candidate = plugin.manifest.trustLevel ?? "trusted-local";
  if (pluginTrustLevels.includes(candidate as PluginTrustLevel)) {
    return candidate as PluginTrustLevel;
  }
  return "trusted-local";
}

export function validatePluginManifest(manifest: PluginManifest) {
  const diagnostics: PluginRuntimeDiagnostic[] = [];
  const trustLevel = manifest.trustLevel ?? "trusted-local";

  if (!pluginTrustLevels.includes(trustLevel as PluginTrustLevel)) {
    diagnostics.push({
      kind: "invalid-trust-level",
      pluginId: manifest.id,
      message: `Plugin ${manifest.id} declares invalid trust level ${String(
        trustLevel,
      )}`,
    });
  }

  for (const permission of manifest.capabilities) {
    if (!pluginRuntimePermissions.includes(permission)) {
      diagnostics.push({
        kind: "permission-denied",
        pluginId: manifest.id,
        permission: permission as PlatformPermission,
        message: `Plugin ${manifest.id} declares unknown runtime permission ${permission}`,
      });
    }
  }

  return diagnostics;
}

export function createPluginSecurityContext(
  plugin: Pick<PlankClientPlugin | PlankServerPlugin, "manifest">,
): PluginSecurityContext {
  return {
    pluginId: plugin.manifest.id,
    trustLevel: getPluginTrustLevel(plugin),
    permissions: plugin.manifest.capabilities,
    diagnostics: validatePluginManifest(plugin.manifest),
  };
}

export function assertPluginPermission(
  plugin: Pick<PlankClientPlugin | PlankServerPlugin, "manifest">,
  permission: PlatformPermission,
) {
  if (!plugin.manifest.capabilities.includes(permission)) {
    const message = `Plugin ${plugin.manifest.id} requires runtime permission ${permission}`;
    const error = new Error(message);
    Object.assign(error, {
      diagnostic: {
        kind: "permission-denied",
        pluginId: plugin.manifest.id,
        permission,
        message,
      } satisfies PluginRuntimeDiagnostic,
    });
    throw error;
  }
}

function isClientFeature(feature: PlankPluginFeature<any>) {
  return (
    feature.kind === "view" ||
    feature.kind === "propertyType" ||
    feature.kind === "command" ||
    feature.kind === "uiExtension"
  );
}

function isServerFeature(feature: PlankPluginFeature<any>) {
  return !isClientFeature(feature);
}

export function createClientPluginRegistry(
  plugins: PlankClientPlugin[],
): ClientPluginRegistry {
  const pluginMap = new Map<string, PlankClientPlugin>();
  const features: ResolvedPluginFeature[] = [];

  for (const plugin of plugins) {
    const manifestDiagnostics = validatePluginManifest(plugin.manifest);
    if (manifestDiagnostics.length) {
      throw new Error(manifestDiagnostics.map((entry) => entry.message).join("; "));
    }
    if (pluginMap.has(plugin.manifest.id)) {
      throw new Error(`Duplicate plugin id: ${plugin.manifest.id}`);
    }
    pluginMap.set(plugin.manifest.id, plugin);
    for (const feature of plugin.features.filter(isClientFeature)) {
      features.push({
        pluginId: plugin.manifest.id,
        feature,
      });
    }
  }

  return {
    plugins,
    pluginMap,
    features,
  };
}

export function createServerPluginRegistry<TExtra = Record<string, never>>(
  plugins: PlankServerPlugin<TExtra>[],
): ServerPluginRegistry<TExtra> {
  const pluginMap = new Map<string, PlankServerPlugin<TExtra>>();
  const features: ResolvedPluginFeature[] = [];
  const boardTypeTemplateMap = new Map<string, PlankServerPlugin<TExtra>>();
  const cardTypeManifestMap = new Map<string, PlankServerPlugin<TExtra>>();

  for (const plugin of plugins) {
    const manifestDiagnostics = validatePluginManifest(plugin.manifest);
    if (manifestDiagnostics.length) {
      throw new Error(manifestDiagnostics.map((entry) => entry.message).join("; "));
    }
    if (pluginMap.has(plugin.manifest.id)) {
      throw new Error(`Duplicate plugin id: ${plugin.manifest.id}`);
    }
    pluginMap.set(plugin.manifest.id, plugin);
    for (const feature of plugin.features.filter(isServerFeature)) {
      features.push({
        pluginId: plugin.manifest.id,
        feature,
      });
    }

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
    features,
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

export function getEnabledPlugins(
  registry: { plugins: Array<{ manifest: { id: string } }> },
  records: WorkspaceExtensionStatusRecord[],
) {
  const enabledIds = new Set(getEnabledPluginIds(records));
  return registry.plugins.filter((plugin) => enabledIds.has(plugin.manifest.id));
}

function hasRequiredPermissions(
  plugin: PlankClientPlugin,
  extension: PlankUiExtensionDefinition,
) {
  return (extension.requiredPermissions ?? []).every((permission) =>
    plugin.manifest.capabilities.includes(permission),
  );
}

export function getEnabledUiExtensions({
  registry,
  enabledPluginIds,
  slot,
}: GetEnabledUiExtensionsOptions): ResolvedUiExtension[] {
  const enabledIds = new Set(enabledPluginIds);
  const pluginOrder = new Map(
    registry.plugins.map((plugin, index) => [plugin.manifest.id, index]),
  );
  const extensions: ResolvedUiExtension[] = [];

  for (const plugin of registry.plugins) {
    if (!enabledIds.has(plugin.manifest.id)) {
      continue;
    }

    const nativeExtensions = plugin.uiExtensions.filter(
      (extension) =>
        (!slot || extension.slot === slot) &&
        hasRequiredPermissions(plugin, extension),
    );

    for (const extension of nativeExtensions) {
      extensions.push({
        plugin,
        pluginId: plugin.manifest.id,
        extension,
        source: "native",
      });
    }
  }

  return extensions.sort((left, right) => {
    const orderDelta =
      (left.extension.order ?? 0) - (right.extension.order ?? 0);
    if (orderDelta !== 0) {
      return orderDelta;
    }

    const pluginDelta =
      (pluginOrder.get(left.pluginId) ?? 0) -
      (pluginOrder.get(right.pluginId) ?? 0);
    if (pluginDelta !== 0) {
      return pluginDelta;
    }

    return left.extension.id.localeCompare(right.extension.id);
  });
}

export interface DispatchCardEventOptions<TExtra = Record<string, never>> {
  registry: ServerPluginRegistry<any>;
  enabledPluginIds: string[];
  event: CardEventPayload;
  extra?: TExtra;
  getExtraForPlugin?: (plugin: PlankServerPlugin<any>) => TExtra;
  failFast?: boolean;
}

export interface DispatchCardEventResult {
  diagnostics: PluginRuntimeDiagnostic[];
}

function shouldHandleEvent<TExtra>(
  handler: PlankCardChangeHandler<TExtra>,
  event: CardEventPayload,
) {
  return handler.event === "*" || handler.event === event.name;
}

export async function dispatchCardEvent<TExtra = Record<string, never>>(
  options: DispatchCardEventOptions<TExtra>,
): Promise<DispatchCardEventResult> {
  const enabledIds = new Set(options.enabledPluginIds);
  const diagnostics: PluginRuntimeDiagnostic[] = [];

  for (const plugin of options.registry.plugins) {
    if (!enabledIds.has(plugin.manifest.id)) {
      diagnostics.push({
        kind: "handler-skipped",
        pluginId: plugin.manifest.id,
        message: `Plugin ${plugin.manifest.id} is not enabled for this event`,
      });
      continue;
    }

    for (const handler of plugin.cardChangeHandlers) {
      if (shouldHandleEvent(handler, options.event)) {
        const extra = options.getExtraForPlugin
          ? options.getExtraForPlugin(plugin)
          : (options.extra as TExtra);
        try {
          await handler.handle({
            event: options.event,
            extra,
          });
        } catch (error) {
          const diagnostic = {
            kind: "handler-failed" as const,
            pluginId: plugin.manifest.id,
            handlerId: handler.id,
            message:
              error instanceof Error
                ? error.message
                : `Plugin ${plugin.manifest.id} handler ${handler.id} failed`,
          };
          diagnostics.push(diagnostic);
          if (options.failFast) {
            throw error;
          }
        }
      }
    }
  }

  return { diagnostics };
}

export function createPermissionedServerServices({
  plugin,
  services,
}: {
  plugin: Pick<PlankServerPlugin, "manifest">;
  services: PlatformServerServices;
}): PlatformServerServices {
  return {
    cards: {
      get: async (cardId) => {
        assertPluginPermission(plugin, "cards:read");
        return await services.cards.get(cardId);
      },
    },
  };
}

export function createPermissionedClientServices({
  plugin,
  services,
}: {
  plugin: Pick<PlankClientPlugin, "manifest">;
  services: import("@plank/plugin-sdk").PlatformClientServices;
}): import("@plank/plugin-sdk").PlatformClientServices {
  return {
    navigation: services.navigation,
    cards: {
      create: async (...args) => {
        assertPluginPermission(plugin, "cards:write");
        return await services.cards.create(...args);
      },
      update: async (payload) => {
        assertPluginPermission(plugin, "cards:write");
        return await services.cards.update(payload);
      },
      move: async (...args) => {
        assertPluginPermission(plugin, "cards:write");
        return await services.cards.move(...args);
      },
      open: services.cards.open,
    },
    properties: {
      add: async (...args) => {
        assertPluginPermission(plugin, "cards:write");
        return await services.properties.add(...args);
      },
    },
    views: {
      updateConfig: async (config) => {
        assertPluginPermission(plugin, "boardViews:read");
        return await services.views.updateConfig(config);
      },
    },
    toast: services.toast,
  };
}

export type {
  PlankClientPlugin,
  PlankServerPlugin,
  PlatformUiSlotId,
  PlatformServerServices,
} from "@plank/plugin-sdk";
