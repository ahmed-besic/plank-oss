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

function formatList(values: string[]) {
  return values.length ? values.join(', ') : 'none'
}

function formatConfig(config?: Record<string, unknown>) {
  const entries = Object.entries(config ?? {})
  if (!entries.length) {
    return 'none'
  }
  return entries
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : String(value)}`)
    .join(' · ')
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
                Trust: {formatTrustLevel(ext.manifest.trustLevel)} · Version:{' '}
                {ext.manifest.version} · Permissions:{' '}
                {formatList(ext.manifest.capabilities)}
              </p>
              <p className="extensions-desc">
                Hooks: {formatList(ext.manifest.hooks)}
              </p>
              {ext.unavailableReason ? (
                <p className="extensions-desc">{ext.unavailableReason}</p>
              ) : null}
              <div className="extensions-desc" aria-label={`${ext.manifest.name} registered features`}>
                Registered features:{' '}
                {[
                  `${ext.features?.views.length ?? ext.views.length} views`,
                  `${ext.features?.propertyTypes.length ?? ext.propertyTypes.length} property types`,
                  `${ext.features?.commands.length ?? 0} commands`,
                  `${ext.features?.uiExtensions.length ?? 0} UI fills`,
                  `${ext.features?.boardTypeTemplates.length ?? 0} templates`,
                  `${ext.features?.cardTypeManifests.length ?? 0} card types`,
                  `${ext.features?.cardChangeHandlers.length ?? 0} handlers`,
                ].join(' · ')}
              </div>
              <div className="extensions-desc" aria-label={`${ext.manifest.name} feature details`}>
                Feature IDs:{' '}
                {formatList([
                  ...(ext.features?.views ?? ext.views).map((feature) => feature.id),
                  ...(ext.features?.propertyTypes ?? ext.propertyTypes).map((feature) => feature.id),
                  ...(ext.features?.commands ?? []).map((feature) => feature.id),
                  ...(ext.features?.uiExtensions ?? []).map((feature) => `${feature.id} (${feature.slot})`),
                  ...(ext.features?.boardTypeTemplates ?? []).map((feature) => feature.id),
                  ...(ext.features?.cardTypeManifests ?? []).map((feature) => feature.typeKey),
                  ...(ext.features?.cardChangeHandlers ?? []).map((feature) => feature.id),
                ])}
              </div>
              <p className="extensions-desc" aria-label={`${ext.manifest.name} config`}>
                Config: {formatConfig(ext.config)}
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
