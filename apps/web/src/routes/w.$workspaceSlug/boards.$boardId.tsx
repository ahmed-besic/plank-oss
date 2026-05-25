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
  SquareKanban,
  Trash2,
  Users,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, cn } from '@plank/ui'
import type { BoardViewConfigScalar } from '@plank/domain'
import type {
  PlatformClientServices,
  PlatformUiSlotId,
} from '@plank/plugin-sdk'
import { createPermissionedClientServices } from '@plank/plugin-runtime'
import { toast } from 'sonner'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { CardDrawer } from '../../components/card-drawer'
import { WorkspaceShell } from '../../components/workspace-shell'
import { CommandPalette } from '../../components/command-palette'
import type { KeyboardShortcut } from '../../lib/keyboard-shortcuts'
import { buildBoardCommandItems } from '../../features/board/command-items'
import { BoardSearchDialog } from '../../features/board/BoardSearchDialog'
import { BoardActivityPage } from '../../features/collaboration/BoardActivityPage'
import { CardCommentsPanel } from '../../features/collaboration/CardCommentsPanel'
import { BoardExtensionsPage } from '../../features/extensions/BoardExtensionsPage'
import type { ExtensionCategory } from '../../features/extensions/BoardExtensionsPage'
import { useBoardActions } from '../../lib/use-board-actions'
import { createBoardPlatformServices } from '../../lib/plugin-platform-services'
import {
  collectEnabledUiExtensions,
  collectEnabledUiExtensionsForSlots,
} from '../../lib/plugin-ui-extensions'
import { useHydrated } from '../../lib/use-hydrated'
import { useOnlineState } from '../../lib/use-online-state'
import { usePlankApp } from '../../lib/providers'
import type {
  BoardActivityEntry,
  BoardPageData,
  BoardPresenceEntry,
  WorkspaceOverviewData,
} from '../../lib/types'

const createRoute = createFileRoute as any

export const Route = createRoute('/w/$workspaceSlug/boards/$boardId')({
  validateSearch: (search: any) => ({
    card: typeof search.card === 'string' ? search.card : undefined,
    commentId:
      typeof search.commentId === 'string' ? search.commentId : undefined,
    focus:
      search.focus === 'comments' || search.focus === 'description'
        ? search.focus
        : undefined,
    view: typeof search.view === 'string' ? search.view : undefined,
  }),
  component: BoardRoute,
})

type BoardUtilityPage = 'none' | 'extensions' | 'activity'
const BOARD_PRESENCE_ACTIVE_MS = 90_000
const BOARD_PRESENCE_HEARTBEAT_MS = 45_000
const DRAWER_EXIT_MS = 180

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

function isPersistedCardId(cardId: string | undefined): cardId is Id<'cards'> {
  return typeof cardId === 'string' && !cardId.startsWith('optimistic:')
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
  const [presentedCard, setPresentedCard] = useState<
    BoardPageData['cards'][number] | null
  >(null)
  const [isDrawerClosing, setIsDrawerClosing] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [utilityPage, setUtilityPage] = useState<BoardUtilityPage>('none')
  const [extensionCategory, setExtensionCategory] =
    useState<ExtensionCategory>('all')
  const drawerCloseTimeoutRef = useRef<number | null>(null)
  const closingCardIdRef = useRef<string | null>(null)
  const activityVisible = utilityPage === 'activity'
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
  const boardData = boardQuery.data as BoardPageData | undefined
  const hasLoadedBoard = Boolean(boardData && boardData.board.id === boardId)
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
    enabled:
      hydrated && auth.isAuthenticated && hasLoadedBoard && activityVisible,
  })
  const activityOptions = convexQuery(api.boards.getBoardActivityPage, {
    workspaceSlug,
    boardId: boardId as never,
    viewId: search.view,
    limit: 40,
  })
  const activityQuery = useQuery({
    ...activityOptions,
    enabled:
      hydrated && auth.isAuthenticated && hasLoadedBoard && activityVisible,
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

  const overviewData = overviewQuery.data as WorkspaceOverviewData | undefined
  const boardPresence = useMemo(
    () =>
      activityVisible
        ? ((presenceQuery.data?.items ?? []) as BoardPresenceEntry[]).filter(
            (entry) =>
              entry.lastHeartbeatAt > Date.now() - BOARD_PRESENCE_ACTIVE_MS,
          )
        : [],
    [activityVisible, presenceQuery.data?.items],
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
        ? collectEnabledUiExtensionsForSlots({
            registry: pluginRegistry,
            enabledPluginIds: boardData.enabledPluginIds,
            slots: [
              'card.header',
              'card.metadata.primary',
              'card.body.tools',
              'card.sidebar.panels',
              'card.footer.activity',
            ] satisfies PlatformUiSlotId[],
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
  const commands = useMemo(
    () =>
      buildBoardCommandItems({
        activePlugins,
        boardData,
        boardId,
        platformServices,
        workspaceSlug,
      }),
    [activePlugins, boardData, boardId, platformServices, workspaceSlug],
  )
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
  const displayedCard = activeCard ?? presentedCard
  const activeCardType = boardData?.cardTypes.find(
    (cardType) => cardType.id === displayedCard?.typeKey,
  )
  useEffect(() => {
    return () => {
      if (drawerCloseTimeoutRef.current !== null) {
        window.clearTimeout(drawerCloseTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (activeCard) {
      if (
        isDrawerClosing &&
        closingCardIdRef.current &&
        activeCard.id === closingCardIdRef.current
      ) {
        return
      }
      if (drawerCloseTimeoutRef.current !== null) {
        window.clearTimeout(drawerCloseTimeoutRef.current)
        drawerCloseTimeoutRef.current = null
      }
      setPresentedCard(activeCard)
      setIsDrawerClosing(false)
      closingCardIdRef.current = null
      return
    }

    if (!search.card && !isDrawerClosing) {
      setPresentedCard(null)
    }
  }, [activeCard, isDrawerClosing, search.card])

  useEffect(() => {
    if (search.card || !isDrawerClosing) {
      return
    }
    setPresentedCard(null)
    setIsDrawerClosing(false)
    closingCardIdRef.current = null
  }, [isDrawerClosing, search.card])

  useEffect(() => {
    if (!boardData || !search.card || activeCard || isDrawerClosing) {
      return
    }
    updateSearch((current: any) => ({
      ...current,
      card: undefined,
      commentId: undefined,
      focus: undefined,
    }))
  }, [activeCard, boardData, isDrawerClosing, search.card])
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

  const requestDrawerClose = () => {
    if (isDrawerClosing) {
      return
    }
    closingCardIdRef.current = displayedCard?.id ?? null
    setIsDrawerClosing(true)
    if (drawerCloseTimeoutRef.current !== null) {
      window.clearTimeout(drawerCloseTimeoutRef.current)
    }
    drawerCloseTimeoutRef.current = window.setTimeout(() => {
      drawerCloseTimeoutRef.current = null
      updateSearch((current: any) => ({
        ...current,
        card: undefined,
        commentId: undefined,
        focus: undefined,
      }))
    }, DRAWER_EXIT_MS)
  }

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
    const existingSeenAt =
      activeCard.viewerSeenAt ?? viewerBoardSeenAtRef.current

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
    if (!hydrated || !auth.isAuthenticated || !boardData || !activityVisible) {
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
    activityVisible,
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
  const renderViewId =
    pluginView?.id ?? activeDefinitionViewId ?? 'unknown-view'
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
        ? activeViewRecord.config
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
    const targetView = boardData.views.find(
      (view) => view.instanceId === instanceId,
    )
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
        ? boardData.views.find((view) => view.instanceId !== instanceId)
            ?.instanceId
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
  const openAddViewMenu = () => {
    const rect = addViewButtonRef.current?.getBoundingClientRect()
    if (rect) {
      setViewMenuPosition({
        left: Math.min(rect.left, window.innerWidth - 240),
        top: rect.bottom + 8,
      })
    }
    setViewContextMenu(null)
    setIsViewMenuOpen((open) => !open)
  }
  const createCardInFirstColumn = async () => {
    const firstColumn = boardData?.board.columns[0]
    if (!firstColumn) {
      toast.error('No column is available for a new card.')
      return
    }

    const cardId = await actions.createCard(
      'New card',
      firstColumn.id,
      boardData.cardTypes[0]?.id,
    )
    if (cardId) {
      updateSearch((current: any) => ({
        ...current,
        card: cardId,
      }))
    }
  }
  const boardShortcuts = useMemo<KeyboardShortcut[]>(() => {
    const activeViewIndex = boardData?.views.findIndex(
      (view) => (view.instanceId ?? view.viewId) === activeViewId,
    )
    const switchViewByOffset = (offset: number) => {
      if (!boardData?.views.length || activeViewIndex === undefined) {
        return
      }
      const normalizedIndex = activeViewIndex >= 0 ? activeViewIndex : 0
      const nextView =
        boardData.views[
          (normalizedIndex + offset + boardData.views.length) %
            boardData.views.length
        ]
      const nextInstanceId = nextView?.instanceId ?? nextView?.viewId
      if (!nextInstanceId) {
        return
      }
      setUtilityPage('none')
      updateSearch((current: any) => ({
        ...current,
        view: nextInstanceId,
      }))
    }
    const isBoardInputBlocked = Boolean(activeCard) || commandOpen || searchOpen

    return [
      {
        id: 'board.command-palette',
        keys: ['mod+k'],
        description: 'Open command palette',
        scope: 'board',
        allowInInputs: true,
        run: () => setCommandOpen(true),
      },
      {
        id: 'board.search',
        keys: ['/'],
        description: 'Search cards',
        scope: 'board',
        disabled: Boolean(activeCard) || commandOpen,
        run: () => setSearchOpen(true),
      },
      {
        id: 'board.search-mod',
        keys: ['mod+f'],
        description: 'Search cards',
        scope: 'board',
        allowInInputs: true,
        disabled: Boolean(activeCard) || commandOpen,
        run: () => setSearchOpen(true),
      },
      {
        id: 'board.create-card',
        keys: ['n', 'c'],
        description: 'Create card in first column',
        scope: 'board',
        disabled: isBoardInputBlocked || !boardData,
        run: () => void createCardInFirstColumn(),
      },
      {
        id: 'board.create-column',
        keys: ['n', 'l'],
        description: 'Create column',
        scope: 'board',
        disabled: isBoardInputBlocked,
        run: () => void actions.createColumn('New list'),
      },
      {
        id: 'board.add-view',
        keys: ['v'],
        description: 'Add a board view',
        scope: 'board',
        disabled: isBoardInputBlocked || !availableViewOptions.length,
        run: openAddViewMenu,
      },
      {
        id: 'board.next-view',
        keys: [']'],
        description: 'Next view',
        scope: 'board',
        disabled: isBoardInputBlocked || (boardData?.views.length ?? 0) <= 1,
        run: () => switchViewByOffset(1),
      },
      {
        id: 'board.previous-view',
        keys: ['['],
        description: 'Previous view',
        scope: 'board',
        disabled: isBoardInputBlocked || (boardData?.views.length ?? 0) <= 1,
        run: () => switchViewByOffset(-1),
      },
      {
        id: 'board.board-menu',
        keys: ['b'],
        description: 'Open board switcher',
        scope: 'board',
        disabled: isBoardInputBlocked,
        run: () => setIsBoardMenuOpen((open) => !open),
      },
      {
        id: 'board.activity',
        keys: ['a'],
        description: 'Toggle activity',
        scope: 'board',
        disabled: isBoardInputBlocked,
        run: () =>
          setUtilityPage((current) =>
            current === 'activity' ? 'none' : 'activity',
          ),
      },
      {
        id: 'board.extensions',
        keys: ['e'],
        description: 'Toggle extensions',
        scope: 'board',
        disabled: isBoardInputBlocked,
        run: () =>
          setUtilityPage((current) =>
            current === 'extensions' ? 'none' : 'extensions',
          ),
      },
      {
        id: 'board.inbox',
        keys: ['i'],
        description: 'Toggle inbox',
        scope: 'board',
        disabled:
          isBoardInputBlocked ||
          utilityPage !== 'none' ||
          !activeViewId ||
          !activeViewRecord,
        run: () =>
          activeViewId
            ? void actions.updateViewConfig(activeViewId, {
                ...(activeViewRecord?.config ?? {}),
                inboxVisible: !Boolean(activeViewRecord?.config?.inboxVisible),
              })
            : undefined,
      },
      {
        id: 'board.close-panel',
        keys: ['escape'],
        description: 'Close board menu or utility panel',
        scope: 'board',
        disabled: Boolean(activeCard) || commandOpen || searchOpen,
        run: () => {
          setIsBoardMenuOpen(false)
          setIsViewMenuOpen(false)
          setViewContextMenu(null)
          setUtilityPage('none')
        },
      },
      {
        id: 'card.save-close-help',
        keys: ['mod+enter'],
        description: 'Save and close card',
        scope: 'card',
        disabled: !activeCard,
        allowInInputs: true,
        run: () => undefined,
      },
      {
        id: 'card.escape-help',
        keys: ['escape'],
        description: 'Save and close card when focus is not in the editor',
        scope: 'card',
        disabled: !activeCard,
        run: () => undefined,
      },
      {
        id: 'card.title-help',
        keys: ['t'],
        description: 'Focus title',
        scope: 'card',
        disabled: !activeCard,
        run: () => undefined,
      },
      {
        id: 'card.description-help',
        keys: ['d'],
        description: 'Focus description',
        scope: 'card',
        disabled: !activeCard,
        run: () => undefined,
      },
      {
        id: 'card.metadata-help',
        keys: ['s', 'g', 'l', 'p'],
        description: 'Open status, tags, relations, or add-property panel',
        scope: 'card',
        disabled: !activeCard,
        run: () => undefined,
      },
      {
        id: 'card.comments-help',
        keys: ['mod+shift+c'],
        description: 'Toggle comments',
        scope: 'card',
        disabled: !activeCard,
        allowInInputs: true,
        run: () => undefined,
      },
      {
        id: 'card.upload-help',
        keys: ['u'],
        description: 'Upload image',
        scope: 'card',
        disabled: !activeCard,
        run: () => undefined,
      },
    ]
  }, [
    actions,
    activeCard,
    activeViewId,
    activeViewRecord,
    availableViewOptions.length,
    boardData,
    commandOpen,
    searchOpen,
    utilityPage,
  ])

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
            shortcuts={boardShortcuts}
          >
            <div className="flex h-full min-h-0 flex-col">
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
                          onClick={openAddViewMenu}
                          type="button"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add view
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {boardHeaderExtensions.map(
                      ({ extension, plugin, pluginId }) => (
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
                      ),
                    )}
                    {utilityPage === 'none' &&
                    boardData.views.some(
                      (v) => v.instanceId === activeViewId,
                    ) ? (
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
                  <BoardActivityPage
                    boardActivity={boardActivity}
                    boardPresence={boardPresence}
                    isLoading={activityQuery.isLoading}
                    onOpenCard={(cardId) =>
                      updateSearch((current: any) => ({
                        ...current,
                        card: cardId,
                      }))
                    }
                  />
                ) : utilityPage === 'extensions' ? (
                  <BoardExtensionsPage
                    extensionCategory={extensionCategory}
                    isToggling={toggleExtension.isPending}
                    onOpenSettings={openSettings}
                    onSetExtensionCategory={setExtensionCategory}
                    onToggleExtension={(pluginId, status) =>
                      toggleExtension.mutate({ pluginId, status })
                    }
                    overview={overviewData}
                  />
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
                        All view-providing extensions appear to be disabled or
                        unavailable for this board. Re-enable a board-view
                        extension in workspace settings.
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
        <BoardSearchDialog
          onClose={() => setSearchOpen(false)}
          onOpenCard={(cardId) =>
            updateSearch((current: any) => ({
              ...current,
              card: cardId,
            }))
          }
          searchResults={searchResults}
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
        />
      ) : null}

      {displayedCard && boardData ? (
        <CardDrawer
          activePluginPropertyTypes={activePluginPropertyTypes}
          activePluginSlots={activePluginSlots}
          platformServices={platformServices}
          boardType={boardData.boardType}
          cardType={activeCardType}
          tagDefinitions={boardData.tagDefinitions}
          members={boardData.members}
          viewerUserId={boardData.viewerUserId}
          card={displayedCard}
          isClosing={isDrawerClosing}
          commentsOpen={search.focus === 'comments' && !isDrawerClosing}
          focusTarget={search.focus}
          highlightedCommentId={search.commentId}
          renderCollaborationPanel={(panelProps) => (
            <CardCommentsPanel {...panelProps} />
          )}
          workspaceSlug={workspaceSlug}
          onAddProperty={actions.addProperty}
          onDeleteCard={async () => {
            await actions.deleteCard(displayedCard.id)
          }}
          onDeleteProperty={actions.deleteProperty}
          onCreateSubTask={async (title: string) =>
            actions.createSubTask(
              displayedCard.id,
              title,
              displayedCard.typeKey,
            )
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
              commentId:
                current.focus === 'comments' ? undefined : current.commentId,
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
          onRequestClose={requestDrawerClose}
          onSave={async (payload) => {
            return await actions.updateCard({
              cardId: displayedCard.id,
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
                  const sharingPolicy =
                    view.sharingPolicy ?? 'shared_with_private'
                  return (
                    <div key={view.id} className="flex items-center gap-1.5">
                      <button
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium text-text-secondary transition hover:bg-surface-sunken hover:text-text-primary"
                        onClick={async () => {
                          const instanceId = await actions.addBoardView(
                            view.id,
                            sharingPolicy === 'force_private'
                              ? 'private'
                              : 'shared',
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
