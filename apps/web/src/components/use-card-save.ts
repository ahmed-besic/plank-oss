import { useCallback, useEffect, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import { toast } from 'sonner'

const SAVE_RETRY_DELAYS_MS = [0, 500, 1200]

export type PersistSnapshot<TBody = Array<Record<string, unknown>>> = {
  title: string
  body: TBody
  propertyUpdates: Record<string, unknown>
  tagIds: string[]
  statusKey?: string
  baseUpdatedAt: number
}

export function useCardSave<TBody>({
  cardId,
  clearDraft,
  dirtyRef,
  hasMeaningfulChanges,
  getSnapshot,
  isMountedRef,
  onRequestClose,
  saveSnapshot,
}: {
  cardId: string
  clearDraft: (cardId: string) => void
  dirtyRef: MutableRefObject<boolean>
  hasMeaningfulChanges: (snapshot: PersistSnapshot<TBody>) => boolean
  getSnapshot: () => PersistSnapshot<TBody>
  isMountedRef: MutableRefObject<boolean>
  onRequestClose: () => void
  saveSnapshot: (snapshot: PersistSnapshot<TBody>) => Promise<{
    stale?: boolean
    serverUpdatedAt?: number
  } | void>
}) {
  const [isClosing, setIsClosing] = useState(false)
  const saveRequestInFlightRef = useRef(false)
  const latestSnapshotRef = useRef<PersistSnapshot<TBody> | null>(null)
  const hasMeaningfulChangesRef = useRef(hasMeaningfulChanges)
  const persistWithRetryRef = useRef<
    (snapshot: PersistSnapshot<TBody>) => Promise<void>
  >(async () => {})

  const persistWithRetry = useCallback(
    async (snapshot: PersistSnapshot<TBody>) => {
      if (saveRequestInFlightRef.current) {
        return
      }
      saveRequestInFlightRef.current = true

      try {
        let stale = false
        let staleAt: number | undefined
        let lastError: unknown = null

        for (const delay of SAVE_RETRY_DELAYS_MS) {
          if (delay > 0) {
            await new Promise((resolve) => window.setTimeout(resolve, delay))
          }
          try {
            const result = await saveSnapshot(snapshot)
            stale = Boolean(result?.stale)
            staleAt = result?.serverUpdatedAt
            lastError = null
            break
          } catch (error) {
            lastError = error
          }
        }

        if (lastError) {
          toast.error(
            'Card close-save failed. Your local draft is kept safely.',
          )
          return
        }

        clearDraft(cardId)
        dirtyRef.current = false
        if (stale) {
          const serverDate =
            typeof staleAt === 'number'
              ? new Date(staleAt).toLocaleString()
              : 'a newer version'
          toast.warning(
            `This save overwrote newer server edits (${serverDate}) due to last-write-wins.`,
          )
        } else {
          toast.success('Card saved')
        }
      } finally {
        saveRequestInFlightRef.current = false
      }
    },
    [cardId, clearDraft, dirtyRef, saveSnapshot],
  )

  const closeAndSave = useCallback(async () => {
    if (isClosing) {
      return
    }

    if (!dirtyRef.current) {
      setIsClosing(true)
      onRequestClose()
      return
    }

    const snapshot = getSnapshot()
    const shouldPersist = hasMeaningfulChanges(snapshot)
    if (!shouldPersist) {
      dirtyRef.current = false
      setIsClosing(true)
      onRequestClose()
      return
    }

    setIsClosing(true)
    onRequestClose()
    void persistWithRetry(snapshot).finally(() => {
      if (isMountedRef.current) {
        setIsClosing(false)
      }
    })
  }, [
    dirtyRef,
    hasMeaningfulChanges,
    getSnapshot,
    isClosing,
    isMountedRef,
    onRequestClose,
    persistWithRetry,
  ])

  useEffect(() => {
    persistWithRetryRef.current = persistWithRetry
  }, [persistWithRetry])

  useEffect(() => {
    hasMeaningfulChangesRef.current = hasMeaningfulChanges
  }, [hasMeaningfulChanges])

  useEffect(() => {
    latestSnapshotRef.current = getSnapshot()
  })

  useEffect(() => {
    return () => {
      if (!dirtyRef.current) {
        return
      }
      const snapshot = latestSnapshotRef.current
      if (!snapshot) {
        return
      }
      if (!hasMeaningfulChangesRef.current(snapshot)) {
        dirtyRef.current = false
        return
      }
      void persistWithRetryRef.current(snapshot)
    }
  }, [dirtyRef])

  return {
    closeAndSave,
    isClosing,
  }
}
