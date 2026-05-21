import { convexQuery } from '@convex-dev/react-query'
import { useCreateBlockNote } from '@blocknote/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { normalizeCardBody } from '@plank/domain'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePlankApp } from '../lib/providers'
import { api } from '../../../../convex/_generated/api'
import {
  dehydrateContent,
  hydrateContentWithSignedUrls,
  isPersistedCardId,
  toBlockNoteContent,
} from './card-drawer-content'
import { cardDrawerSchema } from './card-drawer-mention-schema'
import { clearCardDraft } from './card-drawer-draft'
import type { BlockNoteDoc, CardDrawerProps } from './card-drawer-types'
import { useCardDraft } from './use-card-draft'
import { useCardImageHandling } from './use-card-image-handling'
import { useCardSave } from './use-card-save'

type RelationType = 'relates_to' | 'blocked_by' | 'references'

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonValue)
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, sortJsonValue(nestedValue)]),
    )
  }
  return value
}

function stableSerialize(value: unknown) {
  return JSON.stringify(sortJsonValue(value))
}

function filterPropertyValues(
  values: Record<string, unknown>,
  allowedKeys: Set<string>,
) {
  return Object.fromEntries(
    Object.entries(values).filter(([key]) => allowedKeys.has(key)),
  )
}

function serializeCardBody(content: BlockNoteDoc) {
  return stableSerialize(
    normalizeCardBody({
      type: 'blocknote',
      content,
    }).content,
  )
}

function areStringArraysEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}

export function useCardDrawerState({
  activePluginPropertyTypes,
  boardType,
  cardType,
  card,
  workspaceSlug,
  onClose,
  onRequestCardUploadUrl,
  onResolveCardFileUrl,
  onSave,
}: Pick<
  CardDrawerProps,
  | 'activePluginPropertyTypes'
  | 'boardType'
  | 'cardType'
  | 'card'
  | 'workspaceSlug'
  | 'onClose'
  | 'onRequestCardUploadUrl'
  | 'onResolveCardFileUrl'
  | 'onSave'
>) {
  const initialBody = useMemo(() => toBlockNoteContent(card.body), [card.body])
  const mergedFieldValues = useMemo(
    () => ({
      ...card.fields.core,
      ...card.fields.custom,
    }),
    [card.fields.core, card.fields.custom],
  )
  const [title, setTitle] = useState(card.meta.title)
  const [propertyValues, setPropertyValues] =
    useState<Record<string, unknown>>(mergedFieldValues)
  const [statusKey, setStatusKey] = useState(card.statusKey)
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>(card.tagIds)
  const [newPropertyName, setNewPropertyName] = useState('')
  const [newPropertyType, setNewPropertyType] = useState('text')
  const [newSelectOptions, setNewSelectOptions] = useState<string>('Option 1')
  const [isAddingProperty, setIsAddingProperty] = useState(false)
  const [expandedPluginSlotId, setExpandedPluginSlotId] = useState<
    string | null
  >(null)
  const [editingSelectOptionsKey, setEditingSelectOptionsKey] = useState<
    string | null
  >(null)
  const [selectOptionsDraft, setSelectOptionsDraft] = useState<
    Array<{ color?: string; label: string; value: string }>
  >([])
  const [baseUpdatedAt, setBaseUpdatedAt] = useState(card.updatedAt)
  const [relationType, setRelationType] = useState<RelationType>('relates_to')
  const [relationSearchTerm, setRelationSearchTerm] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dirtyRef = useRef(false)
  const skipNextDraftWriteRef = useRef(false)
  const suppressEditorChangeRef = useRef(false)
  const isMountedRef = useRef(true)
  const { convexClient, queryClient } = usePlankApp()

  const pluginPropertyTypeMap = useMemo(
    () =>
      new Map(
        activePluginPropertyTypes.map((propertyType) => [
          propertyType.id,
          propertyType,
        ]),
      ),
    [activePluginPropertyTypes],
  )
  const propertyTypeOptions = useMemo(
    () =>
      activePluginPropertyTypes.map((propertyType) => ({
        id: propertyType.id,
        label: propertyType.label,
      })),
    [activePluginPropertyTypes],
  )
  const statusOptions = boardType.lifecycleConfig.statuses
  const statusLabel =
    statusOptions.find((status) => status.key === statusKey)?.label ?? statusKey
  const dueDateDefinition = useMemo(
    () =>
      cardType?.propertiesSchema.find(
        (definition) =>
          definition.key === 'dueDate' &&
          (String(definition.type) === 'timestamp' ||
            String(definition.type) === 'date'),
      ),
    [cardType],
  )
  const hasInlineDueDate = Boolean(dueDateDefinition)
  const visiblePropertyDefinitions = useMemo(
    () =>
      (cardType?.propertiesSchema ?? []).filter(
        (definition) => !hasInlineDueDate || definition.key !== 'dueDate',
      ),
    [cardType, hasInlineDueDate],
  )
  const propertyKeySet = useMemo(
    () =>
      new Set(
        cardType
          ? cardType.propertiesSchema.map((definition) => definition.key)
          : Object.keys(mergedFieldValues),
      ),
    [cardType, mergedFieldValues],
  )
  const sanitizePropertyValues = useCallback(
    (values: Record<string, unknown>) =>
      filterPropertyValues(values, propertyKeySet),
    [propertyKeySet],
  )
  const persistedCardId = isPersistedCardId(card.id) ? card.id : null

  const relationsOptions = convexQuery(api.cards.getCardRelations, {
    workspaceSlug,
    boardId: card.boardId as never,
    cardId: (persistedCardId ?? '') as never,
  })
  const relationsQuery = useQuery({
    ...relationsOptions,
    enabled: Boolean(persistedCardId),
  })
  const relationSearchOptions = convexQuery(
    api.search.searchWorkspaceCardTitles,
    {
      workspaceSlug,
      term: relationSearchTerm,
      excludeCardId: card.id as never,
      limit: 8,
    },
  )
  const relationSearchQuery = useQuery({
    ...relationSearchOptions,
    enabled: relationSearchTerm.trim().length > 0,
  })
  const boardPageOptions = convexQuery(api.boards.getBoardPage, {
    workspaceSlug,
    boardId: card.boardId as never,
  })

  const addRelation = useMutation({
    mutationFn: async (payload: {
      type: RelationType
      targetCardId: string
    }) => {
      if (!persistedCardId) {
        throw new Error('Card must be saved before adding relations')
      }
      return convexClient.mutation(api.cards.addCardRelation, {
        workspaceSlug,
        boardId: card.boardId as never,
        cardId: persistedCardId as never,
        type: payload.type,
        targetCardId: payload.targetCardId as never,
      })
    },
    onSuccess: async () => {
      setRelationSearchTerm('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: relationsOptions.queryKey }),
        queryClient.invalidateQueries({ queryKey: boardPageOptions.queryKey }),
      ])
    },
  })
  const removeRelation = useMutation({
    mutationFn: async (payload: {
      type: RelationType
      targetCardId: string
    }) => {
      if (!persistedCardId) {
        throw new Error('Card must be saved before removing relations')
      }
      return convexClient.mutation(api.cards.removeCardRelation, {
        workspaceSlug,
        boardId: card.boardId as never,
        cardId: persistedCardId as never,
        type: payload.type,
        targetCardId: payload.targetCardId as never,
      })
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: relationsOptions.queryKey }),
        queryClient.invalidateQueries({ queryKey: boardPageOptions.queryKey }),
      ])
    },
  })
  const createTag = useMutation({
    mutationFn: async (payload: { color?: string; name: string }) =>
      convexClient.mutation(api.tags.createTag, {
        workspaceSlug,
        name: payload.name,
        color: payload.color,
      }),
    onSuccess: async (result) => {
      markDirty()
      setSelectedTagIds((current) => [...current, String(result.tagId)])
      await queryClient.invalidateQueries({ queryKey: boardPageOptions.queryKey })
    },
  })
  const updateTag = useMutation({
    mutationFn: async (payload: { color?: string; name?: string; tagId: string }) =>
      convexClient.mutation(api.tags.updateTag, {
        workspaceSlug,
        tagId: payload.tagId as never,
        name: payload.name,
        color: payload.color,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: boardPageOptions.queryKey })
    },
  })
  const deleteTag = useMutation({
    mutationFn: async (tagId: string) =>
      convexClient.mutation(api.tags.deleteTag, {
        workspaceSlug,
        tagId: tagId as never,
      }),
    onSuccess: async (_, tagId) => {
      markDirty()
      setSelectedTagIds((current) =>
        current.filter((currentTagId) => currentTagId !== tagId),
      )
      await queryClient.invalidateQueries({ queryKey: boardPageOptions.queryKey })
    },
  })

  const editor = useCreateBlockNote({
    initialContent: initialBody,
    schema: cardDrawerSchema,
  })
  const rawOutgoingRelations = relationsQuery.data?.outgoing ?? []
  const outgoingRelations = rawOutgoingRelations.filter(
    (
      relation,
    ): relation is Exclude<(typeof rawOutgoingRelations)[number], null> =>
      relation !== null,
  )
  const incomingRelations = relationsQuery.data?.incoming ?? []
  const workspaceRelationSearchResults = relationSearchQuery.data ?? []
  const blockNoteEditor = editor as any

  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    setRelationSearchTerm('')
  }, [card.id])

  const { pendingDraft, restoreDraft, setPendingDraft } = useCardDraft({
    baseUpdatedAt,
    blockNoteEditor,
    card,
    dehydrateContent,
    dirtyRef,
    hydrateContentWithSignedUrls,
    mergedFieldValues,
    onResolveCardFileUrl,
    propertyValues,
    sanitizePropertyValues,
    selectedTagIds,
    setStatusKey,
    setBaseUpdatedAt,
    setEditingSelectOptionsKey,
    setExpandedPluginSlotId,
    setIsAddingProperty,
    setNewPropertyName,
    setNewPropertyType,
    setNewSelectOptions,
    setPropertyValues,
    setSelectedTagIds,
    setTitle,
    statusKey,
    skipNextDraftWriteRef,
    suppressEditorChangeRef,
    title,
    toBlockNoteContent,
  })
  const { closeAndSave } = useCardSave<BlockNoteDoc>({
    cardId: card.id,
    clearDraft: clearCardDraft,
    dirtyRef,
    hasMeaningfulChanges: (snapshot) => {
      const baselineBody = dehydrateContent(initialBody)
      const hasBodyChanges =
        serializeCardBody(snapshot.body) !== serializeCardBody(baselineBody)
      const hasTitleChanges = snapshot.title !== card.meta.title
      const hasPropertyChanges =
        stableSerialize(sanitizePropertyValues(snapshot.propertyUpdates)) !==
        stableSerialize(sanitizePropertyValues(mergedFieldValues))
      const hasTagChanges = !areStringArraysEqual(snapshot.tagIds, card.tagIds)
      const nextStatusKey = snapshot.statusKey ?? card.statusKey
      const hasStatusChanges = nextStatusKey !== card.statusKey

      return (
        hasBodyChanges ||
        hasTitleChanges ||
        hasPropertyChanges ||
        hasTagChanges ||
        hasStatusChanges
      )
    },
    getSnapshot: () => ({
      title,
      propertyUpdates: sanitizePropertyValues(propertyValues),
      tagIds: selectedTagIds,
      statusKey: statusKey === card.statusKey ? undefined : statusKey,
      body: dehydrateContent(blockNoteEditor.document as BlockNoteDoc),
      baseUpdatedAt,
    }),
    isMountedRef,
    onClose,
    saveSnapshot: async (snapshot) =>
      await onSave({
        title: snapshot.title,
        body: {
          type: 'blocknote',
          content: snapshot.body,
        },
        propertyUpdates: snapshot.propertyUpdates,
        tagIds: snapshot.tagIds,
        statusKey: snapshot.statusKey,
        baseUpdatedAt: snapshot.baseUpdatedAt,
      }),
  })

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }
      if (pendingDraft) {
        return
      }
      if (isAddingProperty || editingSelectOptionsKey) {
        event.preventDefault()
        return
      }

      const activeElement = document.activeElement as HTMLElement | null
      if (activeElement?.closest('.bn-container, .bn-editor')) {
        return
      }

      event.preventDefault()
      void closeAndSave()
    }

    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [closeAndSave, editingSelectOptionsKey, isAddingProperty, pendingDraft])

  const { onImageInputChange } = useCardImageHandling({
    blockNoteEditor,
    dirtyRef,
    fileInputRef,
    onRequestCardUploadUrl,
    onResolveCardFileUrl,
    pendingDraft,
  })

  const selectOptionsEditorDefinition = editingSelectOptionsKey
    ? cardType?.propertiesSchema.find(
        (definition) => definition.key === editingSelectOptionsKey,
      )
    : undefined

  const markDirty = () => {
    if (suppressEditorChangeRef.current) {
      return
    }
    dirtyRef.current = true
  }

  const toggleTag = (tagId: string) => {
    markDirty()
    setSelectedTagIds((current) =>
      current.includes(tagId)
        ? current.filter((currentTagId) => currentTagId !== tagId)
        : [...current, tagId],
    )
  }

  const updateStatusKey = (nextStatusKey: string) => {
    if (nextStatusKey === statusKey) {
      return
    }
    setStatusKey(nextStatusKey)
    markDirty()
  }

  const dueDateValue = hasInlineDueDate ? propertyValues.dueDate : undefined

  const updatePropertyValue = (propertyKey: string, value: unknown) => {
    markDirty()
    setPropertyValues((current) => ({
      ...current,
      [propertyKey]: value,
    }))
  }

  const removePropertyValue = (propertyKey: string) => {
    setPropertyValues((current) => {
      const next = { ...current }
      delete next[propertyKey]
      return next
    })
  }

  const openSelectOptionsEditor = (
    definition: NonNullable<typeof cardType>['propertiesSchema'][number],
  ) => {
    const options = Array.isArray(definition.config?.options)
      ? definition.config.options.map((option) => ({
          label: String(option.label),
          value: String(option.value),
          color:
            typeof option.color === 'string' && option.color.length > 0
              ? option.color
              : 'violet',
        }))
      : []
    setEditingSelectOptionsKey(definition.key)
    setSelectOptionsDraft(options.length ? options : [{ label: 'Option 1', value: 'option_1', color: 'violet' }])
  }

  const resetPropertyComposer = () => {
    setIsAddingProperty(false)
    setNewPropertyName('')
    setNewPropertyType('text')
    setNewSelectOptions('Option 1')
  }

  const handleTitleChange = (nextTitle: string) => {
    setTitle(nextTitle)
    markDirty()
  }

  return {
    addRelation,
    blockNoteEditor,
    closeAndSave,
    createTag,
    deleteTag,
    dirtyRef,
    editingSelectOptionsKey,
    expandedPluginSlotId,
    fileInputRef,
    incomingRelations,
    isAddingProperty,
    markDirty,
    newPropertyName,
    newPropertyType,
    newSelectOptions,
    onImageInputChange,
    openSelectOptionsEditor,
    outgoingRelations,
    pendingDraft,
    persistedCardId,
    pluginPropertyTypeMap,
    propertyTypeOptions,
    propertyValues,
    dueDateDefinition,
    dueDateValue,
    hasInlineDueDate,
    relationSearchTerm,
    relationType,
    removePropertyValue,
    removeRelation,
    resetPropertyComposer,
    restoreDraft,
    selectOptionsDraft,
    selectOptionsEditorDefinition,
    selectedTagIds,
    setEditingSelectOptionsKey,
    setExpandedPluginSlotId,
    setIsAddingProperty,
    setNewPropertyName,
    setNewPropertyType,
    setNewSelectOptions,
    setPendingDraft,
    setRelationSearchTerm,
    setRelationType,
    setSelectOptionsDraft,
    setSelectedTagIds,
    setStatusKey,
    statusKey,
    statusOptions,
    statusLabel,
    title,
    toggleTag,
    updateTag,
    updateStatusKey,
    updatePropertyValue,
    visiblePropertyDefinitions,
    workspaceRelationSearchResults,
    handleTitleChange,
  }
}
