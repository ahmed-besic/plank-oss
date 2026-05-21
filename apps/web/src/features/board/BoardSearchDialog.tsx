import { Search } from 'lucide-react'
import { useEffect } from 'react'
import { Input } from '@plank/ui'

export function BoardSearchDialog({
  onClose,
  onOpenCard,
  searchResults,
  searchTerm,
  setSearchTerm,
}: {
  onClose: () => void
  onOpenCard: (cardId: string) => void
  searchResults?: Array<{ id: string; title: string; columnId: string }>
  searchTerm: string
  setSearchTerm: (value: string) => void
}) {
  useEffect(() => {
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-grape-vine/30 px-4 pt-24 backdrop-blur-sm animate-fade-in"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="w-full max-w-2xl animate-scale-in rounded-2xl border border-ghost-gray bg-cloud-white p-4 shadow-elevated">
        <div className="flex items-center gap-3 rounded-xl border border-ghost-gray bg-lavender-mist px-4 py-2.5">
          <Search className="h-4 w-4 text-lavender-bloom" />
          <Input
            autoFocus
            className="border-none bg-transparent px-0 shadow-none focus:border-none"
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Find card by title"
            value={searchTerm}
          />
        </div>
        <div className="mt-3 space-y-1">
          {searchResults?.map((result) => (
            <button
              key={result.id}
              className="w-full rounded-xl px-4 py-3 text-left transition-all duration-200 hover:bg-electric-violet/8"
              onClick={() => {
                onClose()
                onOpenCard(result.id)
              }}
              type="button"
            >
              <span className="block text-sm font-semibold text-grape-vine">
                {result.title}
              </span>
              <span className="mt-0.5 block text-xs text-lavender-bloom">
                Open card details
              </span>
            </button>
          ))}
          {searchTerm.trim() && !searchResults?.length ? (
            <p className="px-2 py-4 text-sm text-lavender-bloom">
              No cards match that search.
            </p>
          ) : null}
          {!searchTerm.trim() ? (
            <p className="px-2 py-4 text-sm text-lavender-bloom">
              Start typing to search the current board.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  )
}
