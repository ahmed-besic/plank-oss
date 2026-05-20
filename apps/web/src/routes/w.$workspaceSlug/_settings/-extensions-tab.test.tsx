/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExtensionsTab } from './-extensions-tab'
import type { WorkspaceOverviewData } from '../../../lib/types'

vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({
    isPending: false,
    mutate: vi.fn(),
  }),
  useQuery: () => ({
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
  }),
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
            hooks: [],
            capabilities: ['cards:write', 'boardViews:read'],
            trustLevel: 'builtin',
          },
          views: [],
          propertyTypes: [],
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
          installed: true,
          status: 'disabled',
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
      screen.getByText('Trust: Builtin · Permissions: cards:write, boardViews:read'),
    ).toBeTruthy()
    expect(
      screen.getByText('Trust: Trusted local · Permissions: none'),
    ).toBeTruthy()
    expect(screen.getByText(/error: Handler failed/)).toBeTruthy()
  })
})
