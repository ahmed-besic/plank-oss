/* @vitest-environment jsdom */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MembersTab } from './-members-tab'
import type { SettingsData } from './-use-settings-data'

vi.mock('@convex-dev/auth/react', () => ({
  useAuthActions: () => ({
    signOut: vi.fn(),
  }),
}))

const localStorageMock = (() => {
  const store = new Map<string, string>()
  return {
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    removeItem: (key: string) => {
      store.delete(key)
    },
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
  }
})()

Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: localStorageMock,
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

function asId(value: string) {
  return value as never
}

function createData({
  mutation = vi.fn(),
  pendingInvites = [],
  role = 'owner',
}: {
  mutation?: ReturnType<typeof vi.fn>
  pendingInvites?: Array<{
    id: string
    email: string
    role: 'admin' | 'member'
    createdAt: number
    expiresAt: number
    createdBy: string
  }>
  role?: 'owner' | 'admin' | 'member'
}) {
  const invalidate = vi.fn().mockResolvedValue(undefined)

  return {
    overview: {
      workspace: {
        id: asId('workspace_1'),
        name: 'Acme',
        slug: 'acme',
        role,
      },
      boards: [],
      boardTypes: [],
      members: [
        {
          id: asId('member_owner'),
          userId: 'user_owner',
          email: 'owner@example.com',
          role: 'owner' as const,
          createdAt: 1,
        },
        {
          id: asId('member_admin'),
          userId: 'user_admin',
          email: 'admin@example.com',
          role: 'admin' as const,
          createdAt: 2,
        },
        {
          id: asId('member_member'),
          userId: 'user_member',
          email: 'member@example.com',
          role: 'member' as const,
          createdAt: 3,
        },
      ],
      pendingInvites,
      extensions: [],
      viewerUserId: role === 'admin' ? 'user_admin' : 'user_owner',
    },
    boardTypes: [],
    cardTypes: [],
    tags: [],
    behaviorPacks: [],
    behaviorBindings: [],
    automationRuns: [],
    convexClient: {
      mutation,
    },
    invalidate,
    workspaceSlug: 'acme',
  } as unknown as SettingsData
}

function renderMembersTab(data: SettingsData) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <MembersTab data={data} />
    </QueryClientProvider>,
  )
}

describe('MembersTab', () => {
  it('renders pending invites and owner-only member admin actions', () => {
    renderMembersTab(
      createData({
        pendingInvites: [
          {
            id: 'invite_1',
            email: 'pending@example.com',
            role: 'member',
            createdAt: 10,
            expiresAt: 20,
            createdBy: 'user_owner',
          },
        ],
        role: 'owner',
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Invite' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Hide emails' }))

    expect(screen.queryByText('pending@example.com')).not.toBeNull()
    expect(screen.getByLabelText('Invite role').textContent).toContain('Admin')
    expect(
      screen.getByRole('button', {
        name: 'Demote to member for admin@example.com',
      }),
    ).not.toBeNull()
    expect(
      screen.getByRole('button', {
        name: 'Promote to admin for member@example.com',
      }),
    ).not.toBeNull()
  })

  it('surfaces invite creation errors and limits admin management actions', async () => {
    const mutation = vi
      .fn()
      .mockRejectedValue(new Error('Invite creation failed'))

    renderMembersTab(
      createData({
        mutation,
        pendingInvites: [
          {
            id: 'invite_admin',
            email: 'future-admin@example.com',
            role: 'admin',
            createdAt: 10,
            expiresAt: 20,
            createdBy: 'user_owner',
          },
          {
            id: 'invite_member',
            email: 'future-member@example.com',
            role: 'member',
            createdAt: 10,
            expiresAt: 20,
            createdBy: 'user_owner',
          },
        ],
        role: 'admin',
      }),
    )

    fireEvent.click(screen.getByRole('checkbox', { name: 'Hide emails' }))
    fireEvent.click(screen.getByRole('button', { name: 'Invite' }))
    fireEvent.change(screen.getByPlaceholderText('teammate@company.com'), {
      target: { value: 'newperson@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }))

    await waitFor(() => {
      expect(screen.queryByText('Invite creation failed')).not.toBeNull()
    })

    expect(
      screen.getByLabelText('Invite role').textContent.includes('Admin'),
    ).toBe(false)
    expect(
      screen.queryByRole('button', {
        name: 'Demote to member for admin@example.com',
      }),
    ).toBeNull()
    expect(
      screen.getByRole('button', {
        name: 'Remove member@example.com from workspace',
      }),
    ).not.toBeNull()
    expect(
      screen.queryByRole('button', {
        name: 'Regenerate link for future-admin@example.com',
      }),
    ).toBeNull()
    expect(
      screen.getByRole('button', {
        name: 'Regenerate link for future-member@example.com',
      }),
    ).not.toBeNull()
  })

  it('shows a fresh invite link after a successful create and data refresh', async () => {
    const mutation = vi.fn().mockResolvedValue({
      inviteId: 'invite_2',
      token: 'fresh-token',
      expiresAt: Date.now() + 1000,
    })

    const firstData = createData({
      mutation,
      pendingInvites: [],
      role: 'owner',
    })
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    })
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <MembersTab data={firstData} />
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Invite' }))
    fireEvent.change(screen.getByPlaceholderText('teammate@company.com'), {
      target: { value: 'fresh@example.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }))

    await waitFor(() => {
      expect(firstData.invalidate).toHaveBeenCalled()
    })

    rerender(
      <QueryClientProvider client={queryClient}>
        <MembersTab
          data={createData({
            mutation,
            pendingInvites: [
              {
                id: 'invite_2',
                email: 'fresh@example.com',
                role: 'member',
                createdAt: 10,
                expiresAt: 20,
                createdBy: 'user_owner',
              },
            ],
            role: 'owner',
          })}
        />
      </QueryClientProvider>,
    )

    expect(screen.queryByText(/fresh-token/)).not.toBeNull()
  })

  it('hides emails by default and lets the user reveal them', () => {
    renderMembersTab(
      createData({
        pendingInvites: [
          {
            id: 'invite_hidden',
            email: 'hidden@example.com',
            role: 'member',
            createdAt: 10,
            expiresAt: 20,
            createdBy: 'user_owner',
          },
        ],
        role: 'owner',
      }),
    )

    expect(
      screen.getByRole('checkbox', { name: 'Hide emails' }),
    ).toHaveProperty('checked', true)
    expect(screen.queryByText('owner@example.com')).toBeNull()
    expect(screen.queryByText('hidden@example.com')).toBeNull()
    expect(screen.queryAllByText('Hidden').length).toBeGreaterThan(0)
    expect(screen.queryByText('Email hidden')).toBeNull()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Hide emails' }))

    expect(screen.queryByText('owner@example.com')).not.toBeNull()
    expect(screen.queryAllByText('hidden@example.com').length).toBeGreaterThan(
      0,
    )
  })
})
