import { Bot, Plug, Shield, Sparkles } from 'lucide-react'
import { Button } from '@plank/ui'
import type { WorkspaceOverviewData } from '../../lib/types'

export type ExtensionCategory = 'all' | 'core' | 'productivity' | 'automation'

function getExtensionCategory(
  extension: WorkspaceOverviewData['extensions'][number],
): Exclude<ExtensionCategory, 'all'> {
  const id = extension.manifest.id.toLowerCase()
  const hooks = extension.manifest.hooks.join(' ').toLowerCase()

  if (id.startsWith('core-') || id.includes('kanban')) {
    return 'core'
  }

  if (id.includes('behavior') || hooks.includes('registercardchange')) {
    return 'automation'
  }

  return 'productivity'
}

export function BoardExtensionsPage({
  extensionCategory,
  isToggling,
  onOpenSettings,
  onSetExtensionCategory,
  onToggleExtension,
  overview,
}: {
  extensionCategory: ExtensionCategory
  isToggling: boolean
  onOpenSettings: () => void
  onSetExtensionCategory: (category: ExtensionCategory) => void
  onToggleExtension: (pluginId: string, status: 'enabled' | 'disabled') => void
  overview: WorkspaceOverviewData
}) {
  const filteredExtensions = overview.extensions.filter(
    (extension) =>
      extensionCategory === 'all' ||
      getExtensionCategory(extension) === extensionCategory,
  )

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 animate-fade-in">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-grape-vine">
            Workspace Extensions
          </h1>
          <p className="mt-1 text-sm text-lavender-bloom">
            Enable or disable installed extensions without changing the
            canonical card model or the board action flow.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-electric-violet/10 px-3 py-1.5 text-xs font-semibold text-electric-violet">
            {
              overview.extensions.filter(
                (extension) => extension.status === 'enabled',
              ).length
            }{' '}
            enabled
          </div>
          <Button onClick={onOpenSettings} tone="ghost">
            Manage all settings
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[220px_1fr]">
        <aside className="rounded-2xl border border-ghost-gray bg-cloud-white p-3">
          {[
            { id: 'all' as const, label: 'All Extensions', icon: Plug },
            { id: 'core' as const, label: 'Core', icon: Shield },
            { id: 'productivity' as const, label: 'Productivity', icon: Sparkles },
            { id: 'automation' as const, label: 'Automation', icon: Bot },
          ].map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm font-medium transition-all duration-200 ${
                  extensionCategory === item.id
                    ? 'bg-electric-violet/10 text-electric-violet'
                    : 'text-muted-violet hover:bg-lavender-mist hover:text-grape-vine'
                }`}
                onClick={() => onSetExtensionCategory(item.id)}
                type="button"
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            )
          })}
        </aside>

        <section className="rounded-2xl border border-ghost-gray bg-cloud-white p-4">
          <div className="space-y-2">
            {filteredExtensions.map((extension) => (
              <div
                key={extension.manifest.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-ghost-gray/60 px-4 py-3 transition-all duration-200 hover:border-electric-violet/20 hover:bg-electric-violet/[0.02] hover:shadow-sm"
              >
                <div>
                  <p className="text-sm font-semibold text-grape-vine">
                    {extension.manifest.name}
                  </p>
                  <p className="mt-0.5 text-xs text-lavender-bloom">
                    {extension.manifest.description ?? 'Workspace extension'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-lg border px-2 py-0.5 text-xs font-semibold ${
                      extension.status === 'enabled'
                        ? 'border-success-green/20 bg-success-green/10 text-success-green'
                        : 'border-ghost-gray bg-lavender-mist text-lavender-bloom'
                    }`}
                  >
                    {extension.status === 'enabled' ? 'Enabled' : 'Disabled'}
                  </span>
                  <Button
                    disabled={isToggling}
                    onClick={() =>
                      onToggleExtension(
                        extension.manifest.id,
                        extension.status === 'enabled' ? 'disabled' : 'enabled',
                      )
                    }
                    tone={extension.status === 'enabled' ? 'ghost' : 'primary'}
                  >
                    {extension.status === 'enabled' ? 'Disable' : 'Enable'}
                  </Button>
                </div>
              </div>
            ))}

            {!filteredExtensions.length ? (
              <div className="rounded-xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
                No extensions match this filter.
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  )
}
