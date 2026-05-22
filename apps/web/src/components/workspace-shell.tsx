import { convexQuery } from '@convex-dev/react-query'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useConvexAuth } from 'convex/react'
import { cn } from '@plank/ui'
import {
  ChevronDown,
  CircleDot,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Settings2,
  SquareKanban,
  Trash2,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '@convex/_generated/api'
import type { WorkspaceOverviewData } from '../lib/types'
import { useHydrated } from '../lib/use-hydrated'
import { usePlankApp } from '../lib/providers'
import { collectEnabledUiExtensions } from '../lib/plugin-ui-extensions'
import { NotificationCenter } from '../features/collaboration/NotificationCenter'
import { KeyboardShortcutsDialog } from './keyboard-shortcuts-dialog'
import {
  type KeyboardShortcut,
  useKeyboardShortcuts,
} from '../lib/keyboard-shortcuts'
import { useWorkspaceShellLayout } from './use-workspace-shell-layout'

const COLLAPSED_SIDEBAR_WIDTH = 56

export function WorkspaceShell({
  activeBoardId,
  children,
  header,
  overview,
  section = 'overview',
  shortcuts = [],
}: {
  activeBoardId?: string
  children: ReactNode
  header?: ReactNode
  overview: WorkspaceOverviewData
  section?: 'overview' | 'board' | 'settings'
  shortcuts?: KeyboardShortcut[]
}) {
  const auth = useConvexAuth()
  const hydrated = useHydrated()
  const navigate = useNavigate()
  const { convexClient, pluginRegistry, queryClient } = usePlankApp()
  const workspaceMenuRef = useRef<HTMLDivElement>(null)
  const boardMenuRef = useRef<HTMLDivElement>(null)
  const createBoardMenuRef = useRef<HTMLDivElement>(null)
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false)
  const [isCreateBoardMenuOpen, setIsCreateBoardMenuOpen] = useState(false)
  const [isShortcutHelpOpen, setIsShortcutHelpOpen] = useState(false)
  const [openBoardMenuId, setOpenBoardMenuId] = useState<string | null>(null)
  const [newBoardName, setNewBoardName] = useState('New board')
  const [newBoardTypeId, setNewBoardTypeId] = useState(
    overview.boardTypes[0]?.id ?? '',
  )
  const {
    isSidebarHidden,
    setIsSidebarHidden,
    sidebarWidth,
    startSidebarResize,
  } = useWorkspaceShellLayout()
  const workspacesOptions = convexQuery(api.workspaces.listMine, {})
  const workspacesQuery = useQuery({
    ...workspacesOptions,
    enabled: hydrated && auth.isAuthenticated,
  })
  const overviewOptions = convexQuery(api.workspaces.getOverview, {
    workspaceSlug: overview.workspace.slug,
  })
  const workspaceItems = workspacesQuery.data ?? [
    {
      id: overview.workspace.id,
      name: overview.workspace.name,
      role: overview.workspace.role,
      slug: overview.workspace.slug,
    },
  ]
  const enabledPluginIds = useMemo(
    () =>
      overview.extensions
        .filter(
          (extension) => extension.installed && extension.status === 'enabled',
        )
        .map((extension) => extension.manifest.id),
    [overview.extensions],
  )
  const selectedNewBoardType = overview.boardTypes.find(
    (boardType) => boardType.id === newBoardTypeId,
  )
  const firstBoardId = overview.boards[0]?.id
  const sidebarNavigationExtensions = useMemo(
    () =>
      collectEnabledUiExtensions({
        registry: pluginRegistry,
        enabledPluginIds,
        slot: 'shell.sidebar.navigation',
      }),
    [enabledPluginIds, pluginRegistry],
  )
  const renameBoard = useMutation({
    mutationFn: async ({ boardId, name }: { boardId: string; name: string }) =>
      convexClient.mutation((api.boards as any).renameBoard, {
        workspaceSlug: overview.workspace.slug,
        boardId,
        name,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: overviewOptions.queryKey,
      })
    },
  })
  const deleteBoard = useMutation({
    mutationFn: async (boardId: string) =>
      convexClient.mutation((api.boards as any).deleteBoard, {
        workspaceSlug: overview.workspace.slug,
        boardId,
      }),
    onSuccess: async (_result, boardId) => {
      await queryClient.invalidateQueries({
        queryKey: overviewOptions.queryKey,
      })
      if (activeBoardId === boardId) {
        void navigate({
          params: { workspaceSlug: overview.workspace.slug },
          search: {},
          to: '/w/$workspaceSlug',
        } as never)
      }
    },
  })
  const createBoard = useMutation({
    mutationFn: async () => {
      if (!selectedNewBoardType) {
        throw new Error('Choose a board type first')
      }
      const board = await convexClient.mutation(api.workspaces.createBoard, {
        workspaceSlug: overview.workspace.slug,
        name: newBoardName.trim(),
        boardTypeId: selectedNewBoardType.id as never,
      })
      return {
        ...board,
        viewId: selectedNewBoardType.defaultViewIds[0],
      }
    },
    onSuccess: async (result) => {
      setNewBoardName('New board')
      setIsCreateBoardMenuOpen(false)
      await queryClient.invalidateQueries({
        queryKey: overviewOptions.queryKey,
      })
      void navigate({
        params: {
          boardId: result.boardId,
          workspaceSlug: overview.workspace.slug,
        },
        search: {
          view: result.viewId,
        },
        to: '/w/$workspaceSlug/boards/$boardId',
      } as never)
    },
  })
  const createWorkspace = useMutation({
    mutationFn: async (name: string) =>
      convexClient.mutation(api.workspaces.createWorkspace, {
        name,
      }),
    onSuccess: async (result) => {
      setIsWorkspaceMenuOpen(false)
      await queryClient.invalidateQueries({
        queryKey: workspacesOptions.queryKey,
      })
      void navigate({
        params: {
          workspaceSlug: result.workspaceSlug,
        },
        search: {},
        to: '/w/$workspaceSlug',
      } as never)
    },
  })
  const prefetchBoard = (boardId: string) => {
    if (!hydrated || !auth.isAuthenticated) {
      return
    }
    void queryClient.prefetchQuery(
      convexQuery(api.boards.getBoardPage, {
        workspaceSlug: overview.workspace.slug,
        boardId: boardId as never,
      }),
    )
  }

  useEffect(() => {
    setIsWorkspaceMenuOpen(false)
    setOpenBoardMenuId(null)
    setIsCreateBoardMenuOpen(false)
  }, [overview.workspace.slug])

  useEffect(() => {
    if (
      newBoardTypeId &&
      overview.boardTypes.some((boardType) => boardType.id === newBoardTypeId)
    ) {
      return
    }
    setNewBoardTypeId(overview.boardTypes[0]?.id ?? '')
  }, [newBoardTypeId, overview.boardTypes])

  useEffect(() => {
    if (!isWorkspaceMenuOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!workspaceMenuRef.current?.contains(event.target as Node)) {
        setIsWorkspaceMenuOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsWorkspaceMenuOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isWorkspaceMenuOpen])

  useEffect(() => {
    if (!openBoardMenuId) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!boardMenuRef.current?.contains(event.target as Node)) {
        setOpenBoardMenuId(null)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenBoardMenuId(null)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [openBoardMenuId])

  useEffect(() => {
    if (!isCreateBoardMenuOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!createBoardMenuRef.current?.contains(event.target as Node)) {
        setIsCreateBoardMenuOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsCreateBoardMenuOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isCreateBoardMenuOpen])

  const switchWorkspace = (workspaceSlug: string) => {
    setIsWorkspaceMenuOpen(false)

    if (section === 'settings') {
      void navigate({
        params: {
          workspaceSlug,
        },
        to: '/w/$workspaceSlug/settings',
      } as never)
      return
    }

    void navigate({
      params: {
        workspaceSlug,
      },
      search: {},
      to: '/w/$workspaceSlug',
    } as never)
  }

  const requestRenameBoard = (boardId: string, currentName: string) => {
    setOpenBoardMenuId(null)
    const nextName = window.prompt('Rename board', currentName)?.trim()
    if (!nextName || nextName === currentName || renameBoard.isPending) {
      return
    }
    void renameBoard.mutateAsync({ boardId, name: nextName })
  }

  const requestDeleteBoard = (boardId: string, boardName: string) => {
    setOpenBoardMenuId(null)
    const confirmed = window.confirm(
      `Delete "${boardName}"?\n\nThis will permanently delete the board and everything in it, including cards, views, activity, automations, and notifications.`,
    )
    if (!confirmed || deleteBoard.isPending) {
      return
    }
    void deleteBoard.mutateAsync(boardId)
  }

  const requestCreateWorkspace = () => {
    const name = window.prompt('Workspace name', 'New workspace')?.trim()
    if (!name || createWorkspace.isPending) {
      return
    }
    void createWorkspace.mutateAsync(name)
  }

  const requestCreateBoard = () => {
    if (
      !newBoardName.trim() ||
      !selectedNewBoardType ||
      createBoard.isPending
    ) {
      return
    }
    void createBoard.mutateAsync()
  }
  const shellShortcuts = useMemo<KeyboardShortcut[]>(
    () => [
      {
        id: 'global.help',
        keys: ['?'],
        description: 'Show keyboard shortcuts',
        scope: 'global',
        run: () => setIsShortcutHelpOpen((open) => !open),
      },
      {
        id: 'global.toggle-sidebar',
        keys: ['mod+b'],
        description: 'Show or hide sidebar',
        scope: 'global',
        run: () => setIsSidebarHidden((hidden) => !hidden),
      },
      {
        id: 'global.workspace-home',
        keys: ['g', 'h'],
        description: 'Go to workspace home',
        scope: 'global',
        run: () =>
          void navigate({
            params: { workspaceSlug: overview.workspace.slug },
            search: {},
            to: '/w/$workspaceSlug',
          } as never),
      },
      {
        id: 'global.settings',
        keys: ['g', 's'],
        description: 'Go to workspace settings',
        scope: 'global',
        run: () =>
          void navigate({
            params: { workspaceSlug: overview.workspace.slug },
            to: '/w/$workspaceSlug/settings',
          } as never),
      },
      {
        id: 'global.first-board',
        keys: ['g', 'b'],
        description: 'Go to first board',
        scope: 'global',
        disabled: !firstBoardId,
        run: () =>
          firstBoardId
            ? void navigate({
                params: {
                  boardId: firstBoardId,
                  workspaceSlug: overview.workspace.slug,
                },
                to: '/w/$workspaceSlug/boards/$boardId',
              } as never)
            : undefined,
      },
      {
        id: 'global.create-board',
        keys: ['n', 'b'],
        description: 'Open new board menu',
        scope: 'global',
        run: () => setIsCreateBoardMenuOpen(true),
      },
      {
        id: 'global.workspace-menu',
        keys: ['n', 'w'],
        description: 'Open workspace menu',
        scope: 'global',
        run: () => setIsWorkspaceMenuOpen(true),
      },
    ],
    [
      firstBoardId,
      navigate,
      overview.workspace.slug,
      setIsSidebarHidden,
      setIsCreateBoardMenuOpen,
      setIsWorkspaceMenuOpen,
    ],
  )
  const activeShortcuts = useMemo(
    () => [...shellShortcuts, ...shortcuts],
    [shellShortcuts, shortcuts],
  )
  useKeyboardShortcuts(activeShortcuts)

  return (
    <div className="flex min-h-screen bg-lavender-mist">
      {/* ─── Left sidebar ─── */}
      <div
        className="relative hidden shrink-0 overflow-hidden border-r border-border-subtle bg-cloud-white transition-[width] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] lg:block"
        style={{
          width: isSidebarHidden ? COLLAPSED_SIDEBAR_WIDTH : sidebarWidth,
        }}
      >
        <div
          aria-hidden={!isSidebarHidden}
          className={cn(
            'absolute inset-0',
            isSidebarHidden
              ? 'panel-fade-in pointer-events-auto'
              : 'panel-fade-out pointer-events-none',
          )}
        >
          <div className="flex h-14 items-center justify-center border-b border-border-subtle">
            <button
              aria-label="Show sidebar"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-text-tertiary transition hover:bg-surface-sunken hover:text-text-primary"
              onClick={() => setIsSidebarHidden(false)}
              type="button"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          </div>
        </div>

        <aside
          aria-hidden={isSidebarHidden}
          className={cn(
            'absolute inset-0 flex flex-col',
            isSidebarHidden
              ? 'panel-exit-left pointer-events-none'
              : 'panel-enter-left pointer-events-auto',
          )}
        >
          {/* Workspace switcher */}
          <div
            className="relative flex h-14 items-center border-b border-border-subtle px-3"
            ref={workspaceMenuRef}
          >
            <div className="flex w-full items-center gap-1">
              <button
                className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-1.5 text-left transition-all duration-200 hover:bg-surface-sunken"
                onClick={() => setIsWorkspaceMenuOpen((open) => !open)}
                type="button"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-electric-violet to-accent-teal text-sm font-bold text-white shadow-sm">
                  {overview.workspace.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-text-primary">
                    {overview.workspace.name}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-text-tertiary">
                    <CircleDot className="h-2 w-2 text-success-green" />
                    {overview.workspace.role}
                  </span>
                </div>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-text-tertiary transition-transform duration-200',
                    isWorkspaceMenuOpen ? 'rotate-180' : '',
                  )}
                />
              </button>
              <button
                aria-label="Hide sidebar"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-text-tertiary transition hover:bg-surface-sunken hover:text-text-primary"
                onClick={() => setIsSidebarHidden(true)}
                type="button"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>

            {isWorkspaceMenuOpen ? (
              <div className="absolute left-3 top-full z-30 mt-1 w-[min(22rem,calc(100vw-2rem))] animate-scale-in rounded-2xl border border-border-subtle bg-cloud-white p-1.5 shadow-elevated">
                {workspaceItems.map((workspace) => {
                  const isCurrentWorkspace =
                    workspace.slug === overview.workspace.slug

                  return (
                    <button
                      key={workspace.id}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-150',
                        isCurrentWorkspace
                          ? 'bg-electric-violet/8 text-text-primary'
                          : 'text-text-secondary hover:bg-surface-sunken hover:text-text-primary',
                      )}
                      onClick={() => switchWorkspace(workspace.slug)}
                      type="button"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-electric-violet/20 to-accent-teal/20 text-sm font-bold text-electric-violet">
                        {workspace.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {workspace.name}
                        </span>
                        <span className="text-xs text-text-tertiary">
                          {workspace.role}
                        </span>
                      </div>
                      {isCurrentWorkspace ? (
                        <span className="rounded-md bg-electric-violet/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-electric-violet">
                          Active
                        </span>
                      ) : null}
                    </button>
                  )
                })}
                <div className="my-1 h-px bg-border-subtle" />
                <button
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-text-secondary transition-all duration-150 hover:bg-surface-sunken hover:text-text-primary"
                  disabled={createWorkspace.isPending}
                  onClick={requestCreateWorkspace}
                  type="button"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-electric-violet">
                    <Plus className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-medium">
                    {createWorkspace.isPending
                      ? 'Creating workspace…'
                      : 'Create workspace'}
                  </span>
                </button>
              </div>
            ) : null}
          </div>

          <NotificationCenter overview={overview} />

          {/* Section navigation */}
          <nav className="flex flex-1 flex-col gap-0.5 px-3 py-4">
            {/* Boards list */}
            <div className="mb-1 flex items-center justify-between px-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">
                Boards
              </p>
              <div className="relative" ref={createBoardMenuRef}>
                <button
                  aria-label="Create board"
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-text-tertiary transition hover:bg-surface-sunken hover:text-text-primary"
                  onClick={() => setIsCreateBoardMenuOpen((open) => !open)}
                  type="button"
                >
                  <Plus className="h-4 w-4" />
                </button>
                {isCreateBoardMenuOpen ? (
                  <div
                    className="absolute left-0 top-8 z-40 w-[min(22rem,calc(100vw-2rem))] animate-scale-in rounded-2xl border border-border-subtle bg-cloud-white p-3 text-sm shadow-elevated"
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <p className="px-1 text-xs font-semibold uppercase tracking-[0.18em] text-text-tertiary">
                      New board
                    </p>
                    <label className="mt-3 block text-xs font-semibold text-text-secondary">
                      Board type
                    </label>
                    <select
                      className="mt-1 w-full rounded-xl border border-border-subtle bg-surface-sunken px-3 py-2.5 text-sm text-text-primary outline-none transition focus:border-electric-violet focus:shadow-glow-violet"
                      disabled={overview.boardTypes.length === 0}
                      onChange={(event) =>
                        setNewBoardTypeId(event.target.value)
                      }
                      value={newBoardTypeId}
                    >
                      {overview.boardTypes.map((boardType) => (
                        <option key={boardType.id} value={boardType.id}>
                          {boardType.name}
                        </option>
                      ))}
                    </select>
                    <label className="mt-3 block text-xs font-semibold text-text-secondary">
                      Name
                    </label>
                    <input
                      className="mt-1 w-full rounded-xl border border-border-subtle bg-cloud-white px-3 py-2.5 text-sm text-text-primary outline-none transition focus:border-electric-violet focus:shadow-glow-violet"
                      onChange={(event) => setNewBoardName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          requestCreateBoard()
                        }
                      }}
                      value={newBoardName}
                    />
                    <button
                      className="mt-3 flex w-full items-center justify-center rounded-xl bg-electric-violet px-3 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={
                        !newBoardName.trim() ||
                        !selectedNewBoardType ||
                        createBoard.isPending
                      }
                      onClick={requestCreateBoard}
                      type="button"
                    >
                      {createBoard.isPending ? 'Creating…' : 'Create board'}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            {overview.boards.length > 0 ? (
              <>
                {overview.boards.map((board) => {
                  const boardSeenAt = board.viewerSeenAt ?? 0
                  const latestExternalAt =
                    board.latestExternalChange?.createdAt ?? 0
                  const hasUnreadExternal =
                    latestExternalAt > boardSeenAt &&
                    board.latestExternalChange?.actorId !==
                      overview.viewerUserId
                  return (
                    <div
                      key={board.id}
                      className={cn(
                        'group relative flex items-center rounded-xl transition-all duration-200',
                        activeBoardId === board.id
                          ? 'bg-electric-violet/10 text-electric-violet'
                          : 'text-text-secondary hover:bg-surface-sunken hover:text-text-primary',
                      )}
                    >
                      <Link
                        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium"
                        onFocus={() => prefetchBoard(board.id)}
                        onMouseEnter={() => prefetchBoard(board.id)}
                        params={{
                          boardId: board.id,
                          workspaceSlug: overview.workspace.slug,
                        }}
                        to="/w/$workspaceSlug/boards/$boardId"
                      >
                        <SquareKanban className="h-[18px] w-[18px] shrink-0" />
                        <span className="truncate">{board.name}</span>
                        {hasUnreadExternal ? (
                          <span
                            aria-label="Unread external changes"
                            className="ml-auto h-2 w-2 shrink-0 rounded-full bg-sky-500"
                            title="Unread external changes"
                          />
                        ) : null}
                      </Link>
                      <button
                        aria-label={`Options for ${board.name}`}
                        className={cn(
                          'mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-tertiary transition hover:bg-cloud-white hover:text-text-primary',
                          openBoardMenuId === board.id
                            ? 'opacity-100'
                            : 'opacity-0 group-hover:opacity-100',
                        )}
                        onClick={() =>
                          setOpenBoardMenuId((current) =>
                            current === board.id ? null : board.id,
                          )
                        }
                        onPointerDown={(event) => event.stopPropagation()}
                        type="button"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                      {openBoardMenuId === board.id ? (
                        <div
                          className="absolute right-1 top-9 z-40 w-44 rounded-2xl border border-border-subtle bg-cloud-white p-1.5 text-sm shadow-elevated"
                          onPointerDown={(event) => event.stopPropagation()}
                          ref={boardMenuRef}
                        >
                          <button
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-text-secondary transition hover:bg-surface-sunken hover:text-text-primary"
                            onClick={() =>
                              requestRenameBoard(board.id, board.name)
                            }
                            type="button"
                          >
                            <Pencil className="h-4 w-4" />
                            Rename
                          </button>
                          <button
                            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-red-600 transition hover:bg-red-50"
                            onClick={() =>
                              requestDeleteBoard(board.id, board.name)
                            }
                            type="button"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete board
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-border-subtle px-3 py-5 text-center text-sm text-text-tertiary">
                No boards yet.
              </div>
            )}
            {sidebarNavigationExtensions.length ? (
              <div className="mt-5 space-y-1 border-t border-border-subtle pt-4">
                {sidebarNavigationExtensions.map(({ extension, pluginId }) => (
                  <div key={`${pluginId}:${extension.id}`}>
                    {extension.render({
                      slot: 'shell.sidebar.navigation',
                      pluginId,
                      workspaceSlug: overview.workspace.slug,
                    })}
                  </div>
                ))}
              </div>
            ) : null}
          </nav>

          {/* Bottom actions */}
          <div className="border-t border-border-subtle px-3 py-3">
            <Link
              className={cn(
                'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
                section === 'settings'
                  ? 'bg-electric-violet/10 text-electric-violet'
                  : 'text-text-secondary hover:bg-surface-sunken hover:text-text-primary',
              )}
              params={{ workspaceSlug: overview.workspace.slug }}
              to="/w/$workspaceSlug/settings"
            >
              <Settings2 className="h-[18px] w-[18px]" />
              Settings
            </Link>
          </div>
          <button
            aria-hidden={isSidebarHidden}
            aria-label="Resize sidebar"
            className={cn(
              'absolute -right-1 top-0 h-full w-2 touch-none bg-transparent transition hover:bg-electric-violet/20',
              isSidebarHidden
                ? 'pointer-events-none cursor-default opacity-0'
                : 'cursor-col-resize opacity-100',
            )}
            onPointerDown={isSidebarHidden ? undefined : startSidebarResize}
            type="button"
          />
        </aside>
      </div>

      {/* ─── Main content ─── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile topbar (visible on small screens only) */}
        <div className="border-b border-border-subtle bg-cloud-white/90 backdrop-blur-xl lg:hidden">
          <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-electric-violet to-accent-teal text-sm font-bold text-white">
                {overview.workspace.name.charAt(0).toUpperCase()}
              </div>
              <span className="truncate text-sm font-semibold text-text-primary">
                {overview.workspace.name}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Link
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
                  section === 'overview'
                    ? 'bg-electric-violet/10 text-electric-violet'
                    : 'text-text-secondary hover:bg-surface-sunken',
                )}
                params={{ workspaceSlug: overview.workspace.slug }}
                to="/w/$workspaceSlug"
              >
                Overview
              </Link>
              <Link
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-all',
                  section === 'settings'
                    ? 'bg-electric-violet/10 text-electric-violet'
                    : 'text-text-secondary hover:bg-surface-sunken',
                )}
                params={{ workspaceSlug: overview.workspace.slug }}
                to="/w/$workspaceSlug/settings"
              >
                Settings
              </Link>
            </div>
          </div>
        </div>

        <main className="flex min-h-0 flex-1 flex-col">
          {header ? (
            <div className="px-6 pt-6 animate-fade-in">{header}</div>
          ) : null}
          <div
            className={cn(
              'min-h-0 flex-1 animate-fade-in',
              section === 'board' ? '' : 'px-6 py-5',
            )}
          >
            {children}
          </div>
        </main>
      </div>
      {isShortcutHelpOpen ? (
        <KeyboardShortcutsDialog
          onClose={() => setIsShortcutHelpOpen(false)}
          shortcuts={activeShortcuts}
        />
      ) : null}
    </div>
  )
}
