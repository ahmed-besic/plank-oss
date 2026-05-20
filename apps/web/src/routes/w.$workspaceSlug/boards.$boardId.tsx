import { convexQuery } from '@convex-dev/react-query'
import { useMutation, useQuery } from '@tanstack/react-query'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useConvexAuth,
} from 'convex/react'
import { createPortal } from 'react-dom'
import {
  Activity,
  Bot,
  CalendarDays,
  ChevronDown,
  Command,
  Inbox,
  Lock,
  ListTodo,
  Plus,
  Plug,
  Search,
  Settings2,
  Shield,
  Sparkles,
  SquareKanban,
  Trash2,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Input, cn } from '@plank/ui'
import type { BoardViewConfigScalar } from '@plank/domain'
import type { PlatformClientServices } from '@plank/plugin-sdk'
import { createPermissionedClientServices } from '@plank/plugin-runtime'
import { toast } from 'sonner'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { CardDrawer } from '../../components/card-drawer'
import { WorkspaceShell } from '../../components/workspace-shell'
import { CommandPalette } from '../../components/command-palette'
import type { CommandPaletteItem } from '../../components/command-palette'
import { CardCommentsPanel } from '../../features/collaboration/CardCommentsPanel'
import { useBoardActions } from '../../lib/use-board-actions'
import { createBoardPlatformServices } from '../../lib/plugin-platform-services'
import { collectEnabledUiExtensions } from '../../lib/plugin-ui-extensions'
import { useHydrated } from '../../lib/use-hydrated'
import { useOnlineState } from '../../lib/use-online-state'
import { usePlankApp } from '../../lib/providers'
import type {
  BoardActivityEntry,
  BoardPageData,
  BoardPresenceEntry,
  WorkspaceOverviewData,
} from '../../lib/types'
import { getMemberDisplayName, getMemberInitials } from '../../lib/member-display'

const createRoute = createFileRoute as any

export const Route = createRoute('/w/$workspaceSlug/boards/$boardId')({
  validateSearch: (search: any) => ({
    card: typeof search.card === 'string' ? search.card : undefined,
    commentId: typeof search.commentId === 'string' ? search.commentId : undefined,
    focus:
      search.focus === 'comments' || search.focus === 'description'
        ? search.focus
        : undefined,
    view: typeof search.view === 'string' ? search.view : undefined,
  }),
  component: BoardRoute,
})

type BoardUtilityPage = 'none' | 'extensions' | 'activity'
type ExtensionCategory = 'all' | 'core' | 'productivity' | 'automation'
const BOARD_PRESENCE_ACTIVE_MS = 90_000
const BOARD_PRESENCE_HEARTBEAT_MS = 45_000

function toBoardViewConfigScalars(values: Record<string, unknown>) {
  const scalars: Record<string, BoardViewConfigScalar> = {}
  for (const [key, value] of Object.entries(values)) {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      scalars[key] = value
    }
  }
  return scalars
}

function getViewIcon(viewId: string, label: string) {
  const normalized = `${viewId} ${label}`.toLowerCase()
  if (normalized.includes('focus')) {
    return ListTodo
  }
  if (
    normalized.includes('timeline') ||
    normalized.includes('calendar') ||
    normalized.includes('roadmap')
  ) {
    return CalendarDays
  }
  return SquareKanban
}

function getExtensionCategory(
  extension: WorkspaceOverviewData['extensions'][number],
): Exclude<ExtensionCategory, 'all'> {
  const id = extension.manifest.id.toLowerCase()
  const hooks = extension.manifest.hooks.join(' ').toLowerCase()

  if (id.startsWith('core-') || id.includes('kanban')) {
    return 'core'
  }

  if (id.includes('behavior') || hooks.includes('registercardchange')) {
    return 'automation'
  }

  return 'productivity'
}

function formatRelativeTime(timestamp: number) {
  const diffMs = Date.now() - timestamp
  const diffMinutes = Math.max(1, Math.round(diffMs / 60_000))
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`
  }
  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours}h ago`
  }
  const diffDays = Math.round(diffHours / 24)
  return `${diffDays}d ago`
}

function getLabelInitials(label: string) {
  const parts = label.split(/[\s@._-]+/).filter(Boolean)
  if (parts.length === 0) {
    return '?'
  }
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

function isPersistedCardId(cardId: string | undefined): cardId is Id<'cards'> {
  return typeof cardId === 'string' && !cardId.startsWith('optimistic:')
}

function getActivitySummary(entry: BoardActivityEntry) {
  switch (entry.kind) {
    case 'new_card':
      return 'created a card'
    case 'move':
      return 'moved a card'
    case 'delete':
      return 'deleted a card'
    case 'title':
      return 'updated the title'
    case 'description':
      return 'updated the description'
    case 'property':
      return entry.propertyKeys?.length
        ? `updated ${entry.propertyKeys.join(', ')}`
        : 'updated properties'
    case 'tag':
      return 'changed tags'
    default:
      return 'changed a card'
  }
}

function BoardRoute() {
  const { boardId, workspaceSlug } = Route.useParams()
  const search = Route.useSearch()
  const navigate = useNavigate()
  const hydrated = useHydrated()
  const auth = useConvexAuth()
  const online = useOnlineState()
  const { convexClient, pluginRegistry, queryClient } = usePlankApp()
  const boardMenuRef = useRef<HTMLDivElement>(null)
  const viewMenuRef = useRef<HTMLDivElement>(null)
  const addViewButtonRef = useRef<HTMLButtonElement>(null)
  const boardSeenInFlightRef = useRef(false)
  const lastBoardSeenRequestedAtRef = useRef<number | null>(null)
  const viewerBoardSeenAtRef = useRef(0)
  const cardSeenInFlightRef = useRef(false)
  const lastCardSeenRequestKeyRef = useRef<string | null>(null)
  const heartbeatInFlightRef = useRef(false)
  const [commandOpen, setCommandOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [isBoardMenuOpen, setIsBoardMenuOpen] = useState(false)
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false)
  const [viewMenuPosition, setViewMenuPosition] = useState({ left: 0, top: 0 })
  const [viewContextMenu, setViewContextMenu] = useState<{
    left: number
    top: number
    viewId: string
    label: string
  } | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [utilityPage, setUtilityPage] = useState<BoardUtilityPage>('none')
  const [extensionCategory, setExtensionCategory] =
    useState<ExtensionCategory>('all')
  const overviewOptions = convexQuery(api.workspaces.getOverview, {
    workspaceSlug,
  })
  const overviewQuery = useQuery({
    ...overviewOptions,
    enabled: hydrated && auth.isAuthenticated,
  })
  const boardOptions = convexQuery(api.boards.getBoardPage, {
    workspaceSlug,
    boardId: boardId as never,
    viewId: search.view,
  })
  const boardQuery = useQuery({
    ...boardOptions,
    enabled: hydrated && auth.isAuthenticated,
  })
  const searchOptions = convexQuery(api.search.searchBoardTitles, {
    workspaceSlug,
    boardId: boardId as never,
    viewId: search.view,
    term: searchTerm,
  })
  const searchQuery = useQuery({
    ...searchOptions,
    enabled: hydrated && auth.isAuthenticated && searchTerm.trim().length > 0,
  })
  const actions = useBoardActions({
    boardId,
    viewId: search.view,
    workspaceSlug,
  })
  const presenceOptions = convexQuery(api.boards.listBoardPresence, {
    workspaceSlug,
    boardId: boardId as never,
  })
  const presenceQuery = useQuery({
    ...presenceOptions,
    enabled: hydrated && auth.isAuthenticated,
  })
  const activityOptions = convexQuery(api.boards.getBoardActivityPage, {
    workspaceSlug,
    boardId: boardId as never,
    viewId: search.view,
    limit: 40,
  })
  const activityQuery = useQuery({
    ...activityOptions,
    enabled: hydrated && auth.isAuthenticated && utilityPage === 'activity',
  })
  const toggleExtension = useMutation({
    mutationFn: async ({
      pluginId,
      status,
    }: {
      pluginId: string
      status: 'enabled' | 'disabled'
    }) =>
      convexClient.mutation(api.workspaces.setExtensionStatus, {
        workspaceSlug,
        pluginId,
        status,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: overviewOptions.queryKey }),
        queryClient.invalidateQueries({ queryKey: boardOptions.queryKey }),
      ])
    },
  })
  useEffect(() => {
    const onHotkey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandOpen((current) => !current)
      }
    }
    window.addEventListener('keydown', onHotkey)
    return () => window.removeEventListener('keydown', onHotkey)
  }, [])
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (
        viewMenuRef.current &&
        !viewMenuRef.current.contains(event.target as Node)
      ) {
        setIsViewMenuOpen(false)
      }
      setViewContextMenu(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [])
  useEffect(() => {
    if (!isViewMenuOpen) {
      return
    }
    const updatePosition = () => {
      const rect = addViewButtonRef.current?.getBoundingClientRect()
      if (!rect) {
        return
      }
      setViewMenuPosition({
        left: Math.min(rect.left, window.innerWidth - 240),
        top: rect.bottom + 8,
      })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isViewMenuOpen])
  useEffect(() => {
    if (!searchOpen) {
      return
    }
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSearchOpen(false)
      }
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [searchOpen])

  useEffect(() => {
    setIsBoardMenuOpen(false)
  }, [boardId])

  useEffect(() => {
    setUtilityPage('none')
  }, [boardId])

  useEffect(() => {
    if (!isBoardMenuOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!boardMenuRef.current?.contains(event.target as Node)) {
        setIsBoardMenuOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsBoardMenuOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isBoardMenuOpen])

  const boardData = boardQuery.data as BoardPageData | undefined
  const overviewData = overviewQuery.data as WorkspaceOverviewData | undefined
  const boardPresence = useMemo(
    () =>
      ((presenceQuery.data?.items ?? []) as BoardPresenceEntry[]).filter(
        (entry) =>
          entry.lastHeartbeatAt > Date.now() - BOARD_PRESENCE_ACTIVE_MS,
      ),
    [presenceQuery.data?.items],
  )
  const overviewBoard = overviewData?.boards.find(
    (board) => board.id === boardId,
  )

  useEffect(() => {
    viewerBoardSeenAtRef.current = overviewBoard?.viewerSeenAt ?? 0
    lastBoardSeenRequestedAtRef.current = null
  }, [boardId])

  useEffect(() => {
    if (!overviewBoard) return
    if (overviewBoard.viewerSeenAt != null) {
      viewerBoardSeenAtRef.current = Math.max(
        viewerBoardSeenAtRef.current,
        overviewBoard.viewerSeenAt,
      )
    }
  }, [overviewBoard])

  const boardActivity = (activityQuery.data?.items ??
    []) as BoardActivityEntry[]
  const searchResults = searchQuery.data as
    | Array<{ id: string; title: string; columnId: string }>
    | undefined
  const activeViewId =
    boardData?.activeViewInstanceId ??
    boardData?.views.find((view) => view.isDefault)?.instanceId ??
    boardData?.views[0]?.instanceId
  const activeDefinitionViewId =
    boardData?.activeDefinitionViewId ??
    boardData?.views.find((view) => view.instanceId === activeViewId)
      ?.definitionViewId ??
    'core-kanban:board'
  const unreadCardIds = useMemo(() => {
    if (!boardData) {
      return []
    }
    const boardSeenAt = Math.max(
      viewerBoardSeenAtRef.current,
      overviewBoard?.viewerSeenAt ?? 0,
    )
    return boardData.cards
      .filter((card) => {
        const latestExternalAt = card.latestExternalChange?.createdAt ?? 0
        const seenAt = card.viewerSeenAt ?? boardSeenAt
        return (
          latestExternalAt > seenAt &&
          card.latestExternalChange?.actorId !== boardData.viewerUserId
        )
      })
      .map((card) => card.id)
  }, [boardData, overviewBoard?.viewerSeenAt])
  const updateSearch = (updater: any) =>
    void navigate({
      search: updater,
    } as any)

  const switchBoard = (nextBoardId: string) => {
    setIsBoardMenuOpen(false)
    void navigate({
      params: {
        boardId: nextBoardId,
        workspaceSlug,
      },
      search: {
        card: undefined,
        view: activeViewId,
      },
      to: '/w/$workspaceSlug/boards/$boardId',
    } as never)
  }
  const prefetchBoard = (nextBoardId: string) => {
    if (!hydrated || !auth.isAuthenticated) {
      return
    }
    void queryClient.prefetchQuery(
      convexQuery(api.boards.getBoardPage, {
        workspaceSlug,
        boardId: nextBoardId as never,
        viewId: activeViewId,
      }),
    )
  }

  const activePlugins = useMemo(() => {
    if (!boardData) {
      return []
    }
    const enabledSet = new Set(boardData.enabledPluginIds)
    return pluginRegistry.plugins.filter((plugin) =>
      enabledSet.has(plugin.manifest.id),
    )
  }, [boardData, pluginRegistry.plugins])

  const activePluginPropertyTypes = useMemo(
    () => activePlugins.flatMap((plugin) => plugin.propertyTypes),
    [activePlugins],
  )
  const activePluginSlots = useMemo(
    () =>
      boardData
        ? collectEnabledUiExtensions({
            registry: pluginRegistry,
            enabledPluginIds: boardData.enabledPluginIds,
            slot: 'card.drawer.panels',
          })
        : [],
    [boardData, pluginRegistry],
  )
  const platformServices = useMemo<PlatformClientServices>(() => {
    const openCard = (cardId: string) =>
      updateSearch((current: any) => ({
        ...current,
        card: cardId,
        view: activeViewId ?? current.view,
      }))

    return createBoardPlatformServices({
      actions,
      activeViewId,
      navigate: ({ to, search: nextSearch }) =>
        void navigate({
          search: nextSearch as any,
          to: to as never,
        } as any),
      openCard,
      showToast: (message) => toast(message),
    })
  }, [actions, activeViewId, navigate])
  const commands = useMemo<CommandPaletteItem[]>(() => {
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
  }, [
    activePlugins,
    boardData?.board.columns,
    boardData?.cardTypes,
    boardId,
    platformServices,
    workspaceSlug,
  ])
  const boardHeaderExtensions = useMemo(
    () =>
      boardData
        ? collectEnabledUiExtensions({
            registry: pluginRegistry,
            enabledPluginIds: boardData.enabledPluginIds,
            slot: 'board.header.actions',
          })
        : [],
    [boardData, pluginRegistry],
  )

  const activeCard = boardData?.cards.find((card) => card.id === search.card)
  const activeCardType = boardData?.cardTypes.find(
    (cardType) => cardType.id === activeCard?.typeKey,
  )
  useEffect(() => {
    if (!boardData || !search.card || activeCard) {
      return
    }
    updateSearch((current: any) => ({
      ...current,
      card: undefined,
      commentId: undefined,
      focus: undefined,
    }))
  }, [activeCard, boardData, search.card])
  const persistedActiveCardId = isPersistedCardId(activeCard?.id)
    ? activeCard.id
    : null
  const subTasksEnabled =
    hydrated &&
    auth.isAuthenticated &&
    Boolean(persistedActiveCardId) &&
    activeCardType?.hierarchyPolicy?.supportsChildren === true
  const subTasksQuery = useQuery({
    ...convexQuery(api.cards.listSubTasks, {
      workspaceSlug,
      boardId: boardId as never,
      parentId: persistedActiveCardId,
    }),
    enabled: subTasksEnabled,
  })
  const activeCardSubTasks = subTasksQuery.data as
    | BoardPageData['cards']
    | undefined

  useEffect(() => {
    if (!boardData || !overviewBoard || !hydrated || !auth.isAuthenticated) {
      return
    }

    const latestExternalAt = overviewBoard.latestExternalChange?.createdAt ?? 0
    const latestExternalActorId = overviewBoard.latestExternalChange?.actorId
    const seenAt = Math.max(
      viewerBoardSeenAtRef.current,
      overviewBoard.viewerSeenAt ?? 0,
    )

    if (latestExternalAt <= seenAt) {
      return
    }

    if (latestExternalActorId === overviewData?.viewerUserId) {
      viewerBoardSeenAtRef.current = latestExternalAt
      queryClient.setQueryData<WorkspaceOverviewData | undefined>(
        overviewOptions.queryKey,
        (current) =>
          current
            ? {
                ...current,
                boards: current.boards.map((board) =>
                  board.id === boardId
                    ? {
                        ...board,
                        viewerSeenAt: Math.max(
                          board.viewerSeenAt ?? 0,
                          latestExternalAt,
                        ),
                      }
                    : board,
                ),
              }
            : current,
      )
      return
    }

    if (boardSeenInFlightRef.current) {
      return
    }
    if (lastBoardSeenRequestedAtRef.current === latestExternalAt) {
      return
    }
    boardSeenInFlightRef.current = true
    lastBoardSeenRequestedAtRef.current = latestExternalAt

    void convexClient
      .mutation(api.boards.markBoardSeen, {
        workspaceSlug,
        boardId: boardId as never,
        seenAt: latestExternalAt,
      })
      .then(() => {
        viewerBoardSeenAtRef.current = Math.max(
          viewerBoardSeenAtRef.current,
          latestExternalAt,
        )
        queryClient.setQueryData<WorkspaceOverviewData | undefined>(
          overviewOptions.queryKey,
          (current) =>
            current
              ? {
                  ...current,
                  boards: current.boards.map((board) =>
                    board.id === boardId
                      ? {
                          ...board,
                          viewerSeenAt: Math.max(
                            board.viewerSeenAt ?? 0,
                            latestExternalAt,
                          ),
                        }
                      : board,
                  ),
                }
              : current,
        )
      })
      .catch(() => {
        lastBoardSeenRequestedAtRef.current = null
      })
      .finally(() => {
        boardSeenInFlightRef.current = false
      })
  }, [
    boardId,
    boardData,
    overviewBoard,
    overviewData?.viewerUserId,
    hydrated,
    auth.isAuthenticated,
    overviewOptions.queryKey,
    convexClient,
    queryClient,
  ])

  useEffect(() => {
    if (
      !activeCard ||
      !persistedActiveCardId ||
      !boardData ||
      !hydrated ||
      !auth.isAuthenticated
    ) {
      return
    }

    const latestExternalAt = activeCard.latestExternalChange?.createdAt ?? 0
    const latestExternalActorId = activeCard.latestExternalChange?.actorId
    const existingSeenAt = activeCard.viewerSeenAt ?? viewerBoardSeenAtRef.current

    if (latestExternalAt <= existingSeenAt) {
      return
    }

    if (latestExternalActorId === boardData.viewerUserId) {
      queryClient.setQueryData<BoardPageData | undefined>(
        boardOptions.queryKey,
        (current) =>
          current
            ? {
                ...current,
                cards: current.cards.map((card) =>
                  card.id === activeCard.id
                    ? {
                        ...card,
                        viewerSeenAt: Math.max(
                          card.viewerSeenAt ?? 0,
                          latestExternalAt,
                        ),
                      }
                    : card,
                ),
              }
            : current,
      )
      return
    }

    const requestKey = `${activeCard.id}:${latestExternalAt}`
    if (cardSeenInFlightRef.current) {
      return
    }
    if (lastCardSeenRequestKeyRef.current === requestKey) {
      return
    }

    cardSeenInFlightRef.current = true
    lastCardSeenRequestKeyRef.current = requestKey

    void convexClient
      .mutation(api.cards.markCardSeen, {
        workspaceSlug,
        boardId: boardId as never,
        cardId: persistedActiveCardId,
        seenAt: latestExternalAt,
      })
      .then(() => {
        queryClient.setQueryData<BoardPageData | undefined>(
          boardOptions.queryKey,
          (current) =>
            current
              ? {
                  ...current,
                  cards: current.cards.map((card) =>
                    card.id === activeCard.id
                      ? {
                          ...card,
                          viewerSeenAt: Math.max(
                            card.viewerSeenAt ?? 0,
                            latestExternalAt,
                          ),
                        }
                      : card,
                  ),
                }
              : current,
        )
      })
      .catch(() => {
        lastCardSeenRequestKeyRef.current = null
      })
      .finally(() => {
        cardSeenInFlightRef.current = false
      })
  }, [
    persistedActiveCardId,
    activeCard?.latestExternalChange?.actorId,
    activeCard?.latestExternalChange?.createdAt,
    boardData,
    boardId,
    hydrated,
    auth.isAuthenticated,
    boardOptions.queryKey,
    convexClient,
    queryClient,
  ])

  useEffect(() => {
    if (!hydrated || !auth.isAuthenticated || !boardData) {
      return
    }

    const sendHeartbeat = () => {
      if (document.visibilityState !== 'visible') {
        return
      }
      if (heartbeatInFlightRef.current) {
        return
      }
      heartbeatInFlightRef.current = true
      void convexClient
        .mutation(api.boards.heartbeatBoardPresence, {
          workspaceSlug,
          boardId: boardId as never,
        })
        .finally(() => {
          heartbeatInFlightRef.current = false
        })
    }

    sendHeartbeat()
    const interval = window.setInterval(
      sendHeartbeat,
      BOARD_PRESENCE_HEARTBEAT_MS,
    )
    const onVisibilityChange = () => sendHeartbeat()
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [
    boardData?.board.id,
    hydrated,
    auth.isAuthenticated,
    convexClient,
    boardId,
    workspaceSlug,
  ])

  const pluginViews = activePlugins.flatMap((plugin) => plugin.views)
  const availableViewOptions = boardData
    ? pluginViews.filter((view) => {
        const sharingPolicy = view.sharingPolicy ?? 'shared_with_private'
        if (sharingPolicy === 'force_private') {
          return true
        }
        return !boardData.views.some(
          (persisted) =>
            persisted.definitionViewId === view.id &&
            persisted.instanceMode === 'shared',
        )
      })
    : []
  const resolvedPluginView = pluginViews.find(
    (view) => view.id === activeDefinitionViewId,
  )
  const pluginView =
    resolvedPluginView ??
    pluginViews.find((view) => view.defaultForBoard) ??
    pluginViews[0]
  const pluginViewOwner = pluginView
    ? activePlugins.find((plugin) =>
        plugin.views.some((view) => view.id === pluginView.id),
      )
    : undefined
  const renderViewId = pluginView?.id ?? activeDefinitionViewId ?? 'unknown-view'
  const activeViewRecord = boardData?.views.find(
    (view) => view.instanceId === activeViewId,
  )
  const saveBoardDefaultProperties = async (
    typeKey: string,
    propertyUpdates: Record<string, unknown>,
  ) => {
    if (!activeViewId) {
      toast.error('No active board view selected.')
      return
    }
    const currentConfig =
      activeViewRecord?.config && typeof activeViewRecord.config === 'object'
        ? (activeViewRecord.config)
        : {}
    const byType =
      currentConfig.kanbanDefaultPropertyValuesByType &&
      typeof currentConfig.kanbanDefaultPropertyValuesByType === 'object'
        ? (currentConfig.kanbanDefaultPropertyValuesByType as Record<
            string,
            Record<string, BoardViewConfigScalar>
          >)
        : {}
    await actions.updateViewConfig(activeViewId, {
      ...currentConfig,
      kanbanDefaultPropertyValuesByType: {
        ...byType,
        [typeKey]: toBoardViewConfigScalars(propertyUpdates),
      },
    })
    toast.success('Saved as board default properties.')
  }
  const removableViewCount = boardData?.views.length ?? 0
  const filteredExtensions = (overviewData?.extensions ?? []).filter(
    (extension) =>
      extensionCategory === 'all' ||
      getExtensionCategory(extension) === extensionCategory,
  )

  useEffect(() => {
    if (!boardData || !activeViewId) {
      return
    }
    if (search.view === activeViewId) {
      return
    }
    updateSearch((current: any) => ({
      ...current,
      view: activeViewId,
    }))
  }, [activeViewId, boardData, search.view])

  const openSettings = () =>
    void navigate({
      params: {
        workspaceSlug,
      },
      to: '/w/$workspaceSlug/settings',
    } as never)

  const removeView = async (instanceId: string) => {
    if (!boardData || boardData.views.length <= 1) {
      toast.error('A board needs at least one view.')
      return
    }
    const targetView = boardData.views.find((view) => view.instanceId === instanceId)
    if (targetView?.instanceMode === 'private') {
      const confirmed = window.confirm(
        `Delete "${targetView.label}"?\n\nThis will permanently delete that private view and all cards inside it.`,
      )
      if (!confirmed) {
        return
      }
    }
    const nextViewId =
      activeViewId === instanceId
        ? boardData.views.find((view) => view.instanceId !== instanceId)?.instanceId
        : activeViewId
    await actions.removeBoardView(instanceId)
    setViewContextMenu(null)
    setIsViewMenuOpen(false)
    if (nextViewId && nextViewId !== activeViewId) {
      setUtilityPage('none')
      updateSearch((current: any) => ({
        ...current,
        view: nextViewId,
      }))
    }
  }

  return (
    <>
      <AuthLoading>
        <div className="p-8 text-muted-violet">Loading board…</div>
      </AuthLoading>
      <Unauthenticated>
        <div className="p-8">
          <Button onClick={() => void navigate({ to: '/login' })}>
            Sign in to open this board
          </Button>
        </div>
      </Unauthenticated>
      <Authenticated>
        {overviewData && boardData ? (
          <WorkspaceShell
            activeBoardId={boardId}
            overview={overviewData}
            section="board"
          >
            <div className="flex min-h-[calc(100vh-64px)] flex-col">
              <header className="sticky top-0 z-20 border-b border-border-subtle bg-cloud-white/80 backdrop-blur-xl">
                <div className="flex min-h-14 items-center justify-between gap-4 px-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="relative min-w-0" ref={boardMenuRef}>
                      <button
                        className="flex max-w-full items-center gap-2 rounded-xl px-2.5 py-1.5 transition-all duration-200 hover:bg-surface-sunken"
                        onClick={() => setIsBoardMenuOpen((open) => !open)}
                        type="button"
                      >
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-electric-violet to-accent-teal text-white shadow-sm">
                          <Command className="h-3.5 w-3.5" />
                        </div>
                        <span className="truncate text-sm font-semibold tracking-tight text-text-primary">
                          {boardData.board.name}
                        </span>
                        <ChevronDown
                          className={cn(
                            'h-3.5 w-3.5 shrink-0 text-text-tertiary transition-transform duration-200',
                            isBoardMenuOpen ? 'rotate-180' : '',
                          )}
                        />
                      </button>

                      {isBoardMenuOpen ? (
                        <div className="absolute left-0 top-full z-20 mt-1.5 w-[min(24rem,calc(100vw-2rem))] animate-scale-in rounded-2xl border border-border-subtle bg-cloud-white p-1.5 shadow-elevated">
                          <div className="space-y-0.5">
                            {overviewData.boards.map((board) => {
                              const isCurrentBoard =
                                board.id === boardData.board.id

                              return (
                                <button
                                  key={board.id}
                                  className={cn(
                                    'flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition-all duration-150',
                                    isCurrentBoard
                                      ? 'bg-electric-violet/8 text-text-primary'
                                      : 'text-text-secondary hover:bg-surface-sunken hover:text-text-primary',
                                  )}
                                  onClick={() => switchBoard(board.id)}
                                  onFocus={() => prefetchBoard(board.id)}
                                  onMouseEnter={() => prefetchBoard(board.id)}
                                  type="button"
                                >
                                  <span className="min-w-0">
                                    <span className="block truncate text-sm font-medium">
                                      {board.name}
                                    </span>
                                    <span className="mt-0.5 block text-xs text-text-tertiary">
                                      {overviewData.boardTypes.find(
                                        (boardType) =>
                                          boardType.id === board.boardTypeId,
                                      )?.name ?? 'Board'}
                                    </span>
                                  </span>
                                  {isCurrentBoard ? (
                                    <span className="rounded-md bg-electric-violet/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-electric-violet">
                                      Active
                                    </span>
                                  ) : null}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="hidden h-5 w-px bg-border-subtle md:block" />

                    <div className="flex max-w-full items-center overflow-x-auto rounded-xl border border-border-subtle bg-surface-sunken p-0.5">
                      {boardData.views.map((view) => {
                        const instanceId = view.instanceId ?? view.viewId
                        const Icon = getViewIcon(
                          view.definitionViewId ?? view.viewId,
                          view.label,
                        )

                        return (
                          <button
                            key={instanceId}
                            onClick={() => {
                              setViewContextMenu(null)
                              setUtilityPage('none')
                              updateSearch((current: any) => ({
                                ...current,
                                view: instanceId,
                              }))
                            }}
                            onContextMenu={(event) => {
                              event.preventDefault()
                              setIsViewMenuOpen(false)
                              setViewContextMenu({
                                left: Math.min(
                                  event.clientX,
                                  window.innerWidth - 220,
                                ),
                                top: Math.min(
                                  event.clientY,
                                  window.innerHeight - 96,
                                ),
                                viewId: instanceId,
                                label: view.label,
                              })
                            }}
                            className={cn(
                              'flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all duration-200',
                              activeViewId === instanceId &&
                                utilityPage === 'none'
                                ? 'bg-cloud-white text-electric-violet shadow-sm'
                                : 'text-text-tertiary hover:bg-cloud-white/60 hover:text-text-primary',
                            )}
                            type="button"
                          >
                            <Icon className="h-3.5 w-3.5" />
                            {view.instanceMode === 'private' ? (
                              <Lock className="h-3 w-3" />
                            ) : null}
                            {view.label}
                          </button>
                        )
                      })}
                      <div className="relative" ref={viewMenuRef}>
                        <button
                          ref={addViewButtonRef}
                          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-text-tertiary transition-all duration-200 hover:bg-cloud-white/60 hover:text-text-primary"
                          onClick={() => {
                            const rect =
                              addViewButtonRef.current?.getBoundingClientRect()
                            if (rect) {
                              setViewMenuPosition({
                                left: Math.min(
                                  rect.left,
                                  window.innerWidth - 240,
                                ),
                                top: rect.bottom + 8,
                              })
                            }
                            setViewContextMenu(null)
                            setIsViewMenuOpen((open) => !open)
                          }}
                          type="button"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add view
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {boardHeaderExtensions.map(({ extension, plugin, pluginId }) => (
                      <div key={`${pluginId}:${extension.id}`}>
                        {extension.render({
                          slot: 'board.header.actions',
                          pluginId,
                          workspaceSlug,
                          boardId,
                          services: createPermissionedClientServices({
                            plugin,
                            services: platformServices,
                          }),
                          boardType: boardData.boardType,
                          tagDefinitions: boardData.tagDefinitions,
                          members: boardData.members,
                        })}
                      </div>
                    ))}
                    {utilityPage === 'none' &&
                    boardData.views.some((v) => v.instanceId === activeViewId) ? (
                      <button
                        className={cn(
                          'rounded-lg p-2 transition-all duration-200',
                          activeViewRecord?.config?.inboxVisible
                            ? 'bg-electric-violet/10 text-electric-violet'
                            : 'text-text-tertiary hover:bg-surface-sunken hover:text-text-primary',
                        )}
                        onClick={() => {
                          const current = Boolean(
                            activeViewRecord?.config?.inboxVisible,
                          )
                          if (!activeViewId) {
                            return
                          }
                          void actions.updateViewConfig(activeViewId, {
                            ...(activeViewRecord?.config ?? {}),
                            inboxVisible: !current,
                          })
                        }}
                        title="Toggle Inbox"
                        type="button"
                      >
                        <Inbox className="h-4 w-4" />
                      </button>
                    ) : null}
                    <button
                      className={cn(
                        'rounded-lg p-2 transition-all duration-200',
                        searchOpen
                          ? 'bg-electric-violet/10 text-electric-violet'
                          : 'text-text-tertiary hover:bg-surface-sunken hover:text-text-primary',
                      )}
                      onClick={() => setSearchOpen(true)}
                      title="Search"
                      type="button"
                    >
                      <Search className="h-4 w-4" />
                    </button>
                    <button
                      className="rounded-lg p-2 text-text-tertiary transition-all duration-200 hover:bg-surface-sunken hover:text-text-primary"
                      onClick={() => setCommandOpen(true)}
                      title="Command palette"
                      type="button"
                    >
                      <Command className="h-4 w-4" />
                    </button>
                    <button
                      className={cn(
                        'rounded-lg p-2 transition-all duration-200',
                        utilityPage === 'activity'
                          ? 'bg-electric-violet/10 text-electric-violet'
                          : 'text-text-tertiary hover:bg-surface-sunken hover:text-text-primary',
                      )}
                      onClick={() =>
                        setUtilityPage((current) =>
                          current === 'activity' ? 'none' : 'activity',
                        )
                      }
                      title="Activity"
                      type="button"
                    >
                      <Activity className="h-4 w-4" />
                    </button>
                    <button
                      className={cn(
                        'rounded-lg p-2 transition-all duration-200',
                        utilityPage === 'extensions'
                          ? 'bg-electric-violet/10 text-electric-violet'
                          : 'text-text-tertiary hover:bg-surface-sunken hover:text-text-primary',
                      )}
                      onClick={() =>
                        setUtilityPage((current) =>
                          current === 'extensions' ? 'none' : 'extensions',
                        )
                      }
                      title="Plugins"
                      type="button"
                    >
                      <Plug className="h-4 w-4" />
                    </button>
                    <button
                      className="rounded-lg p-2 text-text-tertiary transition-all duration-200 hover:bg-surface-sunken hover:text-text-primary"
                      onClick={openSettings}
                      title="Settings"
                      type="button"
                    >
                      <Settings2 className="h-4 w-4" />
                    </button>
                    <div
                      className="hidden items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs font-medium text-text-secondary sm:flex"
                      title={
                        online
                          ? 'Connected: live updates are active.'
                          : 'Offline: updates will sync when connection returns.'
                      }
                    >
                      {boardPresence.length ? (
                        <span className="flex items-center gap-1.5 rounded-full bg-surface-sunken px-2 py-1 text-[11px] font-semibold text-text-secondary">
                          <Users className="h-3.5 w-3.5" />
                          {boardPresence.length}
                        </span>
                      ) : null}
                      <span
                        className={`status-dot ${online ? 'status-dot-online' : 'status-dot-offline'}`}
                      />
                    </div>
                  </div>
                </div>
              </header>

              <div className="min-h-0 flex-1 overflow-hidden">
                {utilityPage === 'activity' ? (
                  <div className="mx-auto max-w-6xl px-6 py-8 animate-fade-in">
                    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h1 className="text-2xl font-bold tracking-tight text-grape-vine">
                          Activity
                        </h1>
                        <p className="mt-1 text-sm text-lavender-bloom">
                          Live board presence and recent workflow activity from
                          the canonical event projection.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="rounded-xl bg-electric-violet/10 px-3 py-1.5 text-xs font-semibold text-electric-violet">
                          {boardPresence.length} active now
                        </div>
                        <div className="rounded-xl bg-cloud-white px-3 py-1.5 text-xs font-semibold text-lavender-bloom">
                          {boardActivity.length} recent events
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
                      <section className="rounded-2xl border border-ghost-gray bg-cloud-white p-4">
                        <div className="mb-4 flex items-center gap-2">
                          <Users className="h-4 w-4 text-electric-violet" />
                          <h2 className="text-sm font-semibold text-grape-vine">
                            Present on this board
                          </h2>
                        </div>
                        <div className="space-y-2">
                          {boardPresence.length ? (
                            boardPresence.map((entry) => (
                              <div
                                  key={entry.userId}
                                className="flex items-center gap-3 rounded-xl border border-ghost-gray/70 px-3 py-2.5"
                              >
                                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-electric-violet/10 text-xs font-bold text-electric-violet">
                                  {getMemberInitials(entry)}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold text-grape-vine">
                                    {getMemberDisplayName(entry)}
                                  </p>
                                  <p className="text-xs text-lavender-bloom">
                                    {entry.isViewer
                                      ? 'You'
                                      : (entry.role ?? 'Member')}{' '}
                                    ·{' '}
                                    {formatRelativeTime(entry.lastHeartbeatAt)}
                                  </p>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="rounded-xl border border-dashed border-ghost-gray px-3 py-6 text-center text-sm text-lavender-bloom">
                              No active viewers right now.
                            </div>
                          )}
                        </div>
                      </section>

                      <section className="rounded-2xl border border-ghost-gray bg-cloud-white p-4">
                        <div className="mb-4 flex items-center gap-2">
                          <Activity className="h-4 w-4 text-electric-violet" />
                          <h2 className="text-sm font-semibold text-grape-vine">
                            Recent board activity
                          </h2>
                        </div>
                        <div className="space-y-2">
                          {activityQuery.isLoading ? (
                            <div className="rounded-xl border border-dashed border-ghost-gray px-3 py-6 text-center text-sm text-lavender-bloom">
                              Loading activity…
                            </div>
                          ) : boardActivity.length ? (
                            boardActivity.map((entry) => (
                              <button
                                key={entry.id}
                                className="flex w-full items-start gap-3 rounded-xl border border-ghost-gray/70 px-3 py-3 text-left transition-all duration-150 hover:border-electric-violet/20 hover:bg-electric-violet/[0.02]"
                                onClick={() =>
                                  updateSearch((current: any) => ({
                                    ...current,
                                    card: entry.cardId,
                                  }))
                                }
                                type="button"
                              >
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-lavender-mist text-xs font-bold text-grape-vine">
                                  {getLabelInitials(entry.actorLabel)}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-sm font-semibold text-grape-vine">
                                    {entry.actorLabel}
                                  </p>
                                  <p className="mt-0.5 text-sm text-text-secondary">
                                    {getActivitySummary(entry)}{' '}
                                    <span className="font-medium text-text-primary">
                                      {entry.cardTitle}
                                    </span>
                                  </p>
                                </div>
                                <span className="shrink-0 text-xs text-lavender-bloom">
                                  {formatRelativeTime(entry.createdAt)}
                                </span>
                              </button>
                            ))
                          ) : (
                            <div className="rounded-xl border border-dashed border-ghost-gray px-3 py-6 text-center text-sm text-lavender-bloom">
                              No recent activity yet.
                            </div>
                          )}
                        </div>
                      </section>
                    </div>
                  </div>
                ) : utilityPage === 'extensions' ? (
                  <div className="mx-auto max-w-6xl px-6 py-8 animate-fade-in">
                    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h1 className="text-2xl font-bold tracking-tight text-grape-vine">
                          Workspace Extensions
                        </h1>
                        <p className="mt-1 text-sm text-lavender-bloom">
                          Enable or disable installed extensions without
                          changing the canonical card model or the board action
                          flow.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="rounded-xl bg-electric-violet/10 px-3 py-1.5 text-xs font-semibold text-electric-violet">
                          {
                            overviewData.extensions.filter(
                              (extension) => extension.status === 'enabled',
                            ).length
                          }{' '}
                          enabled
                        </div>
                        <Button onClick={openSettings} tone="ghost">
                          Manage all settings
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
                      <aside className="rounded-2xl border border-ghost-gray bg-cloud-white p-3">
                        {[
                          {
                            id: 'all' as const,
                            label: 'All Extensions',
                            icon: Plug,
                          },
                          { id: 'core' as const, label: 'Core', icon: Shield },
                          {
                            id: 'productivity' as const,
                            label: 'Productivity',
                            icon: Sparkles,
                          },
                          {
                            id: 'automation' as const,
                            label: 'Automation',
                            icon: Bot,
                          },
                        ].map((item) => {
                          const Icon = item.icon
                          return (
                            <button
                              key={item.id}
                              className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm font-medium transition-all duration-200 ${
                                extensionCategory === item.id
                                  ? 'bg-electric-violet/10 text-electric-violet'
                                  : 'text-muted-violet hover:bg-lavender-mist hover:text-grape-vine'
                              }`}
                              onClick={() => setExtensionCategory(item.id)}
                              type="button"
                            >
                              <Icon className="h-4 w-4" />
                              {item.label}
                            </button>
                          )
                        })}
                      </aside>

                      <section className="rounded-2xl border border-ghost-gray bg-cloud-white p-4">
                        <div className="space-y-2">
                          {filteredExtensions.map((extension) => (
                            <div
                              key={extension.manifest.id}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ghost-gray/60 px-4 py-3 transition-all duration-200 hover:border-electric-violet/20 hover:bg-electric-violet/[0.02] hover:shadow-sm"
                            >
                              <div>
                                <p className="text-sm font-semibold text-grape-vine">
                                  {extension.manifest.name}
                                </p>
                                <p className="mt-0.5 text-xs text-lavender-bloom">
                                  {extension.manifest.description ??
                                    'Workspace extension'}
                                </p>
                              </div>

                              <div className="flex items-center gap-2">
                                <span
                                  className={`rounded-lg border px-2 py-0.5 text-xs font-semibold ${
                                    extension.status === 'enabled'
                                      ? 'border-success-green/20 bg-success-green/10 text-success-green'
                                      : 'border-ghost-gray bg-lavender-mist text-lavender-bloom'
                                  }`}
                                >
                                  {extension.status === 'enabled'
                                    ? 'Enabled'
                                    : 'Disabled'}
                                </span>
                                <Button
                                  disabled={toggleExtension.isPending}
                                  onClick={() =>
                                    toggleExtension.mutate({
                                      pluginId: extension.manifest.id,
                                      status:
                                        extension.status === 'enabled'
                                          ? 'disabled'
                                          : 'enabled',
                                    })
                                  }
                                  tone={
                                    extension.status === 'enabled'
                                      ? 'ghost'
                                      : 'primary'
                                  }
                                >
                                  {extension.status === 'enabled'
                                    ? 'Disable'
                                    : 'Enable'}
                                </Button>
                              </div>
                            </div>
                          ))}

                          {!filteredExtensions.length ? (
                            <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
                              No extensions match this filter.
                            </div>
                          ) : null}
                        </div>
                      </section>
                    </div>
                  </div>
                ) : pluginView ? (
                  <div className="h-full overflow-auto px-3 pb-4 pt-3 md:px-4">
                    {(() => {
                      const pluginServices = pluginViewOwner
                        ? createPermissionedClientServices({
                            plugin: pluginViewOwner,
                            services: platformServices,
                          })
                        : platformServices
                      return pluginView.render({
                      boardId,
                      boardName: boardData.board.name,
                      viewId: renderViewId,
                      viewInstanceId: activeViewId ?? renderViewId,
                      viewMode: boardData.activeViewMode ?? 'shared',
                      viewLabel: activeViewRecord?.label ?? pluginView.label,
                      viewConfig: activeViewRecord?.config,
                      featureInstance: activeViewRecord?.featureInstance,
                      updateViewConfig: (config) =>
                        activeViewId
                          ? pluginServices.views.updateConfig(config)
                          : Promise.resolve(),
                      services: pluginServices,
                      boardType: boardData.boardType,
                      columns: boardData.board.columns,
                      cardTypes: boardData.cardTypes,
                      tagDefinitions: boardData.tagDefinitions,
                      cards: boardData.cards,
                      members: boardData.members,
                      ui: {
                        unreadCardIds,
                      },
                      actions: {
                        createCard: pluginServices.cards.create,
                        createSubTask: actions.createSubTask,
                        createColumn: actions.createColumn,
                        deleteColumn: actions.deleteColumn,
                        moveCard: pluginServices.cards.move,
                        updateCard: pluginServices.cards.update,
                        openCard: pluginServices.navigation.openCard,
                        renameColumn: actions.renameColumn,
                        reorderColumn: actions.reorderColumn,
                      },
                    })
                    })()}
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center px-6 text-center">
                    <div className="max-w-md space-y-3">
                      <p className="text-base font-semibold text-zinc-900">
                        No board views are currently available.
                      </p>
                      <p className="text-sm text-zinc-600">
                        All view-providing extensions appear to be disabled or unavailable for this
                        board. Re-enable a board-view extension in workspace settings.
                      </p>
                      <Button onClick={openSettings} tone="ghost">
                        <Settings2 className="mr-2 h-4 w-4" />
                        Open workspace settings
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </WorkspaceShell>
        ) : (
          <div className="p-8 text-muted-violet">Loading board…</div>
        )}
      </Authenticated>

      {commandOpen ? (
        <CommandPalette
          commands={commands}
          onClose={() => setCommandOpen(false)}
        />
      ) : null}
      {searchOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-grape-vine/30 px-4 pt-24 backdrop-blur-sm animate-fade-in"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setSearchOpen(false)
            }
          }}
        >
          <div className="w-full max-w-2xl animate-scale-in rounded-2xl border border-ghost-gray bg-cloud-white p-4 shadow-elevated">
            <div className="flex items-center gap-3 rounded-xl border border-ghost-gray bg-lavender-mist px-4 py-2.5">
              <Search className="h-4 w-4 text-lavender-bloom" />
              <Input
                autoFocus
                className="border-none bg-transparent px-0 shadow-none focus:border-none"
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Find card by title"
                value={searchTerm}
              />
            </div>
            <div className="mt-3 space-y-1">
              {searchResults?.map((result) => (
                <button
                  key={result.id}
                  className="w-full rounded-xl px-4 py-3 text-left transition-all duration-200 hover:bg-electric-violet/8"
                  onClick={() => {
                    setSearchOpen(false)
                    updateSearch((current: any) => ({
                      ...current,
                      card: result.id,
                    }))
                  }}
                  type="button"
                >
                  <span className="block text-sm font-semibold text-grape-vine">
                    {result.title}
                  </span>
                  <span className="mt-0.5 block text-xs text-lavender-bloom">
                    Open card details
                  </span>
                </button>
              ))}
              {searchTerm.trim() && !searchResults?.length ? (
                <p className="px-2 py-4 text-sm text-lavender-bloom">
                  No cards match that search.
                </p>
              ) : null}
              {!searchTerm.trim() ? (
                <p className="px-2 py-4 text-sm text-lavender-bloom">
                  Start typing to search the current board.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {activeCard && boardData ? (
        <CardDrawer
          activePluginPropertyTypes={activePluginPropertyTypes}
          activePluginSlots={activePluginSlots}
          platformServices={platformServices}
          boardType={boardData.boardType}
          cardType={activeCardType}
          tagDefinitions={boardData.tagDefinitions}
          members={boardData.members}
          viewerUserId={boardData.viewerUserId}
          card={activeCard}
          commentsOpen={search.focus === 'comments'}
          focusTarget={search.focus}
          highlightedCommentId={search.commentId}
          renderCollaborationPanel={(panelProps) => (
            <CardCommentsPanel {...panelProps} />
          )}
          workspaceSlug={workspaceSlug}
          onAddProperty={actions.addProperty}
          onDeleteCard={async () => {
            await actions.deleteCard(activeCard.id)
          }}
          onDeleteProperty={actions.deleteProperty}
          onCreateSubTask={async (title: string) =>
            actions.createSubTask(activeCard.id, title, activeCard.typeKey)
          }
          onOpenCard={(cardId: string, nextBoardId?: string) => {
            if (!nextBoardId || nextBoardId === boardId) {
              updateSearch((current: any) => ({
                ...current,
                card: cardId,
                commentId: undefined,
              }))
              return
            }
            void navigate({
              params: {
                workspaceSlug,
                boardId: nextBoardId,
              },
              search: {
                card: cardId,
                commentId: undefined,
                view: activeViewId,
              },
              to: '/w/$workspaceSlug/boards/$boardId',
            } as never)
          }}
          onToggleComments={() =>
            updateSearch((current: any) => ({
              ...current,
              focus: current.focus === 'comments' ? undefined : 'comments',
              commentId: current.focus === 'comments' ? undefined : current.commentId,
            }))
          }
          onCloseComments={() =>
            updateSearch((current: any) => ({
              ...current,
              focus: undefined,
              commentId: undefined,
            }))
          }
          onUpdatePropertyOptions={actions.updatePropertyOptions}
          onRequestCardUploadUrl={actions.requestCardUploadUrl}
          onResolveCardFileUrl={actions.resolveCardFileUrl}
          onSaveDefaultProperties={saveBoardDefaultProperties}
          subTasks={activeCardSubTasks}
          onClose={() =>
            updateSearch((current: any) => ({
              ...current,
              card: undefined,
              commentId: undefined,
              focus: undefined,
            }))
          }
          onSave={async (payload) => {
            return await actions.updateCard({
              cardId: activeCard.id,
              title: payload.title,
              body: payload.body,
              baseUpdatedAt: payload.baseUpdatedAt,
              propertyUpdates: payload.propertyUpdates,
              tagIds: payload.tagIds,
              statusKey: payload.statusKey,
            })
          }}
        />
      ) : null}
      {isViewMenuOpen && hydrated
        ? createPortal(
            <div
              className="fixed z-50 w-56 rounded-2xl border border-border-subtle bg-cloud-white p-1.5 shadow-elevated"
              onPointerDown={(event) => event.stopPropagation()}
              style={{
                left: viewMenuPosition.left,
                top: viewMenuPosition.top,
              }}
            >
              {availableViewOptions.length ? (
                availableViewOptions.map((view) => {
                  const Icon = getViewIcon(view.id, view.label)
                  const sharingPolicy = view.sharingPolicy ?? 'shared_with_private'
                  return (
                    <div
                      key={view.id}
                      className="flex items-center gap-1.5"
                    >
                      <button
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-text-secondary transition hover:bg-surface-sunken hover:text-text-primary"
                        onClick={async () => {
                          const instanceId = await actions.addBoardView(
                            view.id,
                            sharingPolicy === 'force_private' ? 'private' : 'shared',
                          )
                          setIsViewMenuOpen(false)
                          setUtilityPage('none')
                          updateSearch((current: any) => ({
                            ...current,
                            view: instanceId ?? current.view,
                          }))
                        }}
                        type="button"
                      >
                        <Icon className="h-4 w-4" />
                        <span className="truncate">{view.label}</span>
                      </button>
                      {sharingPolicy === 'shared_with_private' ? (
                        <button
                          className="rounded-xl p-2 text-text-tertiary transition hover:bg-surface-sunken hover:text-text-primary"
                          onClick={async () => {
                            const instanceId = await actions.addBoardView(
                              view.id,
                              'private',
                            )
                            setIsViewMenuOpen(false)
                            setUtilityPage('none')
                            updateSearch((current: any) => ({
                              ...current,
                              view: instanceId ?? current.view,
                            }))
                          }}
                          title={`Add private ${view.label}`}
                          type="button"
                        >
                          <Lock className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  )
                })
              ) : (
                <div className="px-3 py-2 text-xs text-text-tertiary">
                  All enabled views are already on this board.
                </div>
              )}
            </div>,
            document.body,
          )
        : null}
      {viewContextMenu && hydrated
        ? createPortal(
            <div
              className="fixed z-50 w-52 rounded-xl border border-border-subtle bg-cloud-white p-1.5 shadow-elevated"
              onPointerDown={(event) => event.stopPropagation()}
              style={{
                left: viewContextMenu.left,
                top: viewContextMenu.top,
              }}
            >
              <div className="truncate px-3 py-1.5 text-xs font-semibold text-text-tertiary">
                {viewContextMenu.label}
              </div>
              <button
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:text-text-tertiary disabled:hover:bg-transparent"
                disabled={removableViewCount <= 1}
                onClick={() => void removeView(viewContextMenu.viewId)}
                type="button"
              >
                <Trash2 className="h-4 w-4" />
                Remove view
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
