import { createFileRoute, Link } from '@tanstack/react-router'
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
} from 'convex/react'
import {
  Layers3,
  Settings2,
  Tags,
  Users,
} from 'lucide-react'
import { Button } from '@plank/ui'
import { useState } from 'react'
import { WorkspaceShell } from '../../components/workspace-shell'
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

type TabKey = 'extensions' | 'schema' | 'automation' | 'members'

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'extensions', label: 'Extensions', icon: <Settings2 /> },
  { key: 'schema', label: 'Schema', icon: <Tags /> },
  { key: 'automation', label: 'Automation', icon: <Layers3 /> },
  { key: 'members', label: 'Members', icon: <Users /> },
]

function WorkspaceSettingsRoute() {
  const { workspaceSlug } = Route.useParams()
  const data = useSettingsData(workspaceSlug)
  const [activeTab, setActiveTab] = useState<TabKey>('extensions')

  return (
    <>
      <AuthLoading>
        <div className="settings-loading">Loading settings…</div>
      </AuthLoading>
      <Unauthenticated>
        <div className="settings-loading">
          <Link to="/login"><Button>Sign in to manage this workspace</Button></Link>
        </div>
      </Unauthenticated>
      <Authenticated>
        {data.overview ? (
          <WorkspaceShell overview={data.overview} section="settings">
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
                  </nav>

                  <div className="settings-panels">
                    <div className={`settings-panel${activeTab === 'extensions' ? ' active' : ''}`}>
                      <ExtensionsTab data={data} />
                    </div>
                    <div className={`settings-panel${activeTab === 'schema' ? ' active' : ''}`}>
                      <SchemaTab data={data} />
                    </div>
                    <div className={`settings-panel${activeTab === 'automation' ? ' active' : ''}`}>
                      <AutomationTab data={data} />
                    </div>
                    <div className={`settings-panel${activeTab === 'members' ? ' active' : ''}`}>
                      <MembersTab data={data} />
                    </div>
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
