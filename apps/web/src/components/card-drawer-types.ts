import type {
  PlankCardSlotDefinition,
  PlankPropertyTypeDefinition,
} from '@plank/plugin-sdk'
import type { BoardPageData } from '../lib/types'

export type BlockNoteDoc = Array<Record<string, unknown>>

export type DrawerSaveResponse = {
  stale?: boolean
  serverUpdatedAt?: number
}

export type CardDrawerProps = {
  activePluginPropertyTypes: PlankPropertyTypeDefinition[]
  activePluginSlots: PlankCardSlotDefinition[]
  boardType: BoardPageData['boardType']
  cardType?: BoardPageData['cardTypes'][number]
  tagDefinitions: BoardPageData['tagDefinitions']
  members: BoardPageData['members']
  viewerUserId?: BoardPageData['viewerUserId']
  card: BoardPageData['cards'][number]
  workspaceSlug: string
  commentsOpen?: boolean
  highlightedCommentId?: string
  focusTarget?: 'description' | 'comments'
  onAddProperty: (
    name: string,
    type: string,
    config?: Record<string, unknown>,
    typeKey?: string,
  ) => Promise<void>
  onDeleteCard: () => Promise<void>
  onDeleteProperty: (propertyKey: string, typeKey?: string) => Promise<void>
  onUpdatePropertyOptions: (
    propertyKey: string,
    options: Array<{ color?: string; label: string; value: string }>,
    typeKey?: string,
  ) => Promise<void>
  onRequestCardUploadUrl: () => Promise<string>
  onResolveCardFileUrl: (storageId: string) => Promise<string | null>
  onCreateSubTask?: (title: string) => Promise<string | undefined>
  onOpenCard: (cardId: string, boardId?: string) => void
  onToggleComments?: () => void
  onCloseComments?: () => void
  subTasks?: BoardPageData['cards']
  onClose: () => void
  onSave: (payload: {
    title: string
    body: BoardPageData['cards'][number]['body']
    propertyUpdates: Record<string, unknown>
    tagIds: string[]
    statusKey?: string
    baseUpdatedAt?: number
  }) => Promise<DrawerSaveResponse | void>
  onSaveDefaultProperties?: (
    typeKey: string,
    propertyUpdates: Record<string, unknown>,
  ) => Promise<void>
}
