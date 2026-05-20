import { convexQuery } from '@convex-dev/react-query'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Settings2 } from 'lucide-react'
import { api } from '@convex/_generated/api'
import type { SettingsData } from './-use-settings-data'
import type { PluginDiagnosticSummary } from '../../../lib/types'

function formatTrustLevel(value?: string) {
  switch (value) {
    case 'builtin':
      return 'Builtin'
    case 'restricted':
      return 'Restricted'
    default:
      return 'Trusted local'
  }
}

export function ExtensionsTab({ data }: { data: SettingsData }) {
  const { overview, convexClient, invalidate, workspaceSlug } = data
  const diagnosticsQuery = useQuery({
    ...convexQuery(api.pluginDiagnostics.listRecent, {
      workspaceSlug,
      limit: 30,
    }),
    enabled: Boolean(overview),
  })
  const diagnostics = (diagnosticsQuery.data ?? []) as PluginDiagnosticSummary[]

  const toggle = useMutation({
    mutationFn: async (p: { pluginId: string; status: 'enabled' | 'disabled' }) =>
      convexClient.mutation(api.workspaces.setExtensionStatus, {
        workspaceSlug,
        pluginId: p.pluginId,
        status: p.status,
      }),
    onSuccess: () => void invalidate(),
  })

  if (!overview) return null

  return (
    <div className="extensions-tab">
      <h2 className="extensions-title">Extensions</h2>
      <p className="extensions-subtitle">
        {overview.extensions.length} workspace extension
        {overview.extensions.length !== 1 ? 's' : ''}
      </p>

      <div className="extensions-list">
        {overview.extensions.map((ext) => {
          const recentDiagnostics = diagnostics
            .filter((diagnostic) => diagnostic.pluginId === ext.manifest.id)
            .slice(0, 3)
          return (
          <div key={ext.manifest.id} className="extensions-row">
            <div className="extensions-icon">
              <Settings2 size={16} />
            </div>
            <div className="extensions-info">
              <p className="extensions-name">{ext.manifest.name}</p>
              <p className="extensions-desc">
                {ext.manifest.description ?? 'Workspace extension'}
              </p>
              <p className="extensions-desc">
                Trust: {formatTrustLevel(ext.manifest.trustLevel)} · Permissions:{' '}
                {ext.manifest.capabilities.length
                  ? ext.manifest.capabilities.join(', ')
                  : 'none'}
              </p>
              {recentDiagnostics.length ? (
                <div className="extensions-desc" aria-label={`${ext.manifest.name} diagnostics`}>
                  Recent diagnostics:{' '}
                  {recentDiagnostics.map((diagnostic) => (
                    <span key={diagnostic.id}>
                      {diagnostic.severity}: {diagnostic.message}{' '}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <button
              aria-checked={ext.status === 'enabled'}
              aria-label={`${ext.status === 'enabled' ? 'Disable' : 'Enable'} ${ext.manifest.name}`}
              className="extensions-toggle"
              role="switch"
              disabled={toggle.isPending}
              onClick={() =>
                toggle.mutate({
                  pluginId: ext.manifest.id,
                  status: ext.status === 'enabled' ? 'disabled' : 'enabled',
                })
              }
              type="button"
            >
              <span />
            </button>
          </div>
          )
        })}
      </div>
    </div>
  )
}
