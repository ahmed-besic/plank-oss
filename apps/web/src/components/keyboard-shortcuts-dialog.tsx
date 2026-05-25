import { Keyboard, X } from 'lucide-react'
import { useEffect } from 'react'
import {
  type KeyboardShortcut,
  SHORTCUT_SCOPE_LABELS,
  type ShortcutScope,
  formatShortcutKey,
} from '../lib/keyboard-shortcuts'

export function KeyboardShortcutsDialog({
  onClose,
  shortcuts,
}: {
  onClose: () => void
  shortcuts: Array<
    Pick<KeyboardShortcut, 'description' | 'id' | 'keys' | 'scope'>
  >
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === '?') {
        event.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const groupedShortcuts = shortcuts.reduce(
    (groups, shortcut) => {
      groups[shortcut.scope] ??= []
      groups[shortcut.scope].push(shortcut)
      return groups
    },
    {} as Record<
      ShortcutScope,
      Array<Pick<KeyboardShortcut, 'description' | 'id' | 'keys' | 'scope'>>
    >,
  )

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-grape-vine/35 px-4 py-6 backdrop-blur-sm animate-fade-in"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="max-h-[calc(100vh-3rem)] w-full max-w-4xl overflow-hidden rounded-2xl border border-border-subtle bg-cloud-white shadow-elevated animate-scale-in">
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-text-primary">
              <Keyboard className="h-4 w-4 text-electric-violet" />
              Keyboard shortcuts
            </p>
            <p className="mt-1 text-xs text-text-tertiary">
              Press ? anywhere outside text fields to open this panel.
            </p>
          </div>
          <button
            aria-label="Close keyboard shortcuts"
            className="rounded-lg p-2 text-text-tertiary transition hover:bg-surface-sunken hover:text-text-primary"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid max-h-[calc(100vh-9rem)] gap-3 overflow-y-auto p-4 md:grid-cols-2">
          {(Object.keys(SHORTCUT_SCOPE_LABELS) as ShortcutScope[]).map(
            (scope) => {
              const items = groupedShortcuts[scope] ?? []
              if (!items.length) {
                return null
              }

              return (
                <section
                  key={scope}
                  className="rounded-2xl border border-border-subtle p-3.5"
                >
                  <h3 className="text-[11px] font-bold uppercase tracking-[0.18em] text-text-tertiary">
                    {SHORTCUT_SCOPE_LABELS[scope]}
                  </h3>
                  <div className="mt-2.5 space-y-1.5">
                    {items.map((shortcut) => (
                      <div
                        className="flex items-center justify-between gap-3 text-sm leading-5"
                        key={shortcut.id}
                      >
                        <span className="text-text-secondary">
                          {shortcut.description}
                        </span>
                        <span className="flex shrink-0 gap-1">
                          {shortcut.keys.map((key) => (
                            <kbd
                              className="rounded-md border border-border-subtle bg-surface-sunken px-2 py-0.5 text-[11px] font-bold text-text-primary shadow-sm"
                              key={key}
                            >
                              {formatShortcutKey(key)}
                            </kbd>
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>
                </section>
              )
            },
          )}
        </div>
      </div>
    </div>
  )
}
