import { convexQuery } from '@convex-dev/react-query'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useConvexAuth } from 'convex/react'
import { cn } from '@plank/ui'
import {
  ChevronDown,
  CircleDot,
  LayoutDashboard,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
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
import { useWorkspaceShellLayout } from './use-workspace-shell-layout'

export function WorkspaceShell({
  activeBoardId,
  children,
  header,
  overview,
  section = 'overview',
}: {
  activeBoardId?: string
  children: ReactNode
  header?: ReactNode
  overview: WorkspaceOverviewData
  section?: 'overview' | 'board' | 'settings'
}) {
  const auth = useConvexAuth()
  const hydrated = useHydrated()
  const navigate = useNavigate()
  const { convexClient, pluginRegistry, queryClient } = usePlankApp()
  const workspaceMenuRef = useRef<HTMLDivElement>(null)
  const boardMenuRef = useRef<HTMLDivElement>(null)
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false)
  const [openBoardMenuId, setOpenBoardMenuId] = useState<string | null>(null)
  const { isSidebarHidden, setIsSidebarHidden, sidebarWidth, startSidebarResize } =
    useWorkspaceShellLayout()
  const workspacesQuery = useQuery({
    ...convexQuery(api.workspaces.listMine, {}),
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
        .filter((extension) => extension.installed && extension.status === 'enabled')
        .map((extension) => extension.manifest.id),
    [overview.extensions],
  )
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
      await queryClient.invalidateQueries({ queryKey: overviewOptions.queryKey })
    },
  })
  const deleteBoard = useMutation({
    mutationFn: async (boardId: string) =>
      convexClient.mutation((api.boards as any).deleteBoard, {
        workspaceSlug: overview.workspace.slug,
        boardId,
      }),
    onSuccess: async (_result, boardId) => {
      await queryClient.invalidateQueries({ queryKey: overviewOptions.queryKey })
      if (activeBoardId === boardId) {
        void navigate({
          params: { workspaceSlug: overview.workspace.slug },
          search: {},
          to: '/w/$workspaceSlug',
        } as never)
      }
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
  }, [overview.workspace.slug])

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

  return (
    <div className="flex min-h-screen bg-lavender-mist">
      {/* ─── Left sidebar ─── */}
      {isSidebarHidden ? (
        <button
          aria-label="Show sidebar"
          className="fixed left-3 top-3 z-40 hidden h-9 w-9 items-center justify-center rounded-xl border border-border-subtle bg-cloud-white text-text-secondary shadow-card transition hover:text-text-primary lg:flex"
          onClick={() => setIsSidebarHidden(false)}
          type="button"
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>
      ) : null}
      <aside
        className={cn(
          'relative hidden shrink-0 border-r border-border-subtle bg-cloud-white lg:flex lg:flex-col',
          isSidebarHidden ? 'lg:hidden' : '',
        )}
        style={{ width: sidebarWidth }}
      >
        {/* Workspace switcher */}
        <div
          className="relative border-b border-border-subtle px-3 py-4"
          ref={workspaceMenuRef}
        >
          <div className="flex items-center gap-1">
            <button
              className="group flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-200 hover:bg-surface-sunken"
              onClick={() => setIsWorkspaceMenuOpen((open) => !open)}
              type="button"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-electric-violet to-accent-teal text-sm font-bold text-white shadow-sm">
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
            <div className="absolute left-3 right-3 top-full z-30 mt-1 animate-scale-in rounded-2xl border border-border-subtle bg-cloud-white p-1.5 shadow-elevated">
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
            </div>
          ) : null}
        </div>

        <NotificationCenter overview={overview} />

        {/* Section navigation */}
        <nav className="flex flex-1 flex-col gap-0.5 px-3 py-4">
          <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">
            Navigation
          </p>
          <Link
            className={cn(
              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
              section === 'overview'
                ? 'bg-electric-violet/10 text-electric-violet'
                : 'text-text-secondary hover:bg-surface-sunken hover:text-text-primary',
            )}
            params={{ workspaceSlug: overview.workspace.slug }}
            to="/w/$workspaceSlug"
          >
            <LayoutDashboard className="h-[18px] w-[18px]" />
            Overview
          </Link>
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

          {/* Boards list */}
          {overview.boards.length > 0 ? (
            <>
              <p className="mb-1 mt-6 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">
                Boards
              </p>
              {overview.boards.map((board) => {
                const boardSeenAt = board.viewerSeenAt ?? 0
                const latestExternalAt = board.latestExternalChange?.createdAt ?? 0
                const hasUnreadExternal =
                  latestExternalAt > boardSeenAt &&
                  board.latestExternalChange?.actorId !== overview.viewerUserId
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
                          onClick={() => requestRenameBoard(board.id, board.name)}
                          type="button"
                        >
                          <Pencil className="h-4 w-4" />
                          Rename
                        </button>
                        <button
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-red-600 transition hover:bg-red-50"
                          onClick={() => requestDeleteBoard(board.id, board.name)}
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
          ) : null}
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
          {section !== 'board' ? (
            <select
              aria-label="Boards"
              className="w-full rounded-xl border border-border-subtle bg-surface-sunken px-3 py-2.5 text-sm text-text-primary outline-none transition-all duration-200 focus:border-electric-violet focus:shadow-glow-violet"
              onChange={(event) => {
                if (!event.target.value) {
                  return
                }

                void navigate({
                  params: {
                    boardId: event.target.value,
                    workspaceSlug: overview.workspace.slug,
                  },
                  to: '/w/$workspaceSlug/boards/$boardId',
                } as never)
              }}
              value={activeBoardId ?? ''}
            >
              <option value="">Jump to board…</option>
              {overview.boards.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.name}
                </option>
              ))}
            </select>
          ) : null}
        </div>
        <button
          aria-label="Resize sidebar"
          className="absolute -right-1 top-0 h-full w-2 cursor-col-resize touch-none bg-transparent transition hover:bg-electric-violet/20"
          onPointerDown={startSidebarResize}
          type="button"
        />
      </aside>

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
    </div>
  )
}
