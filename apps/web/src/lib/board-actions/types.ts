import type { BoardViewConfigValue } from '@plank/domain'

export interface BoardActions {
  addProperty: (
    name: string,
    type: string,
    config?: Record<string, unknown>,
    typeKey?: string,
  ) => Promise<void>
  deleteProperty: (propertyKey: string, typeKey?: string) => Promise<void>
  updatePropertyOptions: (
    propertyKey: string,
    options: Array<{ color?: string; label: string; value: string }>,
    typeKey?: string,
  ) => Promise<void>
  createCard: (
    title: string,
    columnId?: string,
    typeKey?: string,
    parentId?: string,
  ) => Promise<string | undefined>
  createSubTask: (
    parentId: string,
    title: string,
    typeKey?: string,
  ) => Promise<string | undefined>
  createColumn: (title: string) => Promise<void>
  moveCard: (
    cardId: string,
    columnId: string,
    previousOrderKey?: string,
    nextOrderKey?: string,
  ) => Promise<void>
  renameColumn: (columnId: string, title: string) => Promise<void>
  reorderColumn: (
    columnId: string,
    previousOrderKey?: string,
    nextOrderKey?: string,
  ) => Promise<void>
  deleteColumn: (columnId: string) => Promise<void>
  syncPluginViews: () => Promise<void>
  updateViewConfig: (
    instanceId: string,
    config: BoardViewConfigValue,
  ) => Promise<void>
  addBoardView: (
    definitionViewId: string,
    instanceMode: 'shared' | 'private',
  ) => Promise<string | undefined>
  removeBoardView: (instanceId: string) => Promise<void>
  updateCard: (payload: {
    cardId: string
    title?: string
    body?: unknown
    baseUpdatedAt?: number
    propertyUpdates?: Record<string, unknown>
    tagIds?: string[]
    statusKey?: string
  }) => Promise<{ stale?: boolean; serverUpdatedAt?: number } | void>
  deleteCard: (cardId: string) => Promise<void>
  requestCardUploadUrl: () => Promise<string>
  resolveCardFileUrl: (storageId: string) => Promise<string | null>
}
