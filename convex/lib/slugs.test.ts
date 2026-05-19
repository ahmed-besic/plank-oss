import { describe, expect, it } from "vitest";
import { createUniqueBoardSlug, createUniqueWorkspaceSlug } from "./slugs";

function createUniqueQuery(existing: Set<string>) {
  return {
    withIndex(_name: string, cb: (query: any) => any) {
      let candidate: string | undefined;
      cb({
        eq(_field: string, value: string) {
          candidate = value;
          return this;
        },
      });
      return {
        unique: async () => (candidate && existing.has(candidate) ? { slug: candidate } : null),
      };
    },
  };
}

describe("slug helpers", () => {
  it("increments workspace slugs until a unique value is found", async () => {
    const slug = await createUniqueWorkspaceSlug(
      {
        db: {
          query() {
            return createUniqueQuery(new Set(["team-space", "team-space-2"]));
          },
        },
      } as any,
      "Team space",
    );

    expect(slug).toBe("team-space-3");
  });

  it("increments board slugs within the workspace scope", async () => {
    const slug = await createUniqueBoardSlug(
      {
        db: {
          query() {
            return createUniqueQuery(new Set(["roadmap", "roadmap-2"]));
          },
        },
      } as any,
      "workspace-1" as never,
      "Roadmap",
    );

    expect(slug).toBe("roadmap-3");
  });
});
