import { useAuthActions } from '@convex-dev/auth/react'
import { useMutation } from '@tanstack/react-query'
import {
  Download,
  Link2,
  LogOut,
  RefreshCcw,
  Search,
  Shield,
  Trash2,
  UserCog,
  UserPlus,
} from 'lucide-react'
import { Button, Input } from '@plank/ui'
import { useEffect, useMemo, useState } from 'react'
import { api } from '@convex/_generated/api'
import type { WorkspaceOverviewData } from '../../../lib/types'
import {
  getMemberDisplayName,
  getMemberInitials,
  getMemberSecondaryLabel,
} from '../../../lib/member-display'
import type { SettingsData } from './-use-settings-data'

type InviteRole = 'admin' | 'member'
type WorkspaceRole = WorkspaceOverviewData['members'][number]['role']
const HIDE_EMAILS_STORAGE_KEY = 'plank-members-hide-emails'

function getSafeLocalStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    return window.localStorage
  } catch {
    return null
  }
}

function formatDate(ts: number) {
  const d = new Date(ts)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatDateTime(ts: number) {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function getAvatarColor(email: string) {
  const colors = [
    ['#8b5cf6', '#7c3aed'],
    ['#ec4899', '#db2777'],
    ['#f97316', '#ea580c'],
    ['#10b981', '#059669'],
    ['#06b6d4', '#0891b2'],
    ['#6366f1', '#4f46e5'],
  ]
  let hash = 0
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash)
  const idx = Math.abs(hash) % colors.length
  return colors[idx]
}

function getInviteUrl(token: string) {
  if (typeof window === 'undefined') {
    return `/invite/${token}`
  }
  return `${window.location.origin}/invite/${token}`
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback
}

export function MembersTab({ data }: { data: SettingsData }) {
  const { overview, convexClient, invalidate, workspaceSlug } = data
  const { signOut } = useAuthActions()
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<InviteRole>('member')
  const [inviteLinksById, setInviteLinksById] = useState<Record<string, string>>({})
  const [showInvite, setShowInvite] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [copiedInviteId, setCopiedInviteId] = useState<string | null>(null)
  const [hideEmails, setHideEmails] = useState(true)
  const viewerMember = overview?.members.find((member) => member.userId === overview.viewerUserId)
  const [profileName, setProfileName] = useState(viewerMember?.name ?? '')

  useEffect(() => {
    setProfileName(viewerMember?.name ?? '')
  }, [viewerMember?.name])

  useEffect(() => {
    const storage = getSafeLocalStorage()
    if (!storage) {
      return
    }
    const stored = storage.getItem(HIDE_EMAILS_STORAGE_KEY)
    if (stored === 'false') {
      setHideEmails(false)
    }
  }, [])

  useEffect(() => {
    const storage = getSafeLocalStorage()
    if (!storage) {
      return
    }
    storage.setItem(HIDE_EMAILS_STORAGE_KEY, String(hideEmails))
  }, [hideEmails])

  const invite = useMutation({
    mutationFn: async () =>
      convexClient.mutation(api.workspaces.createInvite, {
        workspaceSlug,
        email: inviteEmail,
        role: inviteRole,
      }),
    onSuccess: async (result) => {
      setInviteLinksById((current) => ({
        ...current,
        [result.inviteId]: getInviteUrl(result.token),
      }))
      setInviteEmail('')
      setInviteRole('member')
      await invalidate()
    },
  })

  const resendInvite = useMutation({
    mutationFn: async (pendingInvite: WorkspaceOverviewData['pendingInvites'][number]) =>
      ({
        pendingInvite,
        result: await convexClient.mutation(api.workspaces.resendInvite, {
          workspaceSlug,
          inviteId: pendingInvite.id as never,
        }),
      }),
    onSuccess: async ({ pendingInvite, result }) => {
      setInviteLinksById((current) => {
        const next = { ...current }
        delete next[pendingInvite.id]
        next[result.inviteId] = getInviteUrl(result.token)
        return next
      })
      await invalidate()
    },
  })

  const revokeInvite = useMutation({
    mutationFn: async (pendingInvite: WorkspaceOverviewData['pendingInvites'][number]) =>
      await convexClient.mutation(api.workspaces.revokeInvite, {
        workspaceSlug,
        inviteId: pendingInvite.id as never,
      }),
    onSuccess: async () => {
      await invalidate()
    },
  })

  const updateMemberRole = useMutation({
    mutationFn: async ({
      memberId,
      role,
    }: {
      memberId: string
      role: InviteRole
    }) =>
      await convexClient.mutation(api.workspaces.updateMemberRole, {
        workspaceSlug,
        memberId: memberId as never,
        role,
      }),
    onSuccess: async () => {
      await invalidate()
    },
  })

  const removeMember = useMutation({
    mutationFn: async (memberId: string) =>
      await convexClient.mutation(api.workspaces.removeMember, {
        workspaceSlug,
        memberId: memberId as never,
      }),
    onSuccess: async () => {
      await invalidate()
    },
  })

  const updateMyMemberProfile = useMutation({
    mutationFn: async () =>
      await convexClient.mutation(api.workspaces.updateMyMemberProfile, {
        workspaceSlug,
        name: profileName,
      }),
    onSuccess: async (result) => {
      setProfileName(result.name)
      await invalidate()
    },
  })

  if (!overview) return null

  const viewerRole = overview.workspace.role
  const viewerUserId = overview.viewerUserId
  const canManageMembers = viewerRole === 'owner' || viewerRole === 'admin'
  const canInviteAdmins = viewerRole === 'owner'

  const handleInviteSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (inviteEmail.trim()) invite.mutate()
  }

  const handleCopyInviteLink = async (inviteId: string) => {
    const url = inviteLinksById[inviteId]
    if (!url) {
      return
    }
    await navigator.clipboard.writeText(url)
    setCopiedInviteId(inviteId)
    window.setTimeout(() => setCopiedInviteId((current) => (current === inviteId ? null : current)), 1200)
  }

  const filteredMembers = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return overview.members
    return overview.members.filter(
      (m) =>
        getMemberDisplayName(m).toLowerCase().includes(q) ||
        (m.email?.toLowerCase().includes(q) ?? false) ||
        m.userId.toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q),
    )
  }, [overview.members, searchQuery])

  const filteredPendingInvites = useMemo(() => {
    if (!canManageMembers) {
      return []
    }

    const q = searchQuery.toLowerCase().trim()
    if (!q) {
      return overview.pendingInvites
    }

    return overview.pendingInvites.filter(
      (pendingInvite) =>
        pendingInvite.email.toLowerCase().includes(q) ||
        pendingInvite.role.toLowerCase().includes(q),
    )
  }, [canManageMembers, overview.pendingInvites, searchQuery])

  const grouped = useMemo(() => {
    const order: Array<WorkspaceRole> = ['owner', 'admin', 'member']
    const map = new Map<string, typeof filteredMembers>()
    for (const m of filteredMembers) {
      const list = map.get(m.role) ?? []
      list.push(m)
      map.set(m.role, list)
    }
    return order
      .filter((role) => map.has(role))
      .map((role) => [role, map.get(role)!] as const)
  }, [filteredMembers])

  const roleLabel = (role: string) =>
    role.charAt(0).toUpperCase() + role.slice(1) + 's'

  const filteredCount = filteredMembers.length

  const canUpdateRole = (target: WorkspaceOverviewData['members'][number]) =>
    viewerRole === 'owner' && target.role !== 'owner' && target.userId !== viewerUserId

  const canRemoveMemberTarget = (target: WorkspaceOverviewData['members'][number]) => {
    if (target.role === 'owner' || target.userId === viewerUserId) {
      return false
    }
    if (viewerRole === 'owner') {
      return true
    }
    return viewerRole === 'admin' && target.role === 'member'
  }

  const canManageInviteTarget = (targetRole: InviteRole) =>
    viewerRole === 'owner' || (viewerRole === 'admin' && targetRole === 'member')

  return (
    <div className="members-tab">
      <h2 className="members-title">Members</h2>

      <div className="members-toolbar">
        <div className="members-toolbar-left">
          <div className="members-search">
            <Search size={16} />
            <input
              type="text"
              placeholder="Search by name or email"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <span className="members-count">
            {filteredCount} member{filteredCount !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="members-toolbar-right">
          <label className="members-toggle">
            <input
              checked={hideEmails}
              onChange={(e) => setHideEmails(e.target.checked)}
              type="checkbox"
            />
            <span>Hide emails</span>
          </label>
          <Button tone="ghost" size="sm">
            <Download size={14} style={{ marginRight: 6 }} />
            Export CSV
          </Button>
          {canManageMembers ? (
            <Button
              tone="primary"
              size="sm"
              onClick={() => setShowInvite((s) => !s)}
            >
              <UserPlus size={14} style={{ marginRight: 6 }} />
              Invite
            </Button>
          ) : null}
        </div>
      </div>

      {showInvite && canManageMembers ? (
        <form onSubmit={handleInviteSubmit} className="members-invite-form">
          <div className="members-invite-fields">
            <Input
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="teammate@company.com"
              type="email"
              value={inviteEmail}
            />
            <select
              aria-label="Invite role"
              className="members-role-select"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as InviteRole)}
            >
              <option value="member">Member</option>
              {canInviteAdmins ? <option value="admin">Admin</option> : null}
            </select>
            <Button
              type="submit"
              disabled={!inviteEmail.trim() || invite.isPending}
              size="sm"
            >
              Send invite
            </Button>
          </div>
          {invite.isError ? (
            <p className="members-feedback members-feedback-error">
              {getErrorMessage(invite.error, 'Invite could not be created.')}
            </p>
          ) : null}
        </form>
      ) : null}

      <section className="members-pending-section">
        <div className="members-section-header">Your profile</div>
        <div className="members-profile-form">
          <div className="members-profile-fields">
            <Input
              onChange={(e) => setProfileName(e.target.value)}
              placeholder="Your name"
              value={profileName}
            />
            <Button
              type="button"
              size="sm"
              disabled={!profileName.trim() || updateMyMemberProfile.isPending}
              onClick={() => updateMyMemberProfile.mutate()}
            >
              Save name
            </Button>
          </div>
          {updateMyMemberProfile.isError ? (
            <p className="members-feedback members-feedback-error">
              {getErrorMessage(updateMyMemberProfile.error, 'Your name could not be updated.')}
            </p>
          ) : null}
        </div>
      </section>

      {canManageMembers ? (
        <section className="members-pending-section">
          <div className="members-section-header">
            Pending invites {filteredPendingInvites.length}
          </div>
          {filteredPendingInvites.length ? (
            <div className="members-pending-list">
              {filteredPendingInvites.map((pendingInvite) => {
                const localLink = inviteLinksById[pendingInvite.id]
                const isBusy =
                  resendInvite.isPending || revokeInvite.isPending
                const visibleInviteEmail = hideEmails ? 'Hidden recipient' : pendingInvite.email

                return (
                  <div key={pendingInvite.id} className="members-pending-card">
                    <div className="members-pending-main">
                      <div>
                        <p className="members-pending-email">{visibleInviteEmail}</p>
                        <p className="members-pending-meta">
                          {pendingInvite.role} · expires {formatDateTime(pendingInvite.expiresAt)}
                        </p>
                      </div>
                      <div className="members-pending-actions">
                        {localLink ? (
                          <Button
                            tone="ghost"
                            size="sm"
                            onClick={() => void handleCopyInviteLink(pendingInvite.id)}
                            type="button"
                          >
                            <Link2 size={14} style={{ marginRight: 6 }} />
                            {copiedInviteId === pendingInvite.id ? 'Copied' : 'Copy link'}
                          </Button>
                        ) : null}
                        {canManageInviteTarget(pendingInvite.role) ? (
                          <>
                            <Button
                              tone="ghost"
                              size="sm"
                              onClick={() => resendInvite.mutate(pendingInvite)}
                              type="button"
                              disabled={isBusy}
                              aria-label={`Regenerate link for ${pendingInvite.email}`}
                            >
                              <RefreshCcw size={14} style={{ marginRight: 6 }} />
                              Regenerate link
                            </Button>
                            <Button
                              tone="danger"
                              size="sm"
                              onClick={() => revokeInvite.mutate(pendingInvite)}
                              type="button"
                              disabled={isBusy}
                              aria-label={`Revoke invite for ${pendingInvite.email}`}
                            >
                              <Trash2 size={14} style={{ marginRight: 6 }} />
                              Revoke
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                    {localLink ? (
                      <div className="members-invite-link">
                        <span className="members-invite-link-label">Fresh invite link</span>
                        <code className="members-invite-link-value">{localLink}</code>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="members-empty">No pending invites.</div>
          )}
          {resendInvite.isError ? (
            <p className="members-feedback members-feedback-error">
              {getErrorMessage(resendInvite.error, 'Invite link could not be regenerated.')}
            </p>
          ) : null}
          {revokeInvite.isError ? (
            <p className="members-feedback members-feedback-error">
              {getErrorMessage(revokeInvite.error, 'Invite could not be revoked.')}
            </p>
          ) : null}
        </section>
      ) : null}

      <div className="members-table-header">
        <div className="members-col members-col-name">Name</div>
        <div className="members-col members-col-email">Email</div>
        <div className="members-col members-col-status">Status</div>
        <div className="members-col members-col-joined">Joined</div>
        <div className="members-col members-col-actions">Actions</div>
      </div>

      {grouped.length === 0 ? (
        <div className="members-empty">No members found.</div>
      ) : (
        grouped.map(([role, members]) => (
          <div key={role} className="members-section">
            <div className="members-section-header">
              {roleLabel(role)} {members.length}
            </div>
            {members.map((member) => {
              const initials = getMemberInitials(member)
              const displayName = getMemberDisplayName(member)
              const email = hideEmails ? 'Hidden' : getMemberSecondaryLabel(member)
              const [c1, c2] = getAvatarColor(member.email ?? member.userId)
              const roleActionLabel =
                member.role === 'member' ? 'Promote to admin' : 'Demote to member'

              return (
                <div key={member.id} className="members-row">
                  <div className="members-col members-col-name">
                    <div
                      className="members-avatar"
                      style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}
                    >
                      {initials}
                    </div>
                    <div className="members-name-block">
                      <span className="members-display-name">{displayName}</span>
                    </div>
                  </div>
                  <div className="members-col members-col-email">{email}</div>
                  <div className="members-col members-col-status">
                    <span className={`members-role-badge ${member.role}`}>
                      {member.role}
                    </span>
                  </div>
                  <div className="members-col members-col-joined">
                    {formatDate(member.createdAt)}
                  </div>
                  <div className="members-col members-col-actions">
                    {canUpdateRole(member) ? (
                      <Button
                        tone="ghost"
                        size="sm"
                        onClick={() =>
                          updateMemberRole.mutate({
                            memberId: member.id,
                            role: member.role === 'member' ? 'admin' : 'member',
                          })
                        }
                        type="button"
                        aria-label={`${roleActionLabel} for ${email}`}
                      >
                        <Shield size={14} style={{ marginRight: 6 }} />
                        {roleActionLabel}
                      </Button>
                    ) : null}
                    {canRemoveMemberTarget(member) ? (
                      <Button
                        tone="ghost"
                        size="sm"
                        onClick={() => removeMember.mutate(member.id)}
                        type="button"
                        aria-label={`Remove ${email} from workspace`}
                      >
                        <UserCog size={14} style={{ marginRight: 6 }} />
                        Remove
                      </Button>
                    ) : null}
                    {!canUpdateRole(member) && !canRemoveMemberTarget(member) ? (
                      <span className="members-actions-placeholder">—</span>
                    ) : null}
                  </div>
                </div>
              )
            })}
          </div>
        ))
      )}

      {updateMemberRole.isError ? (
        <p className="members-feedback members-feedback-error">
          {getErrorMessage(updateMemberRole.error, 'Member role could not be updated.')}
        </p>
      ) : null}
      {removeMember.isError ? (
        <p className="members-feedback members-feedback-error">
          {getErrorMessage(removeMember.error, 'Member could not be removed.')}
        </p>
      ) : null}

      <div className="members-session">
        <div>
          <p className="members-session-label">Session</p>
          <p className="members-session-title">Sign out of your account</p>
        </div>
        <Button onClick={() => void signOut()} tone="ghost" size="sm">
          <LogOut size={14} style={{ marginRight: 6 }} />
          Sign out
        </Button>
      </div>
    </div>
  )
}
