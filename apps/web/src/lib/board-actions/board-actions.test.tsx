/* @vitest-environment jsdom */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook } from '@testing-library/react'
import type {ReactNode} from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCardBoardActions } from './cards'
import { useColumnBoardActions } from './columns'
import { usePluginBoardActions } from './plugins'
import { usePropertyBoardActions } from './properties'
import { useViewBoardActions } from './views'
import type { BoardActionContext } from './context'
import type { BoardPageData } from '../types'

vi.mock('@convex/_generated/api', () => ({
  api: {
    boards: {
      addBoardView: 'boards.addBoardView',
      updateBoardViewConfig: 'boards.updateBoardViewConfig',
      removeBoardView: 'boards.removeBoardView',
      syncPluginViews: 'boards.syncPluginViews',
    },
    cards: {
      createCard: 'cards.createCard',
      createSubTask: 'cards.createSubTask',
      moveCard: 'cards.moveCard',
      updateCard: 'cards.updateCard',
      deleteCard: 'cards.deleteCard',
      generateCardUploadUrl: 'cards.generateCardUploadUrl',
      resolveCardFileUrl: 'cards.resolveCardFileUrl',
      listSubTasks: 'cards.listSubTasks',
    },
    boardTypes: {
      createStatus: 'boardTypes.createStatus',
      renameStatusLabel: 'boardTypes.renameStatusLabel',
      reorderStatuses: 'boardTypes.reorderStatuses',
      deleteStatus: 'boardTypes.deleteStatus',
    },
    cardTypes: {
      createProperty: 'cardTypes.createProperty',
      deleteProperty: 'cardTypes.deleteProperty',
      updatePropertyOptions: 'cardTypes.updatePropertyOptions',
    },
    workspaces: {
      getOverview: 'workspaces.getOverview',
    },
  },
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
    message: vi.fn(),
  },
}))

function createBoardPageData(): BoardPageData {
  return {
    workspace: {
      id: 'workspace-1',
      name: 'Workspace',
      slug: 'demo',
    },
    board: {
      id: 'board-1',
      name: 'Board',
      workspaceId: 'workspace-1',
      boardTypeId: 'board-type-1',
      columns: [
        { id: 'todo', statusKey: 'todo', title: 'To do', orderKey: 'a0' },
        { id: 'done', statusKey: 'done', title: 'Done', orderKey: 'a1' },
      ],
    },
    boardType: {
      id: 'board-type-1',
      workspaceId: 'workspace-1',
      key: 'task',
      name: 'Task',
      lifecycleConfig: {
        statuses: [
          { key: 'todo', label: 'To do', category: 'todo', orderKey: 'a0' },
          { key: 'done', label: 'Done', category: 'done', orderKey: 'a1' },
        ],
        initialStatusKey: 'todo',
      },
      defaultViewIds: ['core-kanban:board'],
      defaultCardTypeKey: 'task',
    },
    cardTypes: [
      {
        id: 'task',
        workspaceId: 'workspace-1',
        key: 'task',
        name: 'Task',
        schemaVersion: 1,
        propertiesSchema: [],
        defaultTagIds: [],
      },
    ],
    tagDefinitions: [],
    cards: [
      {
        id: 'card-1',
        boardId: 'board-1',
        typeKey: 'task',
        typeSchemaVersion: 1,
        title: 'First',
        meta: { title: 'First' },
        statusKey: 'todo',
        orderKey: 'a0',
        properties: {},
        fields: { core: {}, custom: {} },
        relations: [],
        tagIds: [],
        body: { type: 'blocknote', content: [] },
        createdBy: 'user-1',
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    members: [],
    views: [
      {
        instanceId: 'view-core-kanban-shared',
        definitionViewId: 'core-kanban:board',
        instanceMode: 'shared',
        viewId: 'core-kanban:board',
        kind: 'core',
        label: 'Board',
        orderKey: 'a0',
        isDefault: true,
        config: { density: 'comfortable' },
      },
    ],
    enabledPluginIds: ['core-kanban'],
    viewerUserId: 'user-1',
  }
}

function createHarness() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  const mutation = vi.fn(
    async (_reference: unknown, _args: unknown): Promise<unknown> => undefined,
  )
  const invalidateQueries = vi
    .spyOn(queryClient, 'invalidateQueries')
    .mockResolvedValue(undefined)
  const boardQueryKey = ['board', 'demo', 'board-1']
  const overviewQueryKey = ['overview', 'demo']
  queryClient.setQueryData(boardQueryKey, createBoardPageData())

  const context: BoardActionContext = {
    boardId: 'board-1',
    workspaceSlug: 'demo',
    convexClient: {
      mutation,
    } as any,
    queryClient,
    boardQueryKey,
    overviewQueryKey,
  }

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )

  return { context, invalidateQueries, mutation, queryClient, wrapper }
}

describe('board action hooks', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('creates cards with the default card type and optimistic board update', async () => {
    let resolveMutation: (() => void) | undefined
    const { context, mutation, queryClient, wrapper } = createHarness()
    mutation.mockImplementation(
      async () =>
        await new Promise<{ cardId: string }>((resolve) => {
          resolveMutation = () => resolve({ cardId: 'server-card-1' })
        }),
    )

    const { result } = renderHook(() => useCardBoardActions(context), {
      wrapper,
    })

    let promise!: Promise<unknown>
    await act(async () => {
      promise = result.current.createCard('New card', 'done')
      await Promise.resolve()
    })

    const cached = queryClient.getQueryData<BoardPageData>(
      context.boardQueryKey,
    )
    expect(cached?.cards.some((card) => card.title === 'New card')).toBe(true)
    expect(mutation).toHaveBeenCalledWith(expect.anything(), {
      workspaceSlug: 'demo',
      boardId: 'board-1',
      title: 'New card',
      parentId: undefined,
      typeKey: 'task',
      columnId: 'done',
      statusKey: 'done',
    })

    resolveMutation?.()
    await act(async () => {
      await promise
    })
  })

  it('moves cards optimistically into the target status', async () => {
    let resolveMutation: (() => void) | undefined
    const { context, mutation, queryClient, wrapper } = createHarness()
    mutation.mockImplementation(
      async () =>
        await new Promise<void>((resolve) => {
          resolveMutation = () => resolve()
        }),
    )

    const { result } = renderHook(() => useCardBoardActions(context), {
      wrapper,
    })

    let promise!: Promise<void>
    await act(async () => {
      promise = result.current.moveCard('card-1', 'done', 'a0', undefined)
      await Promise.resolve()
    })

    expect(
      queryClient
        .getQueryData<BoardPageData>(context.boardQueryKey)
        ?.cards.find((card) => card.id === 'card-1')?.statusKey,
    ).toBe('done')

    resolveMutation?.()
    await act(async () => {
      await promise
    })
  })

  it('updates cards optimistically when the drawer changes status and rolls back on failure', async () => {
    let rejectMutation: ((error: Error) => void) | undefined
    const { context, mutation, queryClient, wrapper } = createHarness()
    mutation.mockImplementation(
      async () =>
        await new Promise<void>((_resolve, reject) => {
          rejectMutation = () => reject(new Error('save failed'))
        }),
    )

    const { result } = renderHook(() => useCardBoardActions(context), {
      wrapper,
    })

    let promise!: Promise<unknown>
    await act(async () => {
      promise = result.current.updateCard({
        cardId: 'card-1',
        statusKey: 'done',
        propertyUpdates: { dueDate: 1234567890 },
      })
      await Promise.resolve()
    })

    const optimisticCard = queryClient
      .getQueryData<BoardPageData>(context.boardQueryKey)
      ?.cards.find((card) => card.id === 'card-1')
    expect(optimisticCard?.statusKey).toBe('done')
    expect(optimisticCard?.fields.core.dueDate).toBe(1234567890)

    rejectMutation?.(new Error('save failed'))
    await act(async () => {
      await expect(promise).rejects.toThrow('save failed')
    })

    const rolledBackCard = queryClient
      .getQueryData<BoardPageData>(context.boardQueryKey)
      ?.cards.find((card) => card.id === 'card-1')
    expect(rolledBackCard?.statusKey).toBe('todo')
    expect(rolledBackCard?.fields.core.dueDate).toBeUndefined()
  })

  it('routes property creation through the selected or default card type', async () => {
    const { context, mutation, wrapper } = createHarness()
    const { result } = renderHook(() => usePropertyBoardActions(context), {
      wrapper,
    })

    await act(async () => {
      await result.current.addProperty('Priority', 'select', { options: [] })
    })

    expect(mutation).toHaveBeenCalledWith(expect.anything(), {
      workspaceSlug: 'demo',
      typeKey: 'task',
      name: 'Priority',
      type: 'select',
      config: { options: [] },
    })
  })

  it('updates view config optimistically for the matching board view', async () => {
    let resolveMutation: (() => void) | undefined
    const { context, mutation, queryClient, wrapper } = createHarness()
    mutation.mockImplementation(
      async () =>
        await new Promise<void>((resolve) => {
          resolveMutation = () => resolve()
        }),
    )

    const { result } = renderHook(() => useViewBoardActions(context), {
      wrapper,
    })

    let promise!: Promise<void>
    await act(async () => {
      promise = result.current.updateViewConfig('view-core-kanban-shared', {
        density: 'compact',
      })
      await Promise.resolve()
    })

    expect(
      queryClient.getQueryData<BoardPageData>(context.boardQueryKey)?.views[0]
        ?.config,
    ).toEqual({ density: 'compact' })

    resolveMutation?.()
    await act(async () => {
      await promise
    })
  })

  it('derives the destination status when deleting a column', async () => {
    const { context, mutation, wrapper } = createHarness()
    const { result } = renderHook(() => useColumnBoardActions(context), {
      wrapper,
    })

    await act(async () => {
      await result.current.deleteColumn('todo')
    })

    expect(mutation).toHaveBeenCalledWith(expect.anything(), {
      workspaceSlug: 'demo',
      boardTypeId: 'board-type-1',
      statusKey: 'todo',
      destinationStatusKey: 'done',
    })
  })

  it('invalidates both board and overview when syncing plugin views', async () => {
    const { context, invalidateQueries, wrapper } = createHarness()
    const { result } = renderHook(() => usePluginBoardActions(context), {
      wrapper,
    })

    await act(async () => {
      await result.current.syncPluginViews()
    })

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: context.boardQueryKey,
    })
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: context.overviewQueryKey,
    })
  })
})
