/* @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineClientPlugin } from '@plank/plugin-sdk'
import { createClientPluginRegistry } from '@plank/plugin-runtime'
import type { ComponentType } from 'react'
import type { WorkspaceOverviewData } from '../../lib/types'

const settingsPlugin = defineClientPlugin(
  {
    id: 'settings-tools',
    name: 'Settings tools',
    version: '1.0.0',
    hooks: [],
    capabilities: [],
  },
  ({ registerUiExtension }) => {
    registerUiExtension({
      id: 'settings-tools:panel',
      slot: 'settings.workspace.panels',
      label: 'Plugin settings',
      render: () => <div>Plugin settings panel</div>,
    })
  },
)

const overview: WorkspaceOverviewData = {
  workspace: {
    id: 'workspace_1',
    name: 'Acme',
    slug: 'acme',
    role: 'owner',
  },
  boards: [],
  boardTypes: [],
  members: [],
  pendingInvites: [],
  extensions: [
    {
      manifest: {
        id: 'settings-tools',
        name: 'Settings tools',
        version: '1.0.0',
        hooks: [],
        capabilities: [],
      },
      views: [],
      propertyTypes: [],
      installed: true,
      status: 'enabled',
    },
  ],
  viewerUserId: 'user_1',
}

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: Record<string, unknown>) => ({
    ...config,
    useParams: () => ({ workspaceSlug: 'acme' }),
  }),
  Link: ({ children }: { children?: any }) => <>{children}</>,
}))

vi.mock('convex/react', () => ({
  Authenticated: ({ children }: { children?: any }) => <>{children}</>,
  AuthLoading: () => null,
  Unauthenticated: () => null,
}))

vi.mock('@plank/ui', () => ({
  Button: ({ children }: { children?: any }) => <button>{children}</button>,
}))

vi.mock('../../components/workspace-shell', () => ({
  WorkspaceShell: ({ children }: { children?: any }) => <>{children}</>,
}))

vi.mock('../../lib/providers', () => ({
  usePlankApp: () => ({
    pluginRegistry: createClientPluginRegistry([settingsPlugin]),
  }),
}))

vi.mock('./_settings/-use-settings-data', () => ({
  useSettingsData: () => ({
    overview,
  }),
}))

vi.mock('./_settings/-automation-tab', () => ({
  AutomationTab: () => <div>Automation tab</div>,
}))

vi.mock('./_settings/-extensions-tab', () => ({
  ExtensionsTab: () => <div>Extensions tab</div>,
}))

vi.mock('./_settings/-members-tab', () => ({
  MembersTab: () => <div>Members tab</div>,
}))

vi.mock('./_settings/-schema-tab', () => ({
  SchemaTab: () => <div>Schema tab</div>,
}))

afterEach(() => {
  cleanup()
})

describe('WorkspaceSettingsRoute', () => {
  it('renders plugin workspace settings panels after core tabs', async () => {
    const { Route } = await import('./settings')
    const Component = Route.component as ComponentType

    render(<Component />)

    expect(screen.getByRole('button', { name: 'Plugin settings' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Plugin settings' }))
    expect(screen.getByText('Plugin settings panel')).toBeTruthy()
  })
})
