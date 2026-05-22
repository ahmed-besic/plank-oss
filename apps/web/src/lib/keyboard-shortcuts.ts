import { useEffect, useRef } from 'react'

export type ShortcutScope = 'global' | 'board' | 'card' | 'settings'

export interface KeyboardShortcut {
  id: string
  keys: string[]
  description: string
  scope: ShortcutScope
  run: () => void
  allowInInputs?: boolean
  disabled?: boolean
}

const SEQUENCE_TIMEOUT_MS = 900

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  if (target.isContentEditable) {
    return true
  }

  if (target.closest('.bn-container, .bn-editor')) {
    return true
  }

  const tagName = target.tagName.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select'
}

function normalizeKey(event: KeyboardEvent) {
  const key = event.key
  if (key === ' ') {
    return 'space'
  }
  if (key.length === 1) {
    return key.toLowerCase()
  }
  return key.toLowerCase()
}

function matchesShortcut(event: KeyboardEvent, keys: string[]) {
  if (keys.length !== 1) {
    return false
  }

  const parts = keys[0].toLowerCase().split('+')
  const expectedKey = parts.at(-1)
  if (!expectedKey || normalizeKey(event) !== expectedKey) {
    return false
  }

  const wantsMeta = parts.includes('mod')
  const wantsShift = parts.includes('shift')
  const wantsAlt = parts.includes('alt')

  return (
    (wantsMeta
      ? event.metaKey || event.ctrlKey
      : !event.metaKey && !event.ctrlKey) &&
    (wantsShift ? event.shiftKey : !event.shiftKey || expectedKey === '?') &&
    event.altKey === wantsAlt
  )
}

function matchesSequence(sequence: string[], keys: string[]) {
  if (keys.length <= 1 || sequence.length !== keys.length) {
    return false
  }
  return keys.every((key, index) => key.toLowerCase() === sequence[index])
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  const shortcutsRef = useRef(shortcuts)
  const sequenceRef = useRef<string[]>([])
  const timeoutRef = useRef<number | null>(null)

  useEffect(() => {
    shortcutsRef.current = shortcuts
  }, [shortcuts])

  useEffect(() => {
    const clearSequence = () => {
      sequenceRef.current = []
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const activeShortcuts = shortcutsRef.current.filter(
        (shortcut) => !shortcut.disabled,
      )
      const isEditing = isEditableTarget(event.target)
      const directMatch = activeShortcuts.find(
        (shortcut) =>
          (shortcut.allowInInputs || !isEditing) &&
          matchesShortcut(event, shortcut.keys),
      )

      if (directMatch) {
        event.preventDefault()
        clearSequence()
        directMatch.run()
        return
      }

      if (isEditing || event.metaKey || event.ctrlKey || event.altKey) {
        clearSequence()
        return
      }

      const key = normalizeKey(event)
      const nextSequence = [...sequenceRef.current, key].slice(-2)
      sequenceRef.current = nextSequence

      const sequenceMatch = activeShortcuts.find((shortcut) =>
        matchesSequence(nextSequence, shortcut.keys),
      )
      if (sequenceMatch) {
        event.preventDefault()
        clearSequence()
        sequenceMatch.run()
        return
      }

      if (
        !activeShortcuts.some((shortcut) =>
          shortcut.keys.length > 1
            ? shortcut.keys
                .slice(0, nextSequence.length)
                .every(
                  (part, index) => part.toLowerCase() === nextSequence[index],
                )
            : false,
        )
      ) {
        clearSequence()
        return
      }

      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current)
      }
      timeoutRef.current = window.setTimeout(clearSequence, SEQUENCE_TIMEOUT_MS)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      clearSequence()
    }
  }, [])
}
