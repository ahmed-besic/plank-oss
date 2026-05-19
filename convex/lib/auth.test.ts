import { describe, expect, it, vi } from "vitest";
import {
  getCurrentIdentity,
  getCurrentUserId,
  getOptionalUserId,
  getWorkspaceAccessBySlugIfAuthenticated,
  requireExtensionManager,
  requireWorkspaceAccessBySlug,
  requireWorkspaceManager,
} from "./auth";

function createCtx({
  identity,
  workspace,
  member,
}: {
  identity?: { tokenIdentifier: string } | null;
  workspace?: any;
  member?: any;
}) {
  return {
    auth: {
      getUserIdentity: vi.fn(async () => identity ?? null),
    },
    db: {
      query(table: string) {
        return {
          withIndex(_name: string, cb: (query: any) => any) {
            const values: string[] = [];
            cb({
              eq(_field: string, value: string) {
                values.push(value);
                return this;
              },
            });
            return {
              unique: async () => {
                if (table === "workspaces") {
                  return workspace ?? null;
                }
                if (table === "workspaceMembers") {
                  return member ?? null;
                }
                return null;
              },
            };
          },
        };
      },
    },
  } as any;
}

describe("auth helpers", () => {
  it("reads identity-derived user ids", async () => {
    const ctx = createCtx({ identity: { tokenIdentifier: "user-1" } });

    await expect(getCurrentIdentity(ctx)).resolves.toEqual({
      tokenIdentifier: "user-1",
    });
    await expect(getOptionalUserId(ctx)).resolves.toBe("user-1");
    await expect(getCurrentUserId(ctx)).resolves.toBe("user-1");
  });

  it("returns nullable access when unauthenticated or missing membership", async () => {
    await expect(
      getWorkspaceAccessBySlugIfAuthenticated(
        createCtx({ identity: null }),
        "demo",
      ),
    ).resolves.toBeNull();

    await expect(
      getWorkspaceAccessBySlugIfAuthenticated(
        createCtx({
          identity: { tokenIdentifier: "user-1" },
          workspace: { _id: "workspace-1", slug: "demo" },
          member: null,
        }),
        "demo",
      ),
    ).resolves.toBeNull();
  });

  it("requires workspace access and role permissions", async () => {
    const ctx = createCtx({
      identity: { tokenIdentifier: "user-1" },
      workspace: { _id: "workspace-1", slug: "demo" },
      member: { role: "admin", userId: "user-1" },
    });

    await expect(requireWorkspaceAccessBySlug(ctx, "demo")).resolves.toEqual({
      userId: "user-1",
      workspace: { _id: "workspace-1", slug: "demo" },
      member: { role: "admin", userId: "user-1" },
    });

    expect(() => requireWorkspaceManager("member")).toThrow(
      "You do not have permission to manage this workspace",
    );
    expect(() => requireExtensionManager("member")).toThrow(
      "You do not have permission to manage workspace extensions",
    );
  });
});
