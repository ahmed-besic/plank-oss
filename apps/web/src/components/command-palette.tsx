import { Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Input } from '@plank/ui'

export interface CommandPaletteItem {
  id: string
  label: string
  keywords?: string[]
  run: () => Promise<void> | void
}

export function CommandPalette({
  commands,
  onClose,
}: {
  commands: Array<CommandPaletteItem>
  onClose: () => void
}) {
  const [query, setQuery] = useState('')

  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [onClose])

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase()
    if (!value) {
      return commands
    }
    return commands.filter((command) => {
      const terms = [command.label, ...(command.keywords ?? [])]
      return terms.some((term) => term.toLowerCase().includes(value))
    })
  }, [commands, query])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-grape-vine/30 px-4 pt-24 backdrop-blur-sm animate-fade-in"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="w-full max-w-2xl animate-scale-in rounded-2xl border border-ghost-gray bg-cloud-white p-4 shadow-elevated">
        <div className="flex items-center gap-3 rounded-xl border border-ghost-gray bg-lavender-mist px-4 py-2.5">
          <Search className="h-4 w-4 text-lavender-bloom" />
          <Input
            autoFocus
            className="border-none bg-transparent px-0 shadow-none focus:border-none"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search commands…"
            value={query}
          />
        </div>
        <div className="mt-3 space-y-1">
          {filtered.map((command) => (
            <button
              key={command.id}
              className="w-full rounded-xl px-4 py-3 text-left text-sm font-medium text-grape-vine transition-all duration-200 hover:bg-electric-violet/8 hover:text-electric-violet"
              onClick={() => {
                void command.run()
                onClose()
              }}
              type="button"
            >
              {command.label}
            </button>
          ))}
          {!filtered.length ? (
            <p className="px-2 py-4 text-sm text-lavender-bloom">
              No matching commands.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
