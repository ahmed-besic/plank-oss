/* @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineClientPlugin } from '@plank/plugin-sdk'
import { createClientPluginRegistry } from '@plank/plugin-runtime'
import { WorkspaceShell } from './workspace-shell'
import type { WorkspaceOverviewData } from '../lib/types'

const shellPlugin = defineClientPlugin(
  {
    id: 'shell-tools',
    name: 'Shell tools',
    version: '1.0.0',
    hooks: [],
    capabilities: [],
  },
  ({ registerUiExtension }) => {
    registerUiExtension({
      id: 'shell-tools:nav',
      slot: 'shell.sidebar.navigation',
      label: 'Shell nav',
      render: () => <a href="/shell-tools">Shell tools</a>,
    })
  },
)

const useWorkspaceShellLayoutMock = vi.fn(() => ({
  isSidebarHidden: false,
  setIsSidebarHidden: vi.fn(),
  sidebarWidth: 280,
  startSidebarResize: vi.fn(),
}))

vi.mock('@convex-dev/react-query', () => ({
  convexQuery: () => ({
    queryKey: ['mock'],
  }),
}))

vi.mock('@tanstack/react-query', () => ({
  useMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
  useQuery: () => ({
    data: undefined,
  }),
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to, ...props }: { children?: any; to?: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}))

vi.mock('convex/react', () => ({
  useConvexAuth: () => ({
    isAuthenticated: true,
  }),
}))

vi.mock('@convex/_generated/api', () => ({
  api: {
    boards: {
      deleteBoard: {},
      getBoardPage: {},
      renameBoard: {},
      setBoardVisibility: {},
    },
    workspaces: {
      createBoard: {},
      createWorkspace: {},
      getOverview: {},
      listMine: {},
    },
  },
}))

vi.mock('../lib/providers', () => ({
  usePlankApp: () => ({
    convexClient: {
      mutation: vi.fn(),
    },
    pluginRegistry: createClientPluginRegistry([shellPlugin]),
    queryClient: {
      invalidateQueries: vi.fn(),
      prefetchQuery: vi.fn(),
    },
  }),
}))

vi.mock('../lib/use-hydrated', () => ({
  useHydrated: () => true,
}))

vi.mock('../features/collaboration/NotificationCenter', () => ({
  NotificationCenter: () => null,
}))

vi.mock('./use-workspace-shell-layout', () => ({
  useWorkspaceShellLayout: () => useWorkspaceShellLayoutMock(),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  useWorkspaceShellLayoutMock.mockReturnValue({
    isSidebarHidden: false,
    setIsSidebarHidden: vi.fn(),
    sidebarWidth: 280,
    startSidebarResize: vi.fn(),
  })
})

describe('WorkspaceShell', () => {
  it('renders enabled shell sidebar navigation fills', () => {
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
            id: 'shell-tools',
            name: 'Shell tools',
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

    render(
      <WorkspaceShell overview={overview} section="overview">
        <main>Workspace content</main>
      </WorkspaceShell>,
    )

    expect(screen.getByText('Shell tools')).toBeTruthy()
    expect(screen.getByText('Workspace content')).toBeTruthy()
  })

  it('keeps a collapsed desktop rail mounted when the sidebar is hidden', () => {
    useWorkspaceShellLayoutMock.mockReturnValue({
      isSidebarHidden: true,
      setIsSidebarHidden: vi.fn(),
      sidebarWidth: 280,
      startSidebarResize: vi.fn(),
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
      extensions: [],
      viewerUserId: 'user_1',
    }

    const { container } = render(
      <WorkspaceShell overview={overview} section="overview">
        <main>Workspace content</main>
      </WorkspaceShell>,
    )

    expect(screen.getByLabelText('Show sidebar')).toBeTruthy()
    expect(
      container
        .querySelector('[aria-label="Resize sidebar"]')
        ?.getAttribute('aria-hidden'),
    ).toBe('true')
  })
})
