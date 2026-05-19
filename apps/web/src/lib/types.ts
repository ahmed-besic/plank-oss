import type {
  BehaviorPackAuthoringMode,
  BehaviorCompileDiagnostic,
  BehaviorTargetType,
  CommentReactionKey,
  MentionRange,
  CardActivityKind,
  CardEventName,
  BoardTypeSummary,
  CardSummary,
  CardTypeSummary,
  TagDefinitionSummary,
  TraceStep,
  SimpleBehaviorRuleConfig,
  WorkspaceMemberSummary,
} from '@plank/domain'

export type CardChangeKind = CardActivityKind

export interface CardChangeSummary {
  actorId: string
  kind: CardChangeKind
  createdAt: number
  propertyKey?: string
}

export interface WorkspaceOverviewData {
  workspace: {
    id: string
    name: string
    slug: string
    role: 'owner' | 'admin' | 'member'
  }
  boards: Array<{
    id: string
    name: string
    slug: string
    workspaceId: string
    boardTypeId: string
    viewerSeenAt?: number
    latestExternalChange?: {
      actorId?: string
      cardId?: string
      kind?: CardChangeKind
      createdAt: number
    }
  }>
  boardTypes: Array<{
    id: string
    key: string
    name: string
    description?: string
    defaultViewIds: string[]
    defaultCardTypeKey: string
  }>
  members: Array<{
    id: string
    userId: string
    name?: string
    email?: string
    role: 'owner' | 'admin' | 'member'
    createdAt: number
  }>
  pendingInvites: Array<{
    id: string
    email: string
    role: 'admin' | 'member'
    createdAt: number
    expiresAt: number
    createdBy: string
  }>
  extensions: Array<{
    manifest: {
      id: string
      name: string
      version: string
      description?: string
      hooks: string[]
      capabilities: string[]
    }
    views: Array<{
      id: string
      label: string
      description?: string
    }>
    propertyTypes: Array<{
      id: string
      label: string
      description?: string
    }>
    installed: boolean
    status: 'enabled' | 'disabled'
  }>
  viewerUserId?: string
}

export interface BoardPageData {
  workspace: {
    id: string
    name: string
    slug: string
  }
  board: {
    id: string
    name: string
    workspaceId: string
    boardTypeId: string
    columns: Array<{
      id: string
      statusKey: string
      title: string
      orderKey: string
    }>
  }
  boardType: BoardTypeSummary
  cardTypes: CardTypeSummary[]
  tagDefinitions: TagDefinitionSummary[]
  cards: Array<
    CardSummary & {
      scopeId?: string
      latestExternalChange?: {
        actorId?: string
        kind?: CardChangeKind
        createdAt: number
      }
      viewerSeenAt?: number
    }
  >
  members: WorkspaceMemberSummary[]
  views: Array<{
    _id?: string
    id?: string
    instanceId?: string
    definitionViewId?: string
    viewId: string
    pluginId?: string
    kind: string
    label: string
    orderKey: string
    isDefault: boolean
    instanceMode?: 'shared' | 'private'
    config?: Record<string, unknown>
  }>
  activeViewInstanceId?: string
  activeDefinitionViewId?: string
  activeViewMode?: 'shared' | 'private'
  enabledPluginIds: string[]
  viewerUserId?: string
}

export interface BoardTypeData {
  id: string
  key: string
  name: string
  description?: string
  defaultViewIds: string[]
  defaultCardTypeKey: string
  lifecycleConfig: {
    statuses: BoardTypeSummary['lifecycleConfig']['statuses']
    initialStatusKey: string
  }
}

export interface CardTypeData {
  id: string
  key: string
  name: string
  description?: string
  schemaVersion: number
  propertiesSchema: CardTypeSummary['propertiesSchema']
  defaultTagIds: string[]
}

export interface TagData {
  id: string
  key: string
  name: string
  color?: string
  description?: string
}

export interface BehaviorPackData {
  id: string
  workspaceId: string
  key: string
  name: string
  description?: string
  allowedTargetTypes: BehaviorTargetType[]
  source: string
  compileDiagnostics: BehaviorCompileDiagnostic[]
  status: 'draft' | 'active' | 'archived'
  authoringMode?: BehaviorPackAuthoringMode
  simpleRuleConfig?: SimpleBehaviorRuleConfig
  version: number
  failFast?: boolean
  createdBy: string
  createdAt: number
  updatedAt: number
  lastCompiledAt?: number
  lastActivatedAt?: number
}

export interface BehaviorBindingData {
  id: string
  workspaceId: string
  targetType: BehaviorTargetType
  targetId: string
  behaviorPackId: string
  priority: number
  enabled: boolean
  createdBy: string
  createdAt: number
  updatedAt: number
  packName?: string
  packStatus?: 'draft' | 'active' | 'archived'
  packAuthoringMode?: BehaviorPackAuthoringMode
}

export interface AutomationRunData {
  _id?: string
  workspaceId: string
  workflowEventId?: string
  eventId?: string
  rootEventId?: string
  parentEventId?: string
  eventName: CardEventName
  cardId: string
  boardId: string
  actorId: string
  origin?: 'user' | 'automation'
  depth: number
  status: 'ok' | 'error' | 'partial' | 'guard_stopped'
  matchedRuleIds: string[]
  actionsPlanned: number
  actionsExecuted: number
  durationMs: number
  guardReason?: string
  error?: string
  trace: TraceStep[]
  createdAt: number
}

export interface NotificationData {
  _id?: string
  workspaceId: string
  recipientUserId: string
  actorId: string
  boardId?: string
  cardId?: string
  viewInstanceId?: string
  workflowEventId?: string
  kind?: 'mention_comment' | 'mention_body'
  commentId?: string
  previewText?: string
  message: string
  readAt?: number
  createdAt: number
}

export interface CardCommentData {
  id: string
  workspaceId: string
  boardId: string
  cardId: string
  authorUserId: string
  bodyText: string
  mentions: MentionRange[]
  reactionCounts: Partial<Record<CommentReactionKey, number>>
  viewerReactions: CommentReactionKey[]
  editedAt?: number
  createdAt: number
}

export interface BoardPresenceEntry {
  userId: string
  name?: string
  email?: string
  role?: 'owner' | 'admin' | 'member'
  lastHeartbeatAt: number
  isViewer: boolean
}

export interface BoardActivityEntry {
  id: string
  actorId: string
  actorLabel: string
  cardId: string
  cardTitle: string
  kind: CardChangeKind
  createdAt: number
  propertyKeys?: string[]
}
