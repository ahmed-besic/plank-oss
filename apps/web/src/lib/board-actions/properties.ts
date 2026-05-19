import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api } from '@convex/_generated/api'
import type { BoardActionContext } from './context'
import { getBoardData, invalidateBoard } from './context'

export function usePropertyBoardActions(context: BoardActionContext) {
  const createPropertyMutation = useMutation({
    mutationFn: async (payload: {
      name: string
      type: string
      config?: Record<string, unknown>
      typeKey?: string
    }) => {
      const boardData = getBoardData(context)
      const typeKey = payload.typeKey ?? boardData?.cardTypes[0]?.id
      if (!typeKey) {
        throw new Error('Card type not found')
      }

      return context.convexClient.mutation(api.cardTypes.createProperty, {
        workspaceSlug: context.workspaceSlug,
        typeKey,
        name: payload.name,
        type: payload.type,
        config: payload.config,
      })
    },
    onError: () => {
      toast.error('Could not add card property')
    },
    onSuccess: async () => {
      await invalidateBoard(context)
    },
  })

  const deletePropertyMutation = useMutation({
    mutationFn: async (payload: { propertyKey: string; typeKey?: string }) => {
      const boardData = getBoardData(context)
      const typeKey = payload.typeKey ?? boardData?.cardTypes[0]?.id
      if (!typeKey) {
        throw new Error('Card type not found')
      }

      return context.convexClient.mutation(api.cardTypes.deleteProperty, {
        workspaceSlug: context.workspaceSlug,
        typeKey,
        propertyKey: payload.propertyKey,
      })
    },
    onError: () => {
      toast.error('Could not delete card property')
    },
    onSuccess: async () => {
      await invalidateBoard(context)
    },
  })

  const updatePropertyOptionsMutation = useMutation({
    mutationFn: async (payload: {
      propertyKey: string
      options: Array<{ color?: string; label: string; value: string }>
      typeKey?: string
    }) => {
      const boardData = getBoardData(context)
      const typeKey = payload.typeKey ?? boardData?.cardTypes[0]?.id
      if (!typeKey) {
        throw new Error('Card type not found')
      }

      return context.convexClient.mutation(api.cardTypes.updatePropertyOptions, {
        workspaceSlug: context.workspaceSlug,
        typeKey,
        propertyKey: payload.propertyKey,
        options: payload.options,
      })
    },
    onError: () => {
      toast.error('Could not update property options')
    },
    onSuccess: async () => {
      await invalidateBoard(context)
    },
  })

  return {
    addProperty: async (
      name: string,
      type: string,
      config?: Record<string, unknown>,
      typeKey?: string,
    ) => {
      await createPropertyMutation.mutateAsync({ name, type, config, typeKey })
    },
    deleteProperty: async (propertyKey: string, typeKey?: string) => {
      await deletePropertyMutation.mutateAsync({ propertyKey, typeKey })
    },
    updatePropertyOptions: async (
      propertyKey: string,
      options: Array<{ color?: string; label: string; value: string }>,
      typeKey?: string,
    ) => {
      await updatePropertyOptionsMutation.mutateAsync({
        propertyKey,
        options,
        typeKey,
      })
    },
  }
}
