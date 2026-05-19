type MemberLike = {
  userId: string
  name?: string
  email?: string
}

function humanizeEmailLocalPart(email: string) {
  const local = email.split('@')[0]?.trim()
  if (!local) {
    return null
  }
  return local
    .split(/[._-]/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ')
}

function shortenUserId(userId: string) {
  return userId.length > 16 ? `${userId.slice(0, 12)}…` : userId
}

export function getMemberDisplayName(member: MemberLike) {
  const name = member.name?.trim()
  if (name) {
    return name
  }

  const emailLabel = member.email ? humanizeEmailLocalPart(member.email) : null
  if (emailLabel) {
    return emailLabel
  }

  return shortenUserId(member.userId)
}

export function getMemberHandle(member: MemberLike) {
  const local = member.email?.split('@')[0]?.trim()
  if (local) {
    return `@${local}`
  }
  return shortenUserId(member.userId)
}

export function getMemberSecondaryLabel(member: MemberLike) {
  if (member.email) {
    return member.email
  }
  return shortenUserId(member.userId)
}

export function getMemberInitials(member: MemberLike) {
  const base = member.name?.trim() || member.email || member.userId
  const parts = base.split(/[\s@._-]+/).filter(Boolean)
  if (parts.length === 0) {
    return '?'
  }
  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}
