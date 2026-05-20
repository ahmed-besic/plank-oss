import {
  getEnabledUiExtensions,
  type ClientPluginRegistry,
  type ResolvedUiExtension,
} from '@plank/plugin-runtime'
import type { PlatformUiSlotId } from '@plank/plugin-sdk'

export type { ResolvedUiExtension }

export function collectEnabledUiExtensions({
  enabledPluginIds,
  registry,
  slot,
}: {
  enabledPluginIds: string[]
  registry: ClientPluginRegistry
  slot: PlatformUiSlotId
}) {
  return getEnabledUiExtensions({
    registry,
    enabledPluginIds,
    slot,
  })
}
