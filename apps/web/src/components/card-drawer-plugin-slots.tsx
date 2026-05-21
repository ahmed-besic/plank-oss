import { ChevronDown } from 'lucide-react'
import { createPermissionedClientServices } from '@plank/plugin-runtime'
import type { PlatformClientServices, PlatformUiSlotId } from '@plank/plugin-sdk'
import type { ResolvedUiExtension } from '../lib/plugin-ui-extensions'
import type { BoardPageData } from '../lib/types'

export function CardDrawerPluginSlots({
  activePluginSlots,
  boardType,
  card,
  cardType,
  expandedPluginSlotId,
  propertyValues,
  selectedTagIds,
  services,
  setExpandedPluginSlotId,
  slot,
  tagDefinitions,
  title,
  workspaceSlug,
}: {
  activePluginSlots: ResolvedUiExtension[]
  boardType: BoardPageData['boardType']
  card: BoardPageData['cards'][number]
  cardType?: BoardPageData['cardTypes'][number]
  expandedPluginSlotId: string | null
  propertyValues: Record<string, unknown>
  selectedTagIds: string[]
  services?: PlatformClientServices
  setExpandedPluginSlotId: (value: string | null) => void
  slot: PlatformUiSlotId
  tagDefinitions: BoardPageData['tagDefinitions']
  title: string
  workspaceSlug: string
}) {
  const slotExtensions = activePluginSlots.filter(
    (entry) => entry.extension.slot === slot,
  )

  if (!slotExtensions.length) {
    return null
  }

  return (
    <div className="border-t border-zinc-100 bg-white px-4 py-2">
      <div className="flex items-center gap-2 overflow-x-auto">
        {slotExtensions.map(({ extension, plugin, pluginId }) => {
          const panelId = `${pluginId}:${extension.id}`
          const expanded = expandedPluginSlotId === panelId
          const pluginServices = services
            ? createPermissionedClientServices({ plugin, services })
            : undefined
          return (
            <div
              key={panelId}
              className="rounded-lg border border-zinc-200/80 bg-zinc-50/70"
            >
              <button
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:text-zinc-900"
                onClick={() =>
                  setExpandedPluginSlotId(expanded ? null : panelId)
                }
                type="button"
              >
                {extension.label}
                <ChevronDown
                  className={`h-3.5 w-3.5 transition ${expanded ? 'rotate-180' : ''}`}
                />
              </button>
              {expanded ? (
                <div className="max-h-28 overflow-auto border-t border-zinc-200/80 px-2.5 py-2 text-sm">
                  {extension.render({
                    slot,
                    pluginId,
                    workspaceSlug,
                    boardId: card.boardId,
                    services: pluginServices,
                    card: {
                      ...card,
                      title,
                      properties: propertyValues,
                      tagIds: selectedTagIds,
                    },
                    boardType,
                    cardType,
                    tagDefinitions,
                  })}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
