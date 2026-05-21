import { useMutation } from '@tanstack/react-query'
import { api } from '@convex/_generated/api'
import type { BoardViewConfigValue } from '@plank/domain'
import type { BoardActionContext } from './context'
import { getBoardData, invalidateBoard } from './context'
import type { BoardPageData } from '../types'

export function useViewBoardActions(context: BoardActionContext) {
  const addBoardViewMutation = useMutation({
    mutationFn: async ({
      definitionViewId,
      instanceMode,
    }: {
      definitionViewId: string
      instanceMode: 'shared' | 'private'
    }) =>
      context.convexClient.mutation(api.boards.addBoardView, {
        workspaceSlug: context.workspaceSlug,
        boardId: context.boardId as never,
        definitionViewId,
        instanceMode,
      }),
    onError: () => {},
    onSettled: async () => {
      await invalidateBoard(context)
    },
  })

  const updateViewConfigMutation = useMutation({
    mutationFn: async ({
      instanceId,
      config,
    }: {
      instanceId: string
      config: BoardViewConfigValue
    }) =>
      context.convexClient.mutation(api.boards.updateBoardViewConfig, {
        workspaceSlug: context.workspaceSlug,
        boardId: context.boardId as never,
        instanceId,
        config,
      }),
    onMutate: async ({ instanceId, config }) => {
      await context.queryClient.cancelQueries({ queryKey: context.boardQueryKey })
      const previous = getBoardData(context)
      if (!previous) {
        return { previous }
      }

      context.queryClient.setQueryData<BoardPageData>(context.boardQueryKey, {
        ...previous,
        views: previous.views.map((view) =>
          view.instanceId === instanceId ? { ...view, config } : view,
        ),
      })

      return { previous }
    },
    onError: (_error, _payload, snapshot) => {
      if (snapshot?.previous) {
        context.queryClient.setQueryData(context.boardQueryKey, snapshot.previous)
      }
    },
    onSettled: async () => {
      await invalidateBoard(context)
    },
  })

  const removeBoardViewMutation = useMutation({
    mutationFn: async (instanceId: string) =>
      context.convexClient.mutation((api.boards as any).removeBoardView, {
        workspaceSlug: context.workspaceSlug,
        boardId: context.boardId as never,
        instanceId,
      }),
    onError: () => {},
    onSettled: async () => {
      await invalidateBoard(context)
    },
  })

  return {
    addBoardView: async (
      definitionViewId: string,
      instanceMode: 'shared' | 'private',
    ) => {
      const response = await addBoardViewMutation.mutateAsync({
        definitionViewId,
        instanceMode,
      })
      return response.instanceId as string | undefined
    },
    removeBoardView: async (instanceId: string) => {
      await removeBoardViewMutation.mutateAsync(instanceId)
    },
    updateViewConfig: async (
      instanceId: string,
      config: BoardViewConfigValue,
    ) => {
      await updateViewConfigMutation.mutateAsync({ instanceId, config })
    },
  }
}
