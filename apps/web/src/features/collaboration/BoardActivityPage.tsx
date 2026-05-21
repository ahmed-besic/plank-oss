import { Activity, Users } from 'lucide-react'
import { getMemberDisplayName, getMemberInitials } from '../../lib/member-display'
import type { BoardActivityEntry, BoardPresenceEntry } from '../../lib/types'

function formatRelativeTime(timestamp: number) {
  const diffMs = Date.now() - timestamp
  const diffMinutes = Math.max(1, Math.round(diffMs / 60_000))
  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`
  }
  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours}h ago`
  }
  const diffDays = Math.round(diffHours / 24)
  return `${diffDays}d ago`
}

function getLabelInitials(label: string) {
  const parts = label.split(/[\s@._-]+/).filter(Boolean)
  if (parts.length === 0) {
    return '?'
  }
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

function getActivitySummary(entry: BoardActivityEntry) {
  switch (entry.kind) {
    case 'new_card':
      return 'created a card'
    case 'move':
      return 'moved a card'
    case 'delete':
      return 'deleted a card'
    case 'title':
      return 'updated the title'
    case 'description':
      return 'updated the description'
    case 'property':
      return entry.propertyKeys?.length
        ? `updated ${entry.propertyKeys.join(', ')}`
        : 'updated properties'
    case 'tag':
      return 'changed tags'
    default:
      return 'changed a card'
  }
}

export function BoardActivityPage({
  boardActivity,
  boardPresence,
  isLoading,
  onOpenCard,
}: {
  boardActivity: BoardActivityEntry[]
  boardPresence: BoardPresenceEntry[]
  isLoading: boolean
  onOpenCard: (cardId: string) => void
}) {
  return (
    <div className="mx-auto max-w-6xl px-6 py-8 animate-fade-in">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-grape-vine">
            Activity
          </h1>
          <p className="mt-1 text-sm text-lavender-bloom">
            Live board presence and recent workflow activity from the canonical
            event projection.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-electric-violet/10 px-3 py-1.5 text-xs font-semibold text-electric-violet">
            {boardPresence.length} active now
          </div>
          <div className="rounded-xl bg-cloud-white px-3 py-1.5 text-xs font-semibold text-lavender-bloom">
            {boardActivity.length} recent events
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        <section className="rounded-2xl border border-ghost-gray bg-cloud-white p-4">
          <div className="mb-4 flex items-center gap-2">
            <Users className="h-4 w-4 text-electric-violet" />
            <h2 className="text-sm font-semibold text-grape-vine">
              Present on this board
            </h2>
          </div>
          <div className="space-y-2">
            {boardPresence.length ? (
              boardPresence.map((entry) => (
                <div
                  key={entry.userId}
                  className="flex items-center gap-3 rounded-xl border border-ghost-gray/70 px-3 py-2.5"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-electric-violet/10 text-xs font-bold text-electric-violet">
                    {getMemberInitials(entry)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-grape-vine">
                      {getMemberDisplayName(entry)}
                    </p>
                    <p className="text-xs text-lavender-bloom">
                      {entry.isViewer ? 'You' : (entry.role ?? 'Member')} ·{' '}
                      {formatRelativeTime(entry.lastHeartbeatAt)}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-ghost-gray px-3 py-6 text-center text-sm text-lavender-bloom">
                No active viewers right now.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-ghost-gray bg-cloud-white p-4">
          <div className="mb-4 flex items-center gap-2">
            <Activity className="h-4 w-4 text-electric-violet" />
            <h2 className="text-sm font-semibold text-grape-vine">
              Recent board activity
            </h2>
          </div>
          <div className="space-y-2">
            {isLoading ? (
              <div className="rounded-xl border border-dashed border-ghost-gray px-3 py-6 text-center text-sm text-lavender-bloom">
                Loading activity…
              </div>
            ) : boardActivity.length ? (
              boardActivity.map((entry) => (
                <button
                  key={entry.id}
                  className="flex w-full items-start gap-3 rounded-xl border border-ghost-gray/70 px-3 py-3 text-left transition-all duration-150 hover:border-electric-violet/20 hover:bg-electric-violet/[0.02]"
                  onClick={() => onOpenCard(entry.cardId)}
                  type="button"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-lavender-mist text-xs font-bold text-grape-vine">
                    {getLabelInitials(entry.actorLabel)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-grape-vine">
                      {entry.actorLabel}
                    </p>
                    <p className="mt-0.5 text-sm text-text-secondary">
                      {getActivitySummary(entry)}{' '}
                      <span className="font-medium text-text-primary">
                        {entry.cardTitle}
                      </span>
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-lavender-bloom">
                    {formatRelativeTime(entry.createdAt)}
                  </span>
                </button>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-ghost-gray px-3 py-6 text-center text-sm text-lavender-bloom">
                No recent activity yet.
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
