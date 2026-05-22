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
  const [selectedIndex, setSelectedIndex] = useState(0)

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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedIndex((current) =>
          filtered.length ? (current + 1) % filtered.length : 0,
        )
        return
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedIndex((current) =>
          filtered.length
            ? (current - 1 + filtered.length) % filtered.length
            : 0,
        )
        return
      }

      if (event.key === 'Enter') {
        const command = filtered[selectedIndex]
        if (!command) {
          return
        }
        event.preventDefault()
        void command.run()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [filtered, onClose, selectedIndex])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

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
          {filtered.map((command, index) => (
            <button
              key={command.id}
              className={`w-full rounded-xl px-4 py-3 text-left text-sm font-medium transition-all duration-200 ${
                selectedIndex === index
                  ? 'bg-electric-violet/10 text-electric-violet'
                  : 'text-grape-vine hover:bg-electric-violet/8 hover:text-electric-violet'
              }`}
              onClick={() => {
                void command.run()
                onClose()
              }}
              onMouseEnter={() => setSelectedIndex(index)}
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
