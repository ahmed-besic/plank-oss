export const workspaceRoles = ["owner", "admin", "member"] as const;

export type WorkspaceRole = (typeof workspaceRoles)[number];

const roleRank: Record<WorkspaceRole, number> = {
  owner: 3,
  admin: 2,
  member: 1,
};

export function canManageWorkspace(role: WorkspaceRole) {
  return roleRank[role] >= roleRank.admin;
}

export function canManageExtensions(role: WorkspaceRole) {
  return roleRank[role] >= roleRank.admin;
}

export function canManageBoards(role: WorkspaceRole) {
  return roleRank[role] >= roleRank.member;
}

export function isWorkspaceRole(value: string): value is WorkspaceRole {
  return workspaceRoles.includes(value as WorkspaceRole);
}
