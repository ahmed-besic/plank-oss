import {
  DEFAULT_PRIORITY_PROPERTY_OPTIONS,
  createDefaultLifecycleStatuses,
  createSlug,
  type WorkspaceRole,
} from "@plank/domain";
import { builtinServerPluginRegistry } from "@plank/plugin-runtime/server";
import { v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  getCurrentIdentity,
  getCurrentUserId,
  getOptionalUserId,
  getOptionalCurrentAuthUser,
  getWorkspaceAccessBySlugIfAuthenticated,
  requireExtensionManager,
  requireWorkspaceAccessBySlug,
  requireWorkspaceManager,
} from "./lib/auth";
import { createUniqueBoardSlug, createUniqueWorkspaceSlug } from "./lib/slugs";
import {
  ensureBoardViewsForBoard,
  getWorkspaceExtensionRecords,
} from "./lib/plugins";
import { loadWorkspaceOverview } from "./lib/loaders/workspaceOverview";
import {
  createBoardSettingsEnvelope,
  createBoardTypeViewDefaultsEnvelope,
  createWorkspaceExtensionConfigEnvelope,
} from "./lib/persistedState";
import { persistPluginDiagnostic } from "./lib/pluginDiagnostics";

const workspaceInviteRoleValidator = v.union(v.literal("admin"), v.literal("member"));
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeMemberName(name: string | null | undefined) {
  if (typeof name !== "string") {
    return undefined;
  }
  const normalized = name.trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : undefined;
}

function resolveMemberName({
  identityName,
  providedName,
}: {
  identityName?: string | null;
  providedName?: string | null;
}) {
  return normalizeMemberName(providedName) ?? normalizeMemberName(identityName);
}

function getInviteExpiresAt(invite: Pick<Doc<"workspaceInvites">, "createdAt" | "expiresAt">) {
  return invite.expiresAt ?? invite.createdAt + INVITE_TTL_MS;
}

function isInviteExpired(
  invite: Pick<Doc<"workspaceInvites">, "createdAt" | "expiresAt">,
  now: number,
) {
  return getInviteExpiresAt(invite) <= now;
}

function isInvitePending(
  invite: Pick<
    Doc<"workspaceInvites">,
    "acceptedAt" | "revokedAt" | "createdAt" | "expiresAt"
  >,
  now: number,
) {
  return !invite.acceptedAt && !invite.revokedAt && !isInviteExpired(invite, now);
}

function getPendingInviteBackfillPatch(invite: Doc<"workspaceInvites">) {
  if (invite.acceptedAt || invite.revokedAt) {
    return null;
  }

  const patch: Partial<Doc<"workspaceInvites">> = {};
  const normalizedEmail = normalizeEmail(invite.email);

  if (invite.emailNormalized !== normalizedEmail) {
    patch.emailNormalized = normalizedEmail;
  }

  if (typeof invite.expiresAt !== "number") {
    patch.expiresAt = getInviteExpiresAt(invite);
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

async function maybeBackfillPendingInvite(ctx: MutationCtx, invite: Doc<"workspaceInvites">) {
  const patch = getPendingInviteBackfillPatch(invite);
  if (!patch) {
    return;
  }

  await ctx.db.patch(invite._id, patch);
}

async function listWorkspaceInvites(
  ctx: MutationCtx | Parameters<typeof getWorkspaceAccessBySlugIfAuthenticated>[0],
  workspaceId: Id<"workspaces">,
) {
  return await ctx.db
    .query("workspaceInvites")
    .withIndex("by_workspace", (query) => query.eq("workspaceId", workspaceId))
    .collect();
}

function requireWorkspaceOwner(role: WorkspaceRole) {
  if (role !== "owner") {
    throw new Error("Only workspace owners can perform this action");
  }
}

function requireInviteRoleManager(actorRole: WorkspaceRole, inviteRole: "admin" | "member") {
  if (inviteRole === "admin") {
    requireWorkspaceOwner(actorRole);
  }
}

function requireMemberRemovalPermission({
  actorRole,
  currentUserId,
  target,
}: {
  actorRole: WorkspaceRole;
  currentUserId: string;
  target: Doc<"workspaceMembers">;
}) {
  if (target.userId === currentUserId) {
    throw new Error("You cannot remove yourself from the workspace in this flow");
  }

  if (target.role === "owner") {
    throw new Error("The workspace owner cannot be removed");
  }

  if (actorRole === "owner") {
    return;
  }

  if (actorRole === "admin" && target.role === "member") {
    return;
  }

  throw new Error("You do not have permission to remove this member");
}

function requireMemberRoleUpdatePermission({
  actorRole,
  currentUserId,
  target,
  nextRole,
}: {
  actorRole: WorkspaceRole;
  currentUserId: string;
  target: Doc<"workspaceMembers">;
  nextRole: "admin" | "member";
}) {
  if (target.userId === currentUserId) {
    throw new Error("You cannot change your own role in this flow");
  }

  if (target.role === "owner") {
    throw new Error("The workspace owner role cannot be changed");
  }

  requireWorkspaceOwner(actorRole);

  if (target.role === nextRole) {
    return;
  }
}

async function revokePendingInvitesForEmail({
  ctx,
  workspaceId,
  normalizedEmail,
  revokedBy,
  exceptInviteId,
}: {
  ctx: MutationCtx;
  workspaceId: Id<"workspaces">;
  normalizedEmail: string;
  revokedBy: string;
  exceptInviteId?: Id<"workspaceInvites">;
}) {
  const invites = await listWorkspaceInvites(ctx, workspaceId);
  const now = Date.now();

  for (const invite of invites) {
    if (invite._id === exceptInviteId) {
      continue;
    }
    if (normalizeEmail(invite.email) !== normalizedEmail) {
      continue;
    }
    if (!isInvitePending(invite, now)) {
      continue;
    }

    await ctx.db.patch(invite._id, {
      emailNormalized: normalizedEmail,
      expiresAt: getInviteExpiresAt(invite),
      revokedAt: now,
      revokedBy,
    });
  }
}

async function createWorkspaceInviteRecord({
  ctx,
  workspaceId,
  email,
  role,
  createdBy,
  revokeExisting,
}: {
  ctx: MutationCtx;
  workspaceId: Id<"workspaces">;
  email: string;
  role: "admin" | "member";
  createdBy: string;
  revokeExisting: boolean;
}) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error("Invite email is required");
  }

  if (revokeExisting) {
    await revokePendingInvitesForEmail({
      ctx,
      workspaceId,
      normalizedEmail,
      revokedBy: createdBy,
    });
  }

  const now = Date.now();
  const token = crypto.randomUUID();
  const expiresAt = now + INVITE_TTL_MS;
  const inviteId = await ctx.db.insert("workspaceInvites", {
    workspaceId,
    email: email.trim(),
    emailNormalized: normalizedEmail,
    role,
    token,
    createdBy,
    createdAt: now,
    expiresAt,
  });

  return { expiresAt, inviteId, token };
}

async function requireWorkspaceInvite({
  ctx,
  workspaceId,
  inviteId,
}: {
  ctx: MutationCtx;
  workspaceId: Id<"workspaces">;
  inviteId: Id<"workspaceInvites">;
}) {
  const invite = await ctx.db.get(inviteId);
  if (!invite || invite.workspaceId !== workspaceId) {
    throw new Error("Invite not found");
  }
  return invite;
}

function getBuiltinPluginCardTypeManifests(pluginId: string) {
  return builtinServerPluginRegistry.pluginMap.get(pluginId)?.cardTypeManifests ?? [];
}

async function ensurePluginCardTypeManifests({
  ctx,
  workspaceId,
  pluginId,
}: {
  ctx: MutationCtx;
  workspaceId: Id<"workspaces">;
  pluginId: string;
}) {
  const manifests = getBuiltinPluginCardTypeManifests(pluginId);
  if (manifests.length === 0) {
    return;
  }
  const now = Date.now();

  for (const manifest of manifests) {
    const existing = await ctx.db
      .query("cardTypeRegistry")
      .withIndex("by_workspace_type_key", (query) =>
        query.eq("workspaceId", workspaceId).eq("typeKey", manifest.typeKey),
      )
      .unique();
    if (existing) {
      continue;
    }

    await ctx.db.insert("cardTypeRegistry", {
      workspaceId,
      pluginId: manifest.pluginId,
      typeKey: manifest.typeKey,
      schemaVersion: manifest.schemaVersion,
      manifest: manifest as any,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  }
}

async function createUniqueBoardTypeKey({
  ctx,
  workspaceId,
  name,
}: {
  ctx: MutationCtx;
  workspaceId: Id<"workspaces">;
  name: string;
}) {
  const base = createSlug(name) || "board-type";
  let key = base;
  let suffix = 2;

  while (
    await ctx.db
      .query("boardTypes")
      .withIndex("by_workspace_key", (query) =>
        query.eq("workspaceId", workspaceId).eq("key", key),
      )
      .unique()
  ) {
    key = `${base}-${suffix}`;
    suffix += 1;
  }

  return key;
}

async function seedWorkspace({
  ctx,
  workspaceId,
  userId,
  now,
}: {
  ctx: MutationCtx;
  workspaceId: Id<"workspaces">;
  userId: string;
  now: number;
}) {
  await ctx.db.insert("workspaceExtensions", {
    workspaceId,
    pluginId: "focus-tools",
    status: "enabled",
    config: createWorkspaceExtensionConfigEnvelope({
      pluginPackageId: "focus-tools",
    }),
    installedBy: userId,
    installedAt: now,
    updatedAt: now,
  });
  await ctx.db.insert("workspaceExtensions", {
    workspaceId,
    pluginId: "task-board",
    status: "enabled",
    config: createWorkspaceExtensionConfigEnvelope({
      pluginPackageId: "task-board",
    }),
    installedBy: userId,
    installedAt: now,
    updatedAt: now,
  });

  const boardTypeName = "Task tracking";
  const statuses = createDefaultLifecycleStatuses();
  const defaultTypeKey = "core.todo";
  const notesTypeKey = "core.notes";
  const boardTypeId = await ctx.db.insert("boardTypes", {
    workspaceId,
    key: await createUniqueBoardTypeKey({
      ctx,
      workspaceId,
      name: boardTypeName,
    }),
    name: boardTypeName,
    lifecycleConfig: {
      statuses,
      initialStatusKey: statuses[0]?.key ?? "backlog",
    },
    defaultViewIds: ["core-kanban:board"],
    viewDefaults: createBoardTypeViewDefaultsEnvelope({
      defaultViewIds: ["core-kanban:board"],
    }),
    defaultCardTypeKey: defaultTypeKey,
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.insert("cardTypeRegistry", {
    workspaceId,
    pluginId: "core-cards",
    typeKey: defaultTypeKey,
    schemaVersion: 1,
    manifest: {
      pluginId: "core-cards",
      typeKey: defaultTypeKey,
      schemaVersion: 1,
      fields: {
        core: [
          {
            key: "priority",
            label: "Priority",
            valueType: "string",
            enumValues: DEFAULT_PRIORITY_PROPERTY_OPTIONS.map((option) => option.value),
            enumOptions: DEFAULT_PRIORITY_PROPERTY_OPTIONS,
            indexed: true,
            searchable: true,
          },
          {
            key: "dueDate",
            label: "Due date",
            valueType: "timestamp",
            indexed: true,
          },
        ],
      },
      bodyPolicy: {
        allowEmpty: true,
      },
      metaPolicy: {
        titleRequired: true,
      },
      automationExposedFields: ["priority", "dueDate"],
      queryIndexHints: [
        {
          namespace: "core",
          fieldKey: "priority",
          valueType: "string",
        },
        {
          namespace: "core",
          fieldKey: "dueDate",
          valueType: "timestamp",
        },
      ],
    },
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  await ensurePluginCardTypeManifests({
    ctx,
    workspaceId,
    pluginId: "task-board",
  });

  await ctx.db.insert("cardTypeRegistry", {
    workspaceId,
    pluginId: "core-cards",
    typeKey: notesTypeKey,
    schemaVersion: 1,
    manifest: {
      pluginId: "core-cards",
      typeKey: notesTypeKey,
      schemaVersion: 1,
      fields: {
        core: [
          {
            key: "summary",
            label: "Summary",
            valueType: "string",
            searchable: true,
          },
        ],
      },
      bodyPolicy: {
        allowEmpty: true,
      },
      metaPolicy: {
        titleRequired: true,
      },
      automationExposedFields: ["summary"],
      queryIndexHints: [],
    },
    status: "active",
    createdAt: now,
    updatedAt: now,
  });

  const boardName = "Team board";
  const boardId = await ctx.db.insert("boards", {
    workspaceId,
    boardTypeId,
    name: boardName,
    slug: await createUniqueBoardSlug(ctx, workspaceId, boardName),
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
    boardSettings: createBoardSettingsEnvelope(),
  });

  await ensureBoardViewsForBoard(ctx, workspaceId, boardId, ["focus-tools"]);
  return boardId;
}

export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getOptionalUserId(ctx);
    if (!userId) {
      return [];
    }

    const memberships = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_user", (query) => query.eq("userId", userId))
      .collect();

    const workspaces = await Promise.all(
      memberships.map(async (membership) => {
        const workspace = await ctx.db.get(membership.workspaceId);
        if (!workspace) {
          return null;
        }

        return {
          id: workspace._id,
          name: workspace.name,
          slug: workspace.slug,
          role: membership.role,
        };
      }),
    );

    return workspaces
      .filter((workspace): workspace is NonNullable<typeof workspace> => Boolean(workspace))
      .sort((left, right) => left.name.localeCompare(right.name));
  },
});

export const createWorkspace = mutation({
  args: {
    name: v.string(),
    memberName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await getCurrentIdentity(ctx);
    const authUser = await getOptionalCurrentAuthUser(ctx);
    const userId = await getCurrentUserId(ctx);
    const now = Date.now();
    const slug = await createUniqueWorkspaceSlug(ctx, args.name);

    const workspaceId = await ctx.db.insert("workspaces", {
      name: args.name,
      slug,
      ownerId: userId,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("workspaceMembers", {
      workspaceId,
      userId,
      name: resolveMemberName({
        identityName: authUser?.name ?? identity.name,
        providedName: args.memberName,
      }),
      email: authUser?.email ?? identity.email,
      role: "owner",
      createdAt: now,
    });

    const boardId = await seedWorkspace({
      ctx,
      workspaceId,
      userId,
      now,
    });

    return {
      boardId,
      workspaceId,
      workspaceSlug: slug,
    };
  },
});

export const getOverview = query({
  args: {
    workspaceSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const access = await getWorkspaceAccessBySlugIfAuthenticated(
      ctx,
      args.workspaceSlug,
    );
    if (!access) {
      return null;
    }

    const { member, userId, workspace } = access;
    const authUser = await getOptionalCurrentAuthUser(ctx);

    return await loadWorkspaceOverview({
      authUser,
      ctx,
      member,
      userId,
      workspace,
    });
  },
});

export const createBoard = mutation({
  args: {
    workspaceSlug: v.string(),
    name: v.string(),
    boardTypeId: v.id("boardTypes"),
  },
  handler: async (ctx, args) => {
    const { userId, workspace } = await requireWorkspaceAccessBySlug(
      ctx,
      args.workspaceSlug,
    );

    const boardType = await ctx.db.get(args.boardTypeId);
    if (!boardType || boardType.workspaceId !== workspace._id) {
      throw new Error("Board type not found");
    }

    const now = Date.now();
    const boardId = await ctx.db.insert("boards", {
      workspaceId: workspace._id,
      boardTypeId: boardType._id,
      name: args.name,
      slug: await createUniqueBoardSlug(ctx, workspace._id, args.name),
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
      boardSettings: createBoardSettingsEnvelope(),
    });

    const installed = await getWorkspaceExtensionRecords(ctx, workspace._id);
    await ensureBoardViewsForBoard(
      ctx,
      workspace._id,
      boardId,
      installed
        .filter((record) => record.status === "enabled")
        .map((record) => record.pluginId),
    );

    return { boardId };
  },
});

export const setExtensionStatus = mutation({
  args: {
    workspaceSlug: v.string(),
    pluginId: v.string(),
    status: v.union(v.literal("enabled"), v.literal("disabled")),
  },
  handler: async (ctx, args) => {
    const { member, userId, workspace } = await requireWorkspaceAccessBySlug(
      ctx,
      args.workspaceSlug,
    );
    requireExtensionManager(member.role);

    const existing = await ctx.db
      .query("workspaceExtensions")
      .withIndex("by_workspace", (query) => query.eq("workspaceId", workspace._id))
      .filter((query) => query.eq(query.field("pluginId"), args.pluginId))
      .unique();

    const now = Date.now();
    const previousStatus = existing?.status;
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("workspaceExtensions", {
        workspaceId: workspace._id,
        pluginId: args.pluginId,
        status: args.status,
        config: createWorkspaceExtensionConfigEnvelope({
          pluginPackageId: args.pluginId,
        }),
        installedBy: userId,
        installedAt: now,
        updatedAt: now,
      });
    }
    await persistPluginDiagnostic(ctx, {
      workspaceId: workspace._id,
      pluginId: args.pluginId,
      kind: "extension-status-changed",
      severity: "info",
      message: `Extension ${args.pluginId} ${args.status === "enabled" ? "enabled" : "disabled"}`,
      actorId: userId,
      previousStatus,
      nextStatus: args.status,
      createdAt: now,
    });

    if (args.status === "enabled") {
      await ensurePluginCardTypeManifests({
        ctx,
        workspaceId: workspace._id,
        pluginId: args.pluginId,
      });

      const boards = await ctx.db
        .query("boards")
        .withIndex("by_workspace", (query) => query.eq("workspaceId", workspace._id))
        .collect();

      for (const board of boards) {
        await ensureBoardViewsForBoard(ctx, workspace._id, board._id, [args.pluginId]);
      }
    }

    return { pluginId: args.pluginId, status: args.status };
  },
});

export const createInvite = mutation({
  args: {
    workspaceSlug: v.string(),
    email: v.string(),
    role: workspaceInviteRoleValidator,
  },
  handler: async (ctx, args) => {
    const { member, userId, workspace } = await requireWorkspaceAccessBySlug(
      ctx,
      args.workspaceSlug,
    );
    requireWorkspaceManager(member.role);
    requireInviteRoleManager(member.role, args.role);

    return await createWorkspaceInviteRecord({
      ctx,
      workspaceId: workspace._id,
      email: args.email,
      role: args.role,
      createdBy: userId,
      revokeExisting: true,
    });
  },
});

export const revokeInvite = mutation({
  args: {
    workspaceSlug: v.string(),
    inviteId: v.id("workspaceInvites"),
  },
  handler: async (ctx, args) => {
    const { member, userId, workspace } = await requireWorkspaceAccessBySlug(
      ctx,
      args.workspaceSlug,
    );
    requireWorkspaceManager(member.role);

    const invite = await requireWorkspaceInvite({
      ctx,
      workspaceId: workspace._id,
      inviteId: args.inviteId,
    });
    await maybeBackfillPendingInvite(ctx, invite);
    requireInviteRoleManager(member.role, invite.role);

    if (invite.acceptedAt) {
      throw new Error("This invite has already been accepted");
    }
    if (invite.revokedAt) {
      throw new Error("This invite has already been revoked");
    }

    await ctx.db.patch(invite._id, {
      emailNormalized: normalizeEmail(invite.email),
      expiresAt: getInviteExpiresAt(invite),
      revokedAt: Date.now(),
      revokedBy: userId,
    });

    return { ok: true };
  },
});

export const resendInvite = mutation({
  args: {
    workspaceSlug: v.string(),
    inviteId: v.id("workspaceInvites"),
  },
  handler: async (ctx, args) => {
    const { member, userId, workspace } = await requireWorkspaceAccessBySlug(
      ctx,
      args.workspaceSlug,
    );
    requireWorkspaceManager(member.role);

    const invite = await requireWorkspaceInvite({
      ctx,
      workspaceId: workspace._id,
      inviteId: args.inviteId,
    });
    await maybeBackfillPendingInvite(ctx, invite);
    requireInviteRoleManager(member.role, invite.role);

    if (invite.acceptedAt) {
      throw new Error("This invite has already been accepted");
    }
    if (invite.revokedAt) {
      throw new Error("This invite has already been revoked");
    }

    await ctx.db.patch(invite._id, {
      emailNormalized: normalizeEmail(invite.email),
      expiresAt: getInviteExpiresAt(invite),
      revokedAt: Date.now(),
      revokedBy: userId,
    });

    return await createWorkspaceInviteRecord({
      ctx,
      workspaceId: workspace._id,
      email: invite.email,
      role: invite.role,
      createdBy: userId,
      revokeExisting: true,
    });
  },
});

export const updateMemberRole = mutation({
  args: {
    workspaceSlug: v.string(),
    memberId: v.id("workspaceMembers"),
    role: workspaceInviteRoleValidator,
  },
  handler: async (ctx, args) => {
    const { member, userId, workspace } = await requireWorkspaceAccessBySlug(
      ctx,
      args.workspaceSlug,
    );
    requireWorkspaceManager(member.role);

    const target = await ctx.db.get(args.memberId);
    if (!target || target.workspaceId !== workspace._id) {
      throw new Error("Member not found");
    }

    requireMemberRoleUpdatePermission({
      actorRole: member.role,
      currentUserId: userId,
      target,
      nextRole: args.role,
    });

    if (target.role === args.role) {
      return { ok: true };
    }

    await ctx.db.patch(target._id, {
      role: args.role,
    });

    return { ok: true };
  },
});

export const removeMember = mutation({
  args: {
    workspaceSlug: v.string(),
    memberId: v.id("workspaceMembers"),
  },
  handler: async (ctx, args) => {
    const { member, userId, workspace } = await requireWorkspaceAccessBySlug(
      ctx,
      args.workspaceSlug,
    );
    requireWorkspaceManager(member.role);

    const target = await ctx.db.get(args.memberId);
    if (!target || target.workspaceId !== workspace._id) {
      throw new Error("Member not found");
    }

    requireMemberRemovalPermission({
      actorRole: member.role,
      currentUserId: userId,
      target,
    });

    await ctx.db.delete(target._id);
    return { ok: true };
  },
});

export const updateMyMemberProfile = mutation({
  args: {
    workspaceSlug: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const { member } = await requireWorkspaceAccessBySlug(ctx, args.workspaceSlug);
    const authUser = await getOptionalCurrentAuthUser(ctx);
    const name = normalizeMemberName(args.name);
    if (!name) {
      throw new Error("Your name is required");
    }

    await ctx.db.patch(member._id, {
      name,
    });

    if (authUser) {
      await ctx.db.patch(authUser._id, {
        name,
      });
    }

    return { ok: true, name };
  },
});

export const acceptInvite = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await getCurrentIdentity(ctx);
    const authUser = await getOptionalCurrentAuthUser(ctx);
    const userId = await getCurrentUserId(ctx);
    const normalizedIdentityEmail = normalizeEmail(identity.email ?? "");
    if (!normalizedIdentityEmail) {
      throw new Error("You must sign in with the invited email address");
    }

    const invite = await ctx.db
      .query("workspaceInvites")
      .withIndex("by_token", (query) => query.eq("token", args.token))
      .unique();

    if (!invite) {
      throw new Error("Invite not found");
    }
    await maybeBackfillPendingInvite(ctx, invite);

    if (invite.acceptedAt) {
      throw new Error("This invite has already been used");
    }
    if (invite.revokedAt) {
      throw new Error("This invite has been revoked");
    }
    if (isInviteExpired(invite, Date.now())) {
      throw new Error("This invite has expired");
    }

    const normalizedInviteEmail = normalizeEmail(invite.email);
    if (normalizedInviteEmail !== normalizedIdentityEmail) {
      throw new Error("This invite was sent to a different email address");
    }

    const existing = await ctx.db
      .query("workspaceMembers")
      .withIndex("by_workspace", (query) => query.eq("workspaceId", invite.workspaceId))
      .filter((query) => query.eq(query.field("userId"), userId))
      .unique();

    if (!existing) {
      await ctx.db.insert("workspaceMembers", {
        workspaceId: invite.workspaceId,
        userId,
        name: resolveMemberName({
          identityName: authUser?.name ?? identity.name,
        }),
        email: authUser?.email ?? identity.email,
        role: invite.role,
        createdAt: Date.now(),
      });
    } else if (!existing.name) {
      const name = resolveMemberName({
        identityName: authUser?.name ?? identity.name,
      });
      const email = authUser?.email ?? identity.email;
      if (name || email) {
        await ctx.db.patch(existing._id, {
          ...(name ? { name } : {}),
          ...(email ? { email } : {}),
        });
      }
    }

    await ctx.db.patch(invite._id, {
      emailNormalized: normalizedInviteEmail,
      expiresAt: getInviteExpiresAt(invite),
      acceptedAt: Date.now(),
      acceptedByUserId: userId,
    });

    const workspace = await ctx.db.get(invite.workspaceId);
    return {
      workspaceSlug: workspace?.slug,
    };
  },
});

export const backfillInviteMetadata = internalMutation({
  args: {
    workspaceSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const workspaces = args.workspaceSlug
      ? [
          await ctx.db
            .query("workspaces")
            .withIndex("by_slug", (query) => query.eq("slug", args.workspaceSlug!))
            .unique(),
        ].filter((workspace): workspace is NonNullable<typeof workspace> => Boolean(workspace))
      : await ctx.db.query("workspaces").collect();

    let invitesPatched = 0;

    for (const workspace of workspaces) {
      const invites = await ctx.db
        .query("workspaceInvites")
        .withIndex("by_workspace", (query) => query.eq("workspaceId", workspace._id))
        .collect();

      for (const invite of invites) {
        const patch = getPendingInviteBackfillPatch(invite);
        if (!patch) {
          continue;
        }

        await ctx.db.patch(invite._id, patch);
        invitesPatched += 1;
      }
    }

    return {
      invitesPatched,
      workspacesProcessed: workspaces.length,
    };
  },
});
