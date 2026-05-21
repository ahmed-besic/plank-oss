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

export function collectEnabledUiExtensionsForSlots({
  enabledPluginIds,
  registry,
  slots,
}: {
  enabledPluginIds: string[]
  registry: ClientPluginRegistry
  slots: PlatformUiSlotId[]
}) {
  return slots.flatMap((slot) =>
    collectEnabledUiExtensions({
      enabledPluginIds,
      registry,
      slot,
    }),
  )
}
