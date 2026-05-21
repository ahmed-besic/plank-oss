import { createPermissionedClientServices } from '@plank/plugin-runtime'
import type { PlankClientPlugin, PlatformClientServices } from '@plank/plugin-sdk'
import type { CommandPaletteItem } from '../../components/command-palette'
import type { BoardPageData } from '../../lib/types'

export function buildBoardCommandItems({
  activePlugins,
  boardData,
  boardId,
  platformServices,
  workspaceSlug,
}: {
  activePlugins: PlankClientPlugin[]
  boardData?: BoardPageData
  boardId: string
  platformServices: PlatformClientServices
  workspaceSlug: string
}): CommandPaletteItem[] {
  return activePlugins.flatMap((plugin) =>
    plugin.commands.map((command) => {
      const pluginServices = createPermissionedClientServices({
        plugin,
        services: platformServices,
      })
      return {
        id: command.id,
        label: command.label,
        keywords: command.keywords,
        run: async () =>
          command.run({
            workspaceSlug,
            boardId,
            addProperty: pluginServices.properties.add,
            createCard: async () => {
              const firstColumn = boardData?.board.columns[0]
              if (firstColumn) {
                await pluginServices.cards.create(
                  'Plugin card',
                  firstColumn.id,
                  boardData.cardTypes[0]?.id,
                )
              }
            },
            navigate: pluginServices.navigation.navigate,
            toast: pluginServices.toast.show,
            services: pluginServices,
          }),
      }
    }),
  )
}
