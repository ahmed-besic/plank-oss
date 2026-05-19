import { useMutation } from '@tanstack/react-query'
import { useCallback } from 'react'
import { toast } from 'sonner'
import { api } from '@convex/_generated/api'
import type { BoardActionContext } from './context'
import { invalidateBoardAndOverview } from './context'

export function usePluginBoardActions(context: BoardActionContext) {
  const syncPluginViewsMutation = useMutation({
    mutationFn: async () =>
      context.convexClient.mutation(api.boards.syncPluginViews, {
        workspaceSlug: context.workspaceSlug,
        boardId: context.boardId as never,
      }),
    onError: () => {
      toast.error('Could not sync plugin views')
    },
    onSuccess: async () => {
      await invalidateBoardAndOverview(context)
    },
  })

  const syncPluginViews = useCallback(async () => {
    await syncPluginViewsMutation.mutateAsync()
  }, [syncPluginViewsMutation])

  return {
    syncPluginViews,
  }
}
