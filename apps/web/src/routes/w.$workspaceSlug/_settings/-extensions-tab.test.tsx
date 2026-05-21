/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExtensionsTab } from './-extensions-tab'
import type { WorkspaceOverviewData } from '../../../lib/types'

const { useQueryMock } = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({
    isPending: false,
    mutate: vi.fn(),
  }),
  useQuery: useQueryMock,
}))

vi.mock('@convex-dev/react-query', () => ({
  convexQuery: () => ({
    queryKey: ['pluginDiagnostics'],
  }),
}))

vi.mock('@convex/_generated/api', () => ({
  api: {
    workspaces: {
      setExtensionStatus: {},
    },
    pluginDiagnostics: {
      listRecent: {},
    },
  },
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ExtensionsTab', () => {
  it('shows each extension trust level and declared runtime permissions', () => {
    useQueryMock.mockReturnValue({
      data: [
        {
          id: 'diagnostic_1',
          pluginId: 'core-kanban',
          kind: 'handler-failed',
          severity: 'error',
          message: 'Handler failed',
          createdAt: 1,
        },
      ],
    })

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
            id: 'core-kanban',
            name: 'Core Kanban',
            version: '1.0.0',
            hooks: ['registerView', 'registerUiExtension'],
            capabilities: ['cards:write', 'boardViews:read'],
            trustLevel: 'builtin',
          },
          views: [],
          propertyTypes: [],
          features: {
            views: [{ id: 'core-kanban:board', label: 'Board' }],
            propertyTypes: [{ id: 'text', label: 'Text' }],
            commands: [{ id: 'core-kanban:create-card', label: 'Create card' }],
            uiExtensions: [
              {
                id: 'core-kanban:status',
                slot: 'card.sidebar.panels',
                label: 'Current status',
              },
            ],
            boardTypeTemplates: [
              { id: 'core-kanban:default', name: 'Kanban Board', version: 1 },
            ],
            cardTypeManifests: [],
            cardChangeHandlers: [],
          },
          config: { compactMode: true },
          installed: true,
          status: 'enabled',
        },
        {
          manifest: {
            id: 'local-helper',
            name: 'Local Helper',
            version: '1.0.0',
            hooks: [],
            capabilities: [],
          },
          views: [],
          propertyTypes: [],
          features: {
            views: [],
            propertyTypes: [],
            commands: [],
            uiExtensions: [],
            boardTypeTemplates: [],
            cardTypeManifests: [],
            cardChangeHandlers: [],
          },
          installed: true,
          status: 'disabled',
          unavailableReason:
            'Disabled extensions do not contribute views, commands, UI fills, templates, or handlers.',
        },
      ],
      viewerUserId: 'user_1',
    }

    render(
      <ExtensionsTab
        data={
          {
            overview,
            convexClient: { mutation: vi.fn() },
            invalidate: vi.fn(),
            workspaceSlug: 'acme',
          } as any
        }
      />,
    )

    expect(
      screen.getByText(
        'Trust: Builtin · Version: 1.0.0 · Permissions: cards:write, boardViews:read',
      ),
    ).toBeTruthy()
    expect(
      screen.getByText(
        'Trust: Trusted local · Version: 1.0.0 · Permissions: none',
      ),
    ).toBeTruthy()
    expect(screen.getByText('Hooks: registerView, registerUiExtension')).toBeTruthy()
    expect(screen.getByText(/1 views · 1 property types · 1 commands · 1 UI fills · 1 templates/)).toBeTruthy()
    expect(screen.getByText(/core-kanban:status \(card.sidebar.panels\)/)).toBeTruthy()
    expect(screen.getByText('Config: compactMode: true')).toBeTruthy()
    expect(screen.getByText(/Disabled extensions do not contribute/)).toBeTruthy()
    expect(screen.getByText(/error: Handler failed/)).toBeTruthy()
  })

  it('does not load manager-only diagnostics for workspace members', () => {
    useQueryMock.mockReturnValue({ data: [] })

    const overview: WorkspaceOverviewData = {
      workspace: {
        id: 'workspace_1',
        name: 'Acme',
        slug: 'acme',
        role: 'member',
      },
      boards: [],
      boardTypes: [],
      members: [],
      pendingInvites: [],
      extensions: [],
      viewerUserId: 'user_2',
    }

    render(
      <ExtensionsTab
        data={
          {
            overview,
            convexClient: { mutation: vi.fn() },
            invalidate: vi.fn(),
            workspaceSlug: 'acme',
          } as any
        }
      />,
    )

    expect(useQueryMock).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
    )
  })
})
