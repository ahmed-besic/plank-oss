import { convexQuery } from '@convex-dev/react-query'
import { useMutation, useQuery } from '@tanstack/react-query'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useConvexAuth,
} from 'convex/react'
import { ArrowRight, Plus } from 'lucide-react'
import { Button, Input, Surface } from '@plank/ui'
import { useEffect, useMemo, useState } from 'react'
import { api } from '@convex/_generated/api'
import { usePlankApp } from '../../lib/providers'
import type { WorkspaceOverviewData } from '../../lib/types'
import { useHydrated } from '../../lib/use-hydrated'
import { WorkspaceShell } from '../../components/workspace-shell'

 
const createRoute = createFileRoute as any

export const Route = createRoute('/w/$workspaceSlug/')({
  component: WorkspaceRoute,
})

function WorkspaceRoute() {
  const { workspaceSlug } = Route.useParams()
  const hydrated = useHydrated()
  const auth = useConvexAuth()
  const navigate = useNavigate()
  const { convexClient, queryClient } = usePlankApp()
  const [boardName, setBoardName] = useState('New board')
  const [selectedBoardStyleId, setSelectedBoardStyleId] = useState('')
  const overviewOptions = convexQuery(api.workspaces.getOverview, {
    workspaceSlug,
  })
  const templatesOptions = convexQuery(api.plugins.listBoardTypeTemplates, {
    workspaceSlug,
  })
  const overviewQuery = useQuery({
    ...overviewOptions,
    enabled: hydrated && auth.isAuthenticated,
  })
  const templatesQuery = useQuery({
    ...templatesOptions,
    enabled: hydrated && auth.isAuthenticated,
  })
  const boardStyleOptions = useMemo(() => {
    const templates = (templatesQuery.data ?? []).map((template) => ({
      id: `template:${template.pluginId}:${template.templateId}:${template.version}`,
      kind: 'template' as const,
      label: template.name,
      description: template.description ?? 'Plugin board style',
      defaultViewId: template.defaultViewIds[0] ?? 'core-kanban:board',
      template,
    }))
    if (templates.length > 0) {
      return templates
    }

    const boardTypes = (overviewQuery.data?.boardTypes ?? []).map((boardType) => ({
      id: `boardType:${boardType.id}`,
      kind: 'boardType' as const,
      label: boardType.name,
      description: 'Workspace board type',
      defaultViewId: boardType.defaultViewIds[0] ?? 'core-kanban:board',
      boardType,
    }))
    return boardTypes
  }, [overviewQuery.data?.boardTypes, templatesQuery.data])

  useEffect(() => {
    if (selectedBoardStyleId || boardStyleOptions.length === 0) {
      return
    }
    setSelectedBoardStyleId(boardStyleOptions[0]?.id ?? '')
  }, [boardStyleOptions, selectedBoardStyleId])

  const createBoard = useMutation({
    mutationFn: async () => {
      const selected = boardStyleOptions.find(
        (option) => option.id === selectedBoardStyleId,
      )
      if (!selected) {
        throw new Error('Choose a board style first')
      }

      let boardTypeId: string
      if (selected.kind === 'template') {
        if (
          selected.template.requiresExtensionEnable &&
          !selected.template.isEnabled
        ) {
          await convexClient.mutation(api.workspaces.setExtensionStatus, {
            workspaceSlug,
            pluginId: selected.template.pluginId,
            status: 'enabled',
          })
        }
        const boardType = await convexClient.mutation(
          api.boardTypes.createBoardType,
          {
            workspaceSlug,
            name: selected.template.name,
            templateRef: {
              pluginId: selected.template.pluginId,
              templateId: selected.template.templateId,
              version: selected.template.version,
            },
          },
        )
        boardTypeId = boardType.boardTypeId
      } else {
        boardTypeId = selected.boardType.id
      }

      const board = await convexClient.mutation(api.workspaces.createBoard, {
        workspaceSlug,
        name: boardName,
        boardTypeId: boardTypeId as never,
      })

      return {
        ...board,
        viewId: selected.defaultViewId,
      }
    },
    onSuccess: async (result) => {
      setBoardName('New board')
      await queryClient.invalidateQueries({
        queryKey: overviewOptions.queryKey,
      })
      void navigate({
        params: {
          boardId: result.boardId,
          workspaceSlug,
        },
        search: {
          view: result.viewId,
        },
        to: '/w/$workspaceSlug/boards/$boardId',
      } as never)
    },
  })

  return (
    <>
      <AuthLoading>
        <div className="p-8 text-text-secondary">Loading workspace…</div>
      </AuthLoading>
      <Unauthenticated>
        <div className="p-8">
          <Link to="/login">
            <Button>Sign in to open this workspace</Button>
          </Link>
        </div>
      </Unauthenticated>
      <Authenticated>
        {overviewQuery.data ? (
          <WorkspaceLoaded
            boardName={boardName}
            createBoard={() => createBoard.mutate()}
            boardStyleOptions={boardStyleOptions}
            isCreatingBoard={createBoard.isPending}
            onBoardNameChange={setBoardName}
            onBoardStyleChange={setSelectedBoardStyleId}
            selectedBoardStyleId={selectedBoardStyleId}
            overview={overviewQuery.data}
          />
        ) : (
          <div className="p-8 text-text-secondary">Loading workspace…</div>
        )}
      </Authenticated>
    </>
  )
}

function WorkspaceLoaded({
  boardName,
  createBoard,
  boardStyleOptions,
  isCreatingBoard,
  onBoardNameChange,
  onBoardStyleChange,
  selectedBoardStyleId,
  overview,
}: {
  boardName: string
  createBoard: () => void
  boardStyleOptions: Array<{
    id: string
    label: string
    description: string
  }>
  isCreatingBoard: boolean
  onBoardNameChange: (value: string) => void
  onBoardStyleChange: (value: string) => void
  selectedBoardStyleId: string
  overview: WorkspaceOverviewData
}) {
  return (
    <WorkspaceShell
      section="overview"
      header={
        <div className="section-card flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-text-primary">
              Create a board
            </h2>
            <p className="mt-1.5 text-sm text-text-secondary">
              Name it, choose the first view, and add other views later inside the board.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <select
              className="w-full rounded-xl border border-border-subtle bg-cloud-white px-3 py-2.5 text-sm text-text-primary outline-none transition focus:border-electric-violet focus:shadow-glow-violet sm:w-56"
              onChange={(event) => onBoardStyleChange(event.target.value)}
              value={selectedBoardStyleId}
            >
              {boardStyleOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <Input
              className="w-full sm:w-72"
              onChange={(event) => onBoardNameChange(event.target.value)}
              value={boardName}
            />
            <Button
              className="w-full sm:w-auto"
              disabled={!boardName.trim() || !selectedBoardStyleId || isCreatingBoard}
              onClick={createBoard}
            >
              <Plus className="mr-2 h-4 w-4" />
              {isCreatingBoard ? 'Creating…' : 'Create board'}
            </Button>
          </div>
        </div>
      }
      overview={overview}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_320px]">
        <div className="section-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-text-primary">
                Boards
              </h2>
              <p className="mt-1.5 text-sm text-text-secondary">
                Open the board you want to work on.
              </p>
            </div>
            <Link
              params={{ workspaceSlug: overview.workspace.slug }}
              to="/w/$workspaceSlug/settings"
            >
              <Button tone="ghost" size="sm">
                Workspace settings
              </Button>
            </Link>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            {overview.boards.map((board) => (
              <Link
                key={board.id}
                params={{
                  boardId: board.id,
                  workspaceSlug: overview.workspace.slug,
                }}
                to="/w/$workspaceSlug/boards/$boardId"
              >
                <Surface className="group h-full p-5 transition-all duration-200 hover:border-electric-violet/20 hover:shadow-card-hover">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-semibold text-text-primary transition-colors group-hover:text-electric-violet">
                        {board.name}
                      </h3>
                      <p className="mt-1.5 text-sm text-text-tertiary">
                        {overview.boardTypes.find(
                          (boardType) => boardType.id === board.boardTypeId,
                        )?.name ?? 'Board type'}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-text-placeholder transition-colors group-hover:text-electric-violet" />
                  </div>
                </Surface>
              </Link>
            ))}
          </div>
        </div>

        <div className="section-card">
          <h2 className="text-xl font-bold text-text-primary">
            Workspace settings
          </h2>
          <p className="mt-2 text-sm leading-7 text-text-secondary">
            Use the settings page to manage workspace access, enable extensions,
            send invites, or leave the session.
          </p>
          <div className="mt-6">
            <Link
              params={{ workspaceSlug: overview.workspace.slug }}
              to="/w/$workspaceSlug/settings"
            >
              <Button>Open settings</Button>
            </Link>
          </div>
        </div>
      </div>
    </WorkspaceShell>
  )
}
