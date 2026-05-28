import { convexQuery } from '@convex-dev/react-query'
import { useMutation, useQuery } from '@tanstack/react-query'
import { RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@plank/ui'
import { api } from '@convex/_generated/api'
import type { SettingsData } from './-use-settings-data'

function formatDateTime(ts: number) {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatExpiry(expiresAt: number | null) {
  if (!expiresAt) {
    return '—'
  }
  const remainingMs = expiresAt - Date.now()
  const days = Math.ceil(remainingMs / (24 * 60 * 60 * 1000))
  if (days <= 0) {
    return `Expires ${formatDateTime(expiresAt)}`
  }
  return `${days}d`
}

export function TrashTab({ data }: { data: SettingsData }) {
  const { convexClient, invalidate, workspaceSlug } = data

  const deletedCardsOpts = convexQuery(api.cards.listDeletedCards, {
    workspaceSlug,
    limit: 250,
  })
  const deletedCardsQ = useQuery({ ...deletedCardsOpts })

  const restoreMutation = useMutation({
    mutationFn: async (input: { boardId: string; cardId: string }) =>
      convexClient.mutation(api.cards.restoreCard, {
        workspaceSlug,
        boardId: input.boardId as never,
        cardId: input.cardId as never,
      }),
    onSuccess: async () => {
      await Promise.all([
        invalidate(),
        deletedCardsQ.refetch(),
      ])
    },
  })

  const items = deletedCardsQ.data ?? []

  return (
    <div className="extensions-tab">
      <div className="trash-tab-header">
        <div>
          <h2 className="extensions-title">Trash</h2>
          <p className="extensions-subtitle">
            Deleted cards can be restored within 10 days.
          </p>
        </div>
        <Button
          tone="ghost"
          size="sm"
          onClick={() => void deletedCardsQ.refetch()}
          disabled={deletedCardsQ.isFetching}
        >
          Refresh
        </Button>
      </div>

      <div className="extensions-list">
        {items.length ? (
          items.map((card) => (
            <article key={card.id} className="extensions-row trash-row">
              <div className="extensions-icon">
                <Trash2 size={16} />
              </div>
              <div className="extensions-info">
                <p className="extensions-name">{card.title}</p>
                <div className="extensions-desc trash-row-meta">
                  <span>Board: {card.boardName}</span>
                  <span>Deleted: {formatDateTime(card.deletedAt)}</span>
                  <span>Grace: {formatExpiry(card.deleteExpiresAt)}</span>
                </div>
              </div>
              <Button
                size="sm"
                onClick={() =>
                  restoreMutation.mutate({
                    boardId: card.boardId,
                    cardId: card.id,
                  })
                }
                disabled={restoreMutation.isPending}
              >
                <RotateCcw className="h-4 w-4" />
                Restore
              </Button>
            </article>
          ))
        ) : (
          <div className="trash-empty">No deleted cards.</div>
        )}
      </div>
    </div>
  )
}

