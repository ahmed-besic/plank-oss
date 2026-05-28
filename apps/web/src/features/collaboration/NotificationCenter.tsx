import { convexQuery } from '@convex-dev/react-query'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useConvexAuth } from 'convex/react'
import { Bell, ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '@convex/_generated/api'
import { cn } from '@plank/ui'
import { getMemberDisplayName } from '../../lib/member-display'
import { usePlankApp } from '../../lib/providers'
import type { NotificationData, WorkspaceOverviewData } from '../../lib/types'
import { useHydrated } from '../../lib/use-hydrated'

export function NotificationCenter({
  variant = 'expanded',
  overview,
}: {
  variant?: 'expanded' | 'icon'
  overview: WorkspaceOverviewData
}) {
  const auth = useConvexAuth()
  const hydrated = useHydrated()
  const navigate = useNavigate()
  const { convexClient, queryClient } = usePlankApp()
  const notificationMenuRef = useRef<HTMLDivElement>(null)
  const notificationPanelRef = useRef<HTMLDivElement>(null)
  const notificationTriggerRef = useRef<HTMLButtonElement>(null)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [panelPosition, setPanelPosition] = useState<{
    left: number
    top: number
    width: number
  } | null>(null)
  const notificationsOptions = convexQuery(api.notifications.listMine, {
    workspaceSlug: overview.workspace.slug,
    limit: 12,
  })
  const notificationsQuery = useQuery({
    ...notificationsOptions,
    enabled: hydrated && auth.isAuthenticated,
  })
  const notifications = (notificationsQuery.data?.items ??
    []) as NotificationData[]
  const unreadNotifications = notificationsQuery.data?.unreadCount ?? 0
  const memberNameByUserId = new Map(
    overview.members.map((member) => [
      member.userId,
      getMemberDisplayName(member),
    ]),
  )
  const markRead = useMutation({
    mutationFn: async (notificationId: string) =>
      convexClient.mutation(api.notifications.markRead, {
        workspaceSlug: overview.workspace.slug,
        notificationId: notificationId as never,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: notificationsOptions.queryKey,
      })
    },
  })
  const markAllRead = useMutation({
    mutationFn: async () =>
      convexClient.mutation(api.notifications.markAllRead, {
        workspaceSlug: overview.workspace.slug,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: notificationsOptions.queryKey,
      })
    },
  })

  useEffect(() => {
    setIsNotificationsOpen(false)
  }, [overview.workspace.slug])

  useEffect(() => {
    if (!isNotificationsOpen) {
      setPanelPosition(null)
      return
    }

    const updatePanelPosition = () => {
      const trigger = notificationTriggerRef.current
      if (!trigger) {
        return
      }

      const rect = trigger.getBoundingClientRect()
      const maxWidth = 448
      const availableRight = window.innerWidth - rect.left - 16
      const viewportWidth = Math.max(0, window.innerWidth - 16)
      const width = Math.min(
        maxWidth,
        viewportWidth,
        Math.max(320, availableRight),
      )
      const left = Math.min(
        rect.left,
        Math.max(8, window.innerWidth - width - 16),
      )

      setPanelPosition({
        left,
        top: rect.bottom + 4,
        width: Math.max(width, rect.width),
      })
    }

    updatePanelPosition()
    window.addEventListener('resize', updatePanelPosition)
    window.addEventListener('scroll', updatePanelPosition, true)

    return () => {
      window.removeEventListener('resize', updatePanelPosition)
      window.removeEventListener('scroll', updatePanelPosition, true)
    }
  }, [isNotificationsOpen])

  useEffect(() => {
    if (!isNotificationsOpen) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (
        notificationMenuRef.current?.contains(target) ||
        notificationPanelRef.current?.contains(target)
      ) {
        return
      }
      setIsNotificationsOpen(false)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsNotificationsOpen(false)
      }
    }

    window.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isNotificationsOpen])

  const openNotification = async (notification: NotificationData) => {
    if (!notification.readAt && notification._id) {
      await markRead.mutateAsync(notification._id)
    }
    setIsNotificationsOpen(false)
    if (!notification.boardId) {
      return
    }
    void navigate({
      params: {
        boardId: notification.boardId,
        workspaceSlug: overview.workspace.slug,
      },
      search: {
        card: notification.cardId,
        commentId:
          notification.kind === 'mention_comment'
            ? notification.commentId
            : undefined,
        focus:
          notification.kind === 'mention_comment'
            ? 'comments'
            : notification.kind === 'mention_body'
              ? 'description'
              : undefined,
        view: notification.viewInstanceId,
      },
      to: '/w/$workspaceSlug/boards/$boardId',
    } as never)
  }

  return (
    <div
      className={cn(
        'relative flex items-center border-b border-border-subtle',
        variant === 'icon' ? 'h-12 shrink-0 justify-center px-2' : 'h-14 px-3',
      )}
      ref={notificationMenuRef}
    >
      <button
        aria-label={
          unreadNotifications > 0
            ? `Notifications, ${unreadNotifications} unread`
            : 'Notifications'
        }
        ref={notificationTriggerRef}
        className={cn(
          'group flex items-center rounded-xl text-left transition-all duration-200 hover:bg-surface-sunken',
          variant === 'icon'
            ? 'h-9 w-9 justify-center'
            : 'w-full gap-3 px-3 py-1.5',
        )}
        onClick={() => setIsNotificationsOpen((open) => !open)}
        type="button"
      >
        <div
          className={cn(
            'relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-sunken text-text-secondary',
            variant === 'icon' && isNotificationsOpen
              ? 'text-electric-violet'
              : '',
          )}
        >
          <Bell className="h-4 w-4" />
          {unreadNotifications > 0 ? (
            <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-electric-violet px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-white">
              {unreadNotifications}
            </span>
          ) : null}
        </div>
        {variant === 'expanded' ? (
          <>
            <div className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-text-primary">
                Notifications
              </span>
              <span className="block text-xs text-text-tertiary">
                {unreadNotifications > 0
                  ? `${unreadNotifications} unread`
                  : 'All caught up'}
              </span>
            </div>
            <ChevronDown
              className={cn(
                'h-4 w-4 text-text-tertiary transition-transform duration-200',
                isNotificationsOpen ? 'rotate-180' : '',
              )}
            />
          </>
        ) : null}
      </button>

      {isNotificationsOpen && panelPosition
        ? createPortal(
            <div
              ref={notificationPanelRef}
              className="fixed z-50 max-h-[min(24rem,calc(100vh-6rem))] animate-scale-in overflow-y-auto rounded-2xl border border-border-subtle bg-cloud-white p-1.5 shadow-elevated"
              style={{
                left: panelPosition.left,
                top: panelPosition.top,
                width: panelPosition.width,
              }}
            >
              <div className="mb-1 flex items-center justify-between px-2 py-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-tertiary">
                  Recent
                </p>
                <button
                  className="text-xs font-semibold text-electric-violet transition hover:opacity-80 disabled:opacity-40"
                  disabled={unreadNotifications === 0 || markAllRead.isPending}
                  onClick={() => void markAllRead.mutateAsync()}
                  type="button"
                >
                  Mark all read
                </button>
              </div>
              <div className="space-y-1">
                {notifications.length ? (
                  notifications.map((notification) => (
                    <button
                      key={notification._id}
                      className={cn(
                        'w-full rounded-xl px-3 py-2.5 text-left transition-all duration-150',
                        notification.readAt
                          ? 'text-text-secondary hover:bg-surface-sunken'
                          : 'bg-electric-violet/8 text-text-primary hover:bg-electric-violet/12',
                      )}
                      onClick={() => void openNotification(notification)}
                      type="button"
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={cn(
                            'mt-1 h-2 w-2 shrink-0 rounded-full',
                            notification.readAt
                              ? 'bg-border-subtle'
                              : 'bg-electric-violet',
                          )}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block break-words text-sm font-medium">
                            {notification.message}
                          </span>
                          <span className="mt-0.5 block text-xs text-text-tertiary">
                            {memberNameByUserId.get(notification.actorId) ??
                              'Someone'}
                          </span>
                        </span>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="rounded-xl border border-dashed border-border-subtle px-3 py-6 text-center text-sm text-text-tertiary">
                    No notifications yet.
                  </div>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
