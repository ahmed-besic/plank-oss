import { convexQuery } from '@convex-dev/react-query'
import { api } from '@convex/_generated/api'
import { usePlankApp } from '../providers'
import type { BoardPageData } from '../types'

export interface BoardActionOptions {
  boardId: string
  viewId?: string
  workspaceSlug: string
}

export interface BoardActionContext {
  boardId: string
  viewId?: string
  workspaceSlug: string
  convexClient: ReturnType<typeof usePlankApp>['convexClient']
  queryClient: ReturnType<typeof usePlankApp>['queryClient']
  boardQueryKey: unknown[]
  overviewQueryKey: unknown[]
}

export function useBoardActionContext({
  workspaceSlug,
  boardId,
  viewId,
}: BoardActionOptions): BoardActionContext {
  const { convexClient, queryClient } = usePlankApp()
  const boardQuery = convexQuery(api.boards.getBoardPage, {
    workspaceSlug,
    boardId: boardId as never,
    viewId,
  })
  const overviewQuery = convexQuery(api.workspaces.getOverview, {
    workspaceSlug,
  })

  return {
    boardId,
    viewId,
    workspaceSlug,
    convexClient,
    queryClient,
    boardQueryKey: boardQuery.queryKey,
    overviewQueryKey: overviewQuery.queryKey,
  }
}

export function getBoardData(context: BoardActionContext) {
  return context.queryClient.getQueryData<BoardPageData>(context.boardQueryKey)
}

export async function invalidateBoard(context: BoardActionContext) {
  await context.queryClient.invalidateQueries({ queryKey: context.boardQueryKey })
}

export async function invalidateBoardAndOverview(context: BoardActionContext) {
  await context.queryClient.invalidateQueries({ queryKey: context.boardQueryKey })
  await context.queryClient.invalidateQueries({ queryKey: context.overviewQueryKey })
}
