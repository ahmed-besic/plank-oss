/* @vitest-environment jsdom */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { NotificationCenter } from './NotificationCenter'
import type { WorkspaceOverviewData } from '../../lib/types'

const navigate = vi.fn()
const mutation = vi.fn(async () => ({}))
const invalidateQueries = vi.fn(async () => {})
const useQueryData = {
  items: [
    {
      _id: 'notification_1',
      actorId: 'user_2',
      boardId: 'board_1',
      cardId: 'card_1',
      commentId: 'comment_1',
      createdAt: 2,
      kind: 'mention_comment',
      message: 'mentioned you in a comment',
      recipientUserId: 'user_1',
      workspaceId: 'workspace_1',
    },
  ],
  unreadCount: 1,
}

vi.mock('@convex-dev/react-query', () => ({
  convexQuery: (_ref: unknown, args: unknown) => ({
    queryKey: ['convex', args],
  }),
}))

vi.mock('@tanstack/react-query', () => ({
  useMutation: (options: {
    mutationFn: (value?: unknown) => Promise<unknown>
    onSuccess?: () => Promise<void>
  }) => ({
    isPending: false,
    mutateAsync: vi.fn(async (value?: unknown) => {
      const result = await options.mutationFn(value)
      await options.onSuccess?.()
      return result
    }),
  }),
  useQuery: () => ({
    data: useQueryData,
  }),
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => navigate,
}))

vi.mock('convex/react', () => ({
  useConvexAuth: () => ({
    isAuthenticated: true,
  }),
}))

vi.mock('@convex/_generated/api', () => ({
  api: {
    notifications: {
      listMine: 'notifications.listMine',
      markAllRead: 'notifications.markAllRead',
      markRead: 'notifications.markRead',
    },
  },
}))

vi.mock('../../lib/providers', () => ({
  usePlankApp: () => ({
    convexClient: { mutation },
    queryClient: { invalidateQueries },
  }),
}))

vi.mock('../../lib/use-hydrated', () => ({
  useHydrated: () => true,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function createOverview(): WorkspaceOverviewData {
  return {
    boardTypes: [],
    boards: [],
    extensions: [],
    members: [
      {
        createdAt: 1,
        email: 'teammate@example.com',
        id: 'member_2',
        name: 'Teammate',
        role: 'member',
        userId: 'user_2',
      },
    ],
    pendingInvites: [],
    viewerUserId: 'user_1',
    workspace: {
      id: 'workspace_1',
      name: 'Demo',
      role: 'owner',
      slug: 'demo',
    },
  }
}

describe('NotificationCenter', () => {
  it('renders notifications and navigates to comment mentions through collaboration-owned UI', async () => {
    render(<NotificationCenter overview={createOverview()} />)

    expect(screen.getByText('1 unread')).toBeTruthy()
    fireEvent.click(screen.getByText('Notifications'))

    expect(screen.getByText('mentioned you in a comment')).toBeTruthy()
    expect(screen.getByText('Teammate')).toBeTruthy()

    fireEvent.click(screen.getByText('mentioned you in a comment'))

    await waitFor(() => {
      expect(mutation).toHaveBeenCalledWith('notifications.markRead', {
        workspaceSlug: 'demo',
        notificationId: 'notification_1',
      })
      expect(navigate).toHaveBeenCalledWith(
        expect.objectContaining({
          search: expect.objectContaining({
            card: 'card_1',
            commentId: 'comment_1',
            focus: 'comments',
          }),
        }),
      )
    })
  })

  it('opens the same notifications panel from the icon-only variant', () => {
    render(<NotificationCenter overview={createOverview()} variant="icon" />)

    const trigger = screen.getByRole('button', {
      name: 'Notifications, 1 unread',
    })
    expect(trigger.textContent).toContain('1')

    fireEvent.click(trigger)

    expect(screen.getByText('mentioned you in a comment')).toBeTruthy()
    expect(screen.getByText('Mark all read')).toBeTruthy()
  })
})
