import { useEffect, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import { normalizeCardBody } from '@plank/domain'
import { toast } from 'sonner'
import {
  DRAFT_DEBOUNCE_MS,
  DRAFT_VERSION,
  clearCardDraft,
  getChangedSections,
  readCardDraft,
  sectionFingerprints,
  writeCardDraft,
} from './card-drawer-draft'
import type { CardDraftPayload, SectionKey } from './card-drawer-draft'

type BlockNoteDoc = Array<Record<string, unknown>>

function areStringArraysEqual(left: string[], right: string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}

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

function serializeCardBody(content: BlockNoteDoc) {
  return stableSerialize(
    normalizeCardBody({
      type: 'blocknote',
      content,
    }).content,
  )
}

export type PendingDraftState = {
  payload: CardDraftPayload
  changedSections: SectionKey[]
  stale: boolean
}

export function useCardDraft({
  baseUpdatedAt,
  blockNoteEditor,
  card,
  dehydrateContent,
  dirtyRef,
  mergedFieldValues,
  onResolveCardFileUrl,
  propertyValues,
  setBaseUpdatedAt,
  setEditingSelectOptionsKey,
  setExpandedPluginSlotId,
  setIsAddingProperty,
  setNewPropertyName,
  setNewPropertyType,
  setNewSelectOptions,
  setPropertyValues,
  setSelectedTagIds,
  setStatusKey,
  setTitle,
  skipNextDraftWriteRef,
  suppressEditorChangeRef,
  statusKey,
  title,
  toBlockNoteContent,
  hydrateContentWithSignedUrls,
  selectedTagIds,
}: {
  baseUpdatedAt: number
  blockNoteEditor: any
  card: {
    id: string
    body: unknown
    meta: { title: string }
    statusKey: string
    tagIds: string[]
    updatedAt: number
  }
  dehydrateContent: (content: BlockNoteDoc) => BlockNoteDoc
  dirtyRef: MutableRefObject<boolean>
  mergedFieldValues: Record<string, unknown>
  onResolveCardFileUrl: (storageId: string) => Promise<string | null>
  propertyValues: Record<string, unknown>
  setBaseUpdatedAt: (value: number) => void
  setEditingSelectOptionsKey: (value: string | null) => void
  setExpandedPluginSlotId: (value: string | null) => void
  setIsAddingProperty: (value: boolean) => void
  setNewPropertyName: (value: string) => void
  setNewPropertyType: (value: string) => void
  setNewSelectOptions: (value: string) => void
  setPropertyValues: (value: Record<string, unknown>) => void
  setSelectedTagIds: (value: string[]) => void
  setStatusKey: (value: string) => void
  setTitle: (value: string) => void
  skipNextDraftWriteRef: MutableRefObject<boolean>
  suppressEditorChangeRef: MutableRefObject<boolean>
  statusKey: string
  title: string
  toBlockNoteContent: (body: unknown) => BlockNoteDoc
  hydrateContentWithSignedUrls: (
    content: BlockNoteDoc,
    resolveUrl: (storageId: string) => Promise<string | null>,
  ) => Promise<BlockNoteDoc>
  selectedTagIds: string[]
}) {
  const [pendingDraft, setPendingDraft] = useState<PendingDraftState | null>(
    null,
  )
  const serverVersionKey = `${card.id}:${card.updatedAt}`
  const activeCardIdRef = useRef(card.id)
  const localStateRef = useRef({
    title,
    propertyValues,
    selectedTagIds,
    statusKey,
  })

  useEffect(() => {
    localStateRef.current = {
      title,
      propertyValues,
      selectedTagIds,
      statusKey,
    }
  }, [propertyValues, selectedTagIds, statusKey, title])

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      const hasDraft = Boolean(readCardDraft(card.id))
      if (!hasDraft && !dirtyRef.current) {
        return
      }
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [card.id, dirtyRef])

  useEffect(() => {
    let cancelled = false

    const resetFromServer = async () => {
      const isCardSwitch = activeCardIdRef.current !== card.id
      const serverBody = toBlockNoteContent(card.body)
      const hydratedServerBody = await hydrateContentWithSignedUrls(
        serverBody,
        onResolveCardFileUrl,
      )
      const localBody = dehydrateContent(blockNoteEditor.document as BlockNoteDoc)
      const serverBodyForComparison = dehydrateContent(serverBody)
      const localState = localStateRef.current
      const hasLocalChanges =
        dirtyRef.current ||
        localState.title !== card.meta.title ||
        localState.statusKey !== card.statusKey ||
        !areStringArraysEqual(localState.selectedTagIds, card.tagIds) ||
        stableSerialize(localState.propertyValues) !==
          stableSerialize(mergedFieldValues) ||
        serializeCardBody(localBody) !== serializeCardBody(serverBodyForComparison)

      if (!isCardSwitch && hasLocalChanges && !dirtyRef.current) {
        dirtyRef.current = true
      }

      if (cancelled || (!isCardSwitch && hasLocalChanges)) {
        return
      }

      setTitle(card.meta.title)
      setPropertyValues(mergedFieldValues)
      setSelectedTagIds(card.tagIds)
      setStatusKey(card.statusKey)
      setBaseUpdatedAt(card.updatedAt)
      setNewPropertyName('')
      setNewPropertyType('text')
      setNewSelectOptions('Option 1')
      setIsAddingProperty(false)
      setExpandedPluginSlotId(null)
      setEditingSelectOptionsKey(null)
      setPendingDraft(null)
      dirtyRef.current = false
      skipNextDraftWriteRef.current = true
      activeCardIdRef.current = card.id

      suppressEditorChangeRef.current = true
      blockNoteEditor.replaceBlocks(
        blockNoteEditor.document,
        hydratedServerBody,
      )
      queueMicrotask(() => {
        suppressEditorChangeRef.current = false
      })

      const existingDraft = readCardDraft(card.id)
      if (!existingDraft) {
        return
      }

      const serverFingerprint = sectionFingerprints({
        title: card.meta.title,
        body: dehydrateContent(serverBody),
        properties: mergedFieldValues,
        tagIds: card.tagIds,
        statusKey: card.statusKey,
      })
      const draftFingerprint = sectionFingerprints({
        title: existingDraft.title,
        body: existingDraft.body,
        properties: existingDraft.propertyValues,
        tagIds: existingDraft.tagIds,
        statusKey: existingDraft.statusKey ?? card.statusKey,
      })
      const draftHasChanges =
        draftFingerprint.title !== serverFingerprint.title ||
        draftFingerprint.body !== serverFingerprint.body ||
        draftFingerprint.properties !== serverFingerprint.properties ||
        draftFingerprint.tags !== serverFingerprint.tags ||
        draftFingerprint.status !== serverFingerprint.status
      if (!draftHasChanges) {
        clearCardDraft(card.id)
        return
      }

      const changedSections = getChangedSections({
        currentServer: serverFingerprint,
        draftBase: existingDraft.baseFingerprint,
      })
      const isStale = card.updatedAt > existingDraft.baseUpdatedAt

      if (isStale) {
        setPendingDraft({
          payload: existingDraft,
          changedSections,
          stale: true,
        })
        return
      }

      setTitle(existingDraft.title)
      setPropertyValues(existingDraft.propertyValues)
      setSelectedTagIds(existingDraft.tagIds)
      setStatusKey(existingDraft.statusKey ?? card.statusKey)
      const hydratedDraftBody = await hydrateContentWithSignedUrls(
        existingDraft.body,
        onResolveCardFileUrl,
      )
      suppressEditorChangeRef.current = true
      blockNoteEditor.replaceBlocks(blockNoteEditor.document, hydratedDraftBody)
      queueMicrotask(() => {
        suppressEditorChangeRef.current = false
      })
      dirtyRef.current = true
      toast.message('Recovered your unsaved draft')
    }

    void resetFromServer()

    return () => {
      cancelled = true
    }
  }, [
    blockNoteEditor,
    dehydrateContent,
    dirtyRef,
    hydrateContentWithSignedUrls,
    onResolveCardFileUrl,
    serverVersionKey,
    setBaseUpdatedAt,
    setEditingSelectOptionsKey,
    setExpandedPluginSlotId,
    setIsAddingProperty,
    setNewPropertyName,
    setNewPropertyType,
    setNewSelectOptions,
    setPropertyValues,
    setSelectedTagIds,
    setStatusKey,
    setTitle,
    card.body,
    card.id,
    card.meta.title,
    card.statusKey,
    card.tagIds,
    card.updatedAt,
    mergedFieldValues,
    skipNextDraftWriteRef,
    suppressEditorChangeRef,
    toBlockNoteContent,
  ])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      if (skipNextDraftWriteRef.current) {
        skipNextDraftWriteRef.current = false
        return
      }

      if (!dirtyRef.current) {
        return
      }

      const currentBody = dehydrateContent(
        blockNoteEditor.document as BlockNoteDoc,
      )
      writeCardDraft({
        version: DRAFT_VERSION,
        cardId: card.id,
        title,
        body: currentBody,
        propertyValues,
        tagIds: selectedTagIds,
        statusKey,
        baseUpdatedAt,
        draftSavedAt: Date.now(),
        baseFingerprint: sectionFingerprints({
          title: card.meta.title,
          body: dehydrateContent(toBlockNoteContent(card.body)),
          properties: mergedFieldValues,
          tagIds: card.tagIds,
          statusKey: card.statusKey,
        }),
      })
    }, DRAFT_DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [
    baseUpdatedAt,
    blockNoteEditor.document,
    card.body,
    card.id,
    card.meta.title,
    card.tagIds,
    dehydrateContent,
    dirtyRef,
    mergedFieldValues,
    propertyValues,
    selectedTagIds,
    statusKey,
    skipNextDraftWriteRef,
    title,
    toBlockNoteContent,
  ])

  const restoreDraft = async (draft: CardDraftPayload) => {
    const hydrated = await hydrateContentWithSignedUrls(
      draft.body,
      onResolveCardFileUrl,
    )
    if (dirtyRef.current) {
      return
    }
    suppressEditorChangeRef.current = true
    blockNoteEditor.replaceBlocks(blockNoteEditor.document, hydrated)
    queueMicrotask(() => {
      suppressEditorChangeRef.current = false
    })
    setTitle(draft.title)
    setPropertyValues(draft.propertyValues)
    setSelectedTagIds(draft.tagIds)
    setStatusKey(draft.statusKey ?? card.statusKey)
    setBaseUpdatedAt(draft.baseUpdatedAt)
    setPendingDraft(null)
    dirtyRef.current = true
    toast.message('Draft restored')
  }

  return {
    pendingDraft,
    restoreDraft,
    setPendingDraft,
  }
}
