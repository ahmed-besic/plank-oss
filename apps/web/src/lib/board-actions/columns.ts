import { useMutation } from '@tanstack/react-query'
import { compareOrderKeys, createKeyBetween } from '@plank/domain'
import { toast } from 'sonner'
import { api } from '@convex/_generated/api'
import type { BoardActionContext } from './context'
import { getBoardData, invalidateBoard } from './context'
import type { BoardPageData } from '../types'

export function useColumnBoardActions(context: BoardActionContext) {
  const createColumnMutation = useMutation({
    mutationFn: async (title: string) => {
      const boardData = getBoardData(context)
      if (!boardData) {
        throw new Error('Board is not loaded')
      }

      return context.convexClient.mutation(api.boardTypes.createStatus, {
        workspaceSlug: context.workspaceSlug,
        boardTypeId: boardData.boardType.id as never,
        label: title,
      })
    },
    onError: () => {
      toast.error('Could not create column')
    },
    onSuccess: async () => {
      await invalidateBoard(context)
    },
  })

  const renameColumnMutation = useMutation({
    mutationFn: async (payload: { columnId: string; title: string }) => {
      const boardData = getBoardData(context)
      const column = boardData?.board.columns.find(
        (candidate) => candidate.id === payload.columnId,
      )
      if (!boardData || !column) {
        throw new Error('Column not found')
      }

      return context.convexClient.mutation(api.boardTypes.renameStatusLabel, {
        workspaceSlug: context.workspaceSlug,
        boardTypeId: boardData.boardType.id as never,
        statusKey: column.statusKey,
        label: payload.title,
      })
    },
    onError: () => {
      toast.error('Could not rename column')
    },
    onSuccess: async () => {
      await invalidateBoard(context)
    },
  })

  const reorderColumnMutation = useMutation({
    mutationFn: async (payload: {
      columnId: string
      previousOrderKey?: string
      nextOrderKey?: string
    }) => {
      const boardData = getBoardData(context)
      const column = boardData?.board.columns.find(
        (candidate) => candidate.id === payload.columnId,
      )
      if (!boardData || !column) {
        throw new Error('Column not found')
      }

      return context.convexClient.mutation(api.boardTypes.reorderStatuses, {
        workspaceSlug: context.workspaceSlug,
        boardTypeId: boardData.boardType.id as never,
        statusKey: column.statusKey,
        previousOrderKey: payload.previousOrderKey,
        nextOrderKey: payload.nextOrderKey,
      })
    },
    onMutate: async (payload) => {
      await context.queryClient.cancelQueries({ queryKey: context.boardQueryKey })
      const previous = getBoardData(context)
      if (!previous) {
        return { previous }
      }

      const sourceIndex = previous.board.columns.findIndex(
        (column) => column.id === payload.columnId,
      )
      if (sourceIndex === -1) {
        return { previous }
      }

      const remainingColumns = previous.board.columns.filter(
        (column) => column.id !== payload.columnId,
      )
      const previousIndex = payload.previousOrderKey
        ? remainingColumns.findIndex(
            (column) => column.orderKey === payload.previousOrderKey,
          )
        : -1
      const nextIndex = payload.nextOrderKey
        ? remainingColumns.findIndex((column) => column.orderKey === payload.nextOrderKey)
        : -1
      const insertIndex =
        previousIndex !== -1
          ? previousIndex + 1
          : nextIndex !== -1
            ? nextIndex
            : remainingColumns.length
      const movedColumn = previous.board.columns[sourceIndex]
      const nextColumns = [...remainingColumns]

      nextColumns.splice(insertIndex, 0, {
        ...movedColumn,
        orderKey: createKeyBetween(payload.previousOrderKey, payload.nextOrderKey),
      })

      context.queryClient.setQueryData<BoardPageData>(context.boardQueryKey, {
        ...previous,
        board: {
          ...previous.board,
          columns: nextColumns,
        },
      })

      return { previous }
    },
    onError: (_error, _payload, contextSnapshot) => {
      if (contextSnapshot?.previous) {
        context.queryClient.setQueryData(
          context.boardQueryKey,
          contextSnapshot.previous,
        )
      }
      toast.error('Could not reorder column')
    },
    onSuccess: async () => {
      await invalidateBoard(context)
    },
  })

  const deleteColumnMutation = useMutation({
    mutationFn: async (columnId: string) => {
      const boardData = getBoardData(context)
      if (!boardData) {
        throw new Error('Board is not loaded')
      }

      const columns = [...boardData.board.columns].sort((left, right) =>
        compareOrderKeys(left.orderKey, right.orderKey),
      )
      const index = columns.findIndex((column) => column.id === columnId)
      if (index === -1) {
        throw new Error('Column not found')
      }
      const source = columns[index]
      const destination = (columns[index - 1] ?? columns[index + 1]) as
        | (typeof columns)[number]
        | undefined
      if (destination === undefined) {
        throw new Error('Board needs at least one column')
      }

      return context.convexClient.mutation(api.boardTypes.deleteStatus, {
        workspaceSlug: context.workspaceSlug,
        boardTypeId: boardData.boardType.id as never,
        statusKey: source.statusKey,
        destinationStatusKey: destination.statusKey,
      })
    },
    onError: () => {
      toast.error('Could not delete column')
    },
    onSuccess: async () => {
      await invalidateBoard(context)
    },
  })

  return {
    createColumn: async (title: string) => {
      await createColumnMutation.mutateAsync(title)
    },
    renameColumn: async (columnId: string, title: string) => {
      await renameColumnMutation.mutateAsync({ columnId, title })
    },
    reorderColumn: async (
      columnId: string,
      previousOrderKey?: string,
      nextOrderKey?: string,
    ) => {
      await reorderColumnMutation.mutateAsync({
        columnId,
        previousOrderKey,
        nextOrderKey,
      })
    },
    deleteColumn: async (columnId: string) => {
      await deleteColumnMutation.mutateAsync(columnId)
    },
  }
}
