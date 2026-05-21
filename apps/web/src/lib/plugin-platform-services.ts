import { createPermissionedClientServices } from '@plank/plugin-runtime'
import type { PlatformClientServices, PlankClientPlugin } from '@plank/plugin-sdk'
import type { BoardActions } from './board-actions/types'

export function createBoardPlatformServices({
  actions,
  activeViewId,
  navigate,
  openCard,
  showToast,
}: {
  actions: BoardActions
  activeViewId?: string
  navigate: PlatformClientServices['navigation']['navigate']
  openCard: (cardId: string) => void
  showToast: (message: string) => void
}): PlatformClientServices {
  return {
    navigation: {
      openCard,
      navigate,
    },
    cards: {
      create: actions.createCard,
      update: actions.updateCard,
      move: actions.moveCard,
      open: openCard,
    },
    properties: {
      add: actions.addProperty,
    },
    views: {
      updateConfig: (config) =>
        activeViewId
          ? actions.updateViewConfig(activeViewId, config)
          : Promise.resolve(),
    },
    toast: {
      show: showToast,
    },
  }
}

export function createPluginBoardPlatformServices({
  plugin,
  ...options
}: {
  actions: BoardActions
  activeViewId?: string
  navigate: PlatformClientServices['navigation']['navigate']
  openCard: (cardId: string) => void
  plugin: Pick<PlankClientPlugin, 'manifest'>
  showToast: (message: string) => void
}): PlatformClientServices {
  return createPermissionedClientServices({
    plugin,
    services: createBoardPlatformServices(options),
  })
}
