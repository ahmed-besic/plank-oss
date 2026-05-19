import { useMutation } from '@tanstack/react-query'
import {
  compareOrderKeys,
  createDefaultCardBody,
  createKeyAfter,
  createKeyBetween,
} from '@plank/domain'
import { toast } from 'sonner'
import { api } from '@convex/_generated/api'
import type { BoardActionContext } from './context'
import { getBoardData, invalidateBoard } from './context'
import type { BoardPageData } from '../types'

function optimisticCardId() {
  return `optimistic:${crypto.randomUUID()}`
}

type CreateCardPayload = {
  title: string
  columnId?: string
  typeKey?: string
  parentId?: string
}

type MoveCardPayload = {
  cardId: string
  columnId: string
  previousOrderKey?: string
  nextOrderKey?: string
}

type UpdateCardPayload = {
  cardId: string
  title?: string
  body?: unknown
  baseUpdatedAt?: number
  propertyUpdates?: Record<string, unknown>
  tagIds?: string[]
  statusKey?: string
}

function resolveStatusKey({ columnId }: { columnId?: string }) {
  return columnId
}

function resolveCreateTypeKey(
  payload: CreateCardPayload,
  data?: BoardPageData,
) {
  return payload.typeKey ?? data?.boardType.defaultCardTypeKey
}

function getCardTypeDefinition(data: BoardPageData, typeKey: string) {
  return data.cardTypes.find((cardType) => cardType.key === typeKey)
}

function getOptimisticOrderKey(
  data: BoardPageData,
  payload: Pick<UpdateCardPayload, 'cardId' | 'statusKey'>,
  currentStatusKey: string,
) {
  if (!payload.statusKey || payload.statusKey === currentStatusKey) {
    return undefined
  }
  const lastOrderKey = data.cards
    .filter(
      (card) =>
        card.id !== payload.cardId && card.statusKey === payload.statusKey,
    )
    .sort((left, right) => compareOrderKeys(left.orderKey, right.orderKey))
    .at(-1)?.orderKey
  return createKeyAfter(lastOrderKey)
}

export function useCardBoardActions(context: BoardActionContext) {
  const createCardMutation = useMutation({
    mutationFn: async (payload: CreateCardPayload) => {
      const typeKey = resolveCreateTypeKey(payload, getBoardData(context))
      if (!typeKey) {
        throw new Error('Card type not found')
      }

      return context.convexClient.mutation(api.cards.createCard, {
        workspaceSlug: context.workspaceSlug,
        boardId: context.boardId as never,
        viewInstanceId: context.viewId,
        title: payload.title,
        parentId: payload.parentId as never,
        typeKey,
        columnId: payload.columnId,
        statusKey: resolveStatusKey({ columnId: payload.columnId }),
      })
    },
    onMutate: async (payload) => {
      await context.queryClient.cancelQueries({
        queryKey: context.boardQueryKey,
      })
      const previous = getBoardData(context)
      const targetColumn = payload.columnId
        ? previous?.board.columns.find(
            (column) => column.id === payload.columnId,
          )
        : previous?.board.columns[0]
      if (!previous || !targetColumn) {
        return { previous }
      }

      const typeKey = resolveCreateTypeKey(payload, previous)
      if (!typeKey) {
        return { previous }
      }

      const lastOrderKey = previous.cards
        .filter((card) => card.statusKey === targetColumn.statusKey)
        .sort((left, right) => compareOrderKeys(left.orderKey, right.orderKey))
        .at(-1)?.orderKey
      const optimisticCard = {
        id: optimisticCardId(),
        boardId: context.boardId,
        scopeId: previous.activeViewMode === 'private' && previous.activeViewInstanceId
          ? previous.activeViewInstanceId
          : 'shared',
        typeKey,
        parentId: payload.parentId ?? null,
        typeSchemaVersion: 1,
        title: payload.title,
        meta: {
          title: payload.title,
        },
        statusKey: targetColumn.statusKey,
        orderKey: lastOrderKey ? `${lastOrderKey}z` : 'a0',
        properties: {},
        fields: {
          core: {},
          custom: {},
        },
        relations: [],
        tagIds: [],
        body: createDefaultCardBody(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        createdBy: 'local',
      }

      context.queryClient.setQueryData<BoardPageData>(context.boardQueryKey, {
        ...previous,
        cards: [...previous.cards, optimisticCard],
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
      toast.error('Could not create card')
    },
    onSettled: async () => {
      await invalidateBoard(context)
    },
  })

  const moveCardMutation = useMutation({
    mutationFn: async (payload: MoveCardPayload) =>
      context.convexClient.mutation(api.cards.moveCard, {
        workspaceSlug: context.workspaceSlug,
        boardId: context.boardId as never,
        cardId: payload.cardId as never,
        columnId: payload.columnId,
        statusKey: resolveStatusKey({ columnId: payload.columnId }),
        previousOrderKey: payload.previousOrderKey,
        nextOrderKey: payload.nextOrderKey,
      }),
    onMutate: async (payload) => {
      await context.queryClient.cancelQueries({
        queryKey: context.boardQueryKey,
      })
      const previous = getBoardData(context)
      if (!previous) {
        return { previous }
      }

      const targetColumn = previous.board.columns.find(
        (column) => column.id === payload.columnId,
      )
      if (!targetColumn) {
        return { previous }
      }

      context.queryClient.setQueryData<BoardPageData>(context.boardQueryKey, {
        ...previous,
        cards: previous.cards.map((card) =>
          card.id === payload.cardId
            ? {
                ...card,
                statusKey: targetColumn.statusKey,
                orderKey: createKeyBetween(
                  payload.previousOrderKey,
                  payload.nextOrderKey,
                ),
              }
            : card,
        ),
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
      toast.error('Could not move card')
    },
    onSettled: async () => {
      await invalidateBoard(context)
    },
  })

  const updateCardMutation = useMutation({
    mutationFn: async (payload: UpdateCardPayload) =>
      context.convexClient.mutation(api.cards.updateCard, {
        workspaceSlug: context.workspaceSlug,
        boardId: context.boardId as never,
        cardId: payload.cardId as never,
        title: payload.title,
        body: payload.body,
        baseUpdatedAt: payload.baseUpdatedAt,
        propertyUpdates: payload.propertyUpdates,
        tagIds: payload.tagIds as never,
        statusKey: payload.statusKey,
      }),
    onMutate: async (payload) => {
      await context.queryClient.cancelQueries({
        queryKey: context.boardQueryKey,
      })
      const previous = getBoardData(context)
      if (!previous) {
        return { previous }
      }

      context.queryClient.setQueryData<BoardPageData>(context.boardQueryKey, {
        ...previous,
        cards: previous.cards.map((card) => {
          if (card.id !== payload.cardId) {
            return card
          }

          const optimisticOrderKey = getOptimisticOrderKey(
            previous,
            payload,
            card.statusKey,
          )
          const cardType = getCardTypeDefinition(previous, card.typeKey)
          const propertyEntries = Object.entries(payload.propertyUpdates ?? {})
          const nextCoreFields = { ...card.fields.core }
          const nextCustomFields = { ...card.fields.custom }

          for (const [propertyKey, value] of propertyEntries) {
            const definition = cardType?.propertiesSchema.find(
              (candidate) => candidate.key === propertyKey,
            )
            const isCustom =
              typeof definition?.config === 'object' &&
              (definition.config as Record<string, unknown>).source === 'custom'
            if (isCustom) {
              nextCustomFields[propertyKey] = value
              continue
            }
            nextCoreFields[propertyKey] = value
          }

          return {
            ...card,
            meta:
              payload.title !== undefined
                ? { ...card.meta, title: payload.title }
                : card.meta,
            title: payload.title ?? card.title,
            body:
              payload.body !== undefined
                ? (payload.body as BoardPageData['cards'][number]['body'])
                : card.body,
            statusKey: payload.statusKey ?? card.statusKey,
            orderKey: optimisticOrderKey ?? card.orderKey,
            fields: {
              core: nextCoreFields,
              custom: nextCustomFields,
            },
            properties: {
              ...card.properties,
              ...(payload.propertyUpdates ?? {}),
            },
            tagIds: payload.tagIds ?? card.tagIds,
            updatedAt: Date.now(),
          }
        }),
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
      toast.error('Could not save card')
    },
    onSuccess: async () => {
      await invalidateBoard(context)
    },
  })

  const deleteCardMutation = useMutation({
    mutationFn: async (cardId: string) =>
      context.convexClient.mutation(api.cards.deleteCard, {
        workspaceSlug: context.workspaceSlug,
        boardId: context.boardId as never,
        cardId: cardId as never,
      }),
    onMutate: async (cardId) => {
      await context.queryClient.cancelQueries({
        queryKey: context.boardQueryKey,
      })
      const previous = getBoardData(context)
      if (!previous) {
        return { previous }
      }

      context.queryClient.setQueryData<BoardPageData>(context.boardQueryKey, {
        ...previous,
        cards: previous.cards.filter((card) => card.id !== cardId),
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
      toast.error('Could not delete card')
    },
    onSettled: async () => {
      await invalidateBoard(context)
    },
  })

  const generateCardUploadUrlMutation = useMutation({
    mutationFn: async () =>
      context.convexClient.mutation(api.cards.generateCardUploadUrl, {
        workspaceSlug: context.workspaceSlug,
        boardId: context.boardId as never,
      }),
  })

  return {
    createCard: async (
      title: string,
      columnId?: string,
      typeKey?: string,
      parentId?: string,
    ) => {
      const result = await createCardMutation.mutateAsync({
        title,
        columnId,
        typeKey,
        parentId,
      })
      return result.cardId as string | undefined
    },
    createSubTask: async (
      parentId: string,
      title: string,
      typeKey?: string,
    ) => {
      const firstColumn = getBoardData(context)?.board.columns[0]
      const result = await context.convexClient.mutation(
        api.cards.createSubTask,
        {
          workspaceSlug: context.workspaceSlug,
          boardId: context.boardId as never,
          parentId: parentId as never,
          title,
          typeKey,
          columnId: firstColumn?.id,
          statusKey: firstColumn?.statusKey,
        },
      )
      await invalidateBoard(context)
      return result.cardId as string | undefined
    },
    moveCard: async (
      cardId: string,
      columnId: string,
      previousOrderKey?: string,
      nextOrderKey?: string,
    ) => {
      await moveCardMutation.mutateAsync({
        cardId,
        columnId,
        previousOrderKey,
        nextOrderKey,
      })
    },
    updateCard: async (payload: UpdateCardPayload) => {
      return await updateCardMutation.mutateAsync(payload)
    },
    deleteCard: async (cardId: string) => {
      await deleteCardMutation.mutateAsync(cardId)
    },
    requestCardUploadUrl: async () => {
      const response = await generateCardUploadUrlMutation.mutateAsync()
      return response.uploadUrl
    },
    resolveCardFileUrl: async (storageId: string) => {
      const response = await context.convexClient.query(
        api.cards.resolveCardFileUrl,
        {
          workspaceSlug: context.workspaceSlug,
          boardId: context.boardId as never,
          storageId: storageId as never,
        },
      )
      return response.url ?? null
    },
  }
}
