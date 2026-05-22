import { createFileRoute, Link } from '@tanstack/react-router'
import { Authenticated, AuthLoading, Unauthenticated } from 'convex/react'
import { Layers3, Settings2, Tags, Users } from 'lucide-react'
import { Button } from '@plank/ui'
import { useMemo, useState } from 'react'
import { WorkspaceShell } from '../../components/workspace-shell'
import type { KeyboardShortcut } from '../../lib/keyboard-shortcuts'
import { usePlankApp } from '../../lib/providers'
import { collectEnabledUiExtensions } from '../../lib/plugin-ui-extensions'
import { AutomationTab } from './_settings/-automation-tab'
import { ExtensionsTab } from './_settings/-extensions-tab'
import { MembersTab } from './_settings/-members-tab'
import { SchemaTab } from './_settings/-schema-tab'
import { useSettingsData } from './_settings/-use-settings-data'
import './settings.css'

const createRoute = createFileRoute as any

export const Route = createRoute('/w/$workspaceSlug/settings')({
  component: WorkspaceSettingsRoute,
})

type CoreTabKey = 'extensions' | 'schema' | 'automation' | 'members'
type TabKey = CoreTabKey | string

const TABS: { key: CoreTabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'extensions', label: 'Extensions', icon: <Settings2 /> },
  { key: 'schema', label: 'Schema', icon: <Tags /> },
  { key: 'automation', label: 'Automation', icon: <Layers3 /> },
  { key: 'members', label: 'Members', icon: <Users /> },
]

function WorkspaceSettingsRoute() {
  const { workspaceSlug } = Route.useParams()
  const data = useSettingsData(workspaceSlug)
  const { pluginRegistry } = usePlankApp()
  const [activeTab, setActiveTab] = useState<TabKey>('extensions')
  const enabledPluginIds = useMemo(
    () =>
      data.overview?.extensions
        .filter(
          (extension) => extension.installed && extension.status === 'enabled',
        )
        .map((extension) => extension.manifest.id) ?? [],
    [data.overview?.extensions],
  )
  const settingsExtensions = useMemo(
    () =>
      collectEnabledUiExtensions({
        registry: pluginRegistry,
        enabledPluginIds,
        slot: 'settings.workspace.panels',
      }),
    [enabledPluginIds, pluginRegistry],
  )
  const activePluginPanel = settingsExtensions.find(
    ({ extension, pluginId }) => activeTab === `${pluginId}:${extension.id}`,
  )
  const settingsShortcuts = useMemo<KeyboardShortcut[]>(
    () =>
      TABS.map((tab, index) => ({
        id: `settings.${tab.key}`,
        keys: [String(index + 1)],
        description: `Open ${tab.label}`,
        scope: 'settings',
        run: () => setActiveTab(tab.key),
      })),
    [],
  )

  return (
    <>
      <AuthLoading>
        <div className="settings-loading">Loading settings…</div>
      </AuthLoading>
      <Unauthenticated>
        <div className="settings-loading">
          <Link to="/login">
            <Button>Sign in to manage this workspace</Button>
          </Link>
        </div>
      </Unauthenticated>
      <Authenticated>
        {data.overview ? (
          <WorkspaceShell
            overview={data.overview}
            section="settings"
            shortcuts={settingsShortcuts}
          >
            <div className="settings-page">
              <div className="settings-content">
                <div className="settings-header">
                  <h1>Workspace settings</h1>
                  <p>Configure how this workspace behaves.</p>
                </div>

                <div className="settings-body">
                  <nav className="settings-tabs" aria-label="Settings sections">
                    {TABS.map((tab) => (
                      <button
                        key={tab.key}
                        type="button"
                        className={`settings-tab${activeTab === tab.key ? ' active' : ''}`}
                        onClick={() => setActiveTab(tab.key)}
                      >
                        {tab.icon}
                        {tab.label}
                      </button>
                    ))}
                    {settingsExtensions.map(({ extension, pluginId }) => (
                      <button
                        key={`${pluginId}:${extension.id}`}
                        type="button"
                        className={`settings-tab${activeTab === `${pluginId}:${extension.id}` ? ' active' : ''}`}
                        onClick={() =>
                          setActiveTab(`${pluginId}:${extension.id}`)
                        }
                      >
                        {extension.label}
                      </button>
                    ))}
                  </nav>

                  <div className="settings-panels">
                    <div
                      className={`settings-panel${activeTab === 'extensions' ? ' active' : ''}`}
                    >
                      <ExtensionsTab data={data} />
                    </div>
                    <div
                      className={`settings-panel${activeTab === 'schema' ? ' active' : ''}`}
                    >
                      <SchemaTab data={data} />
                    </div>
                    <div
                      className={`settings-panel${activeTab === 'automation' ? ' active' : ''}`}
                    >
                      <AutomationTab data={data} />
                    </div>
                    <div
                      className={`settings-panel${activeTab === 'members' ? ' active' : ''}`}
                    >
                      <MembersTab data={data} />
                    </div>
                    {activePluginPanel ? (
                      <div className="settings-panel active">
                        {activePluginPanel.extension.render({
                          slot: 'settings.workspace.panels',
                          pluginId: activePluginPanel.pluginId,
                          workspaceSlug,
                        })}
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </WorkspaceShell>
        ) : (
          <div className="settings-loading">Loading settings…</div>
        )}
      </Authenticated>
    </>
  )
}
