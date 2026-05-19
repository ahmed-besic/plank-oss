import { ChevronDown } from 'lucide-react'
import type { PlankCardSlotDefinition } from '@plank/plugin-sdk'
import type { BoardPageData } from '../lib/types'

export function CardDrawerPluginSlots({
  activePluginSlots,
  boardType,
  card,
  cardType,
  expandedPluginSlotId,
  propertyValues,
  selectedTagIds,
  setExpandedPluginSlotId,
  tagDefinitions,
  title,
}: {
  activePluginSlots: PlankCardSlotDefinition[]
  boardType: BoardPageData['boardType']
  card: BoardPageData['cards'][number]
  cardType?: BoardPageData['cardTypes'][number]
  expandedPluginSlotId: string | null
  propertyValues: Record<string, unknown>
  selectedTagIds: string[]
  setExpandedPluginSlotId: (value: string | null) => void
  tagDefinitions: BoardPageData['tagDefinitions']
  title: string
}) {
  if (!activePluginSlots.length) {
    return null
  }

  return (
    <div className="border-t border-zinc-100 bg-white px-4 py-2">
      <div className="flex items-center gap-2 overflow-x-auto">
        {activePluginSlots.map((slot) => {
          const expanded = expandedPluginSlotId === slot.id
          return (
            <div
              key={slot.id}
              className="rounded-lg border border-zinc-200/80 bg-zinc-50/70"
            >
              <button
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:text-zinc-900"
                onClick={() =>
                  setExpandedPluginSlotId(expanded ? null : slot.id)
                }
                type="button"
              >
                {slot.title}
                <ChevronDown
                  className={`h-3.5 w-3.5 transition ${expanded ? 'rotate-180' : ''}`}
                />
              </button>
              {expanded ? (
                <div className="max-h-28 overflow-auto border-t border-zinc-200/80 px-2.5 py-2 text-sm">
                  {slot.render({
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
