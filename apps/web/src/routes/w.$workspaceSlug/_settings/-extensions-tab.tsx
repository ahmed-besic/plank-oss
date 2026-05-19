import { useMutation } from '@tanstack/react-query'
import { Settings2 } from 'lucide-react'
import { api } from '@convex/_generated/api'
import type { SettingsData } from './-use-settings-data'

export function ExtensionsTab({ data }: { data: SettingsData }) {
  const { overview, convexClient, invalidate, workspaceSlug } = data

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
        {overview.extensions.map((ext) => (
          <div key={ext.manifest.id} className="extensions-row">
            <div className="extensions-icon">
              <Settings2 size={16} />
            </div>
            <div className="extensions-info">
              <p className="extensions-name">{ext.manifest.name}</p>
              <p className="extensions-desc">
                {ext.manifest.description ?? 'Workspace extension'}
              </p>
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
        ))}
      </div>
    </div>
  )
}
