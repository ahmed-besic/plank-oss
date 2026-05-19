import { v } from "convex/values";
import { internalMutation } from "../_generated/server";

const dueDateField = {
  key: "dueDate",
  label: "Due date",
  valueType: "timestamp" as const,
  indexed: true,
};

const dueDateIndexHint = {
  namespace: "core" as const,
  fieldKey: "dueDate",
  valueType: "timestamp" as const,
};

export const runPhase2B = internalMutation({
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

    let registryPatched = 0;

    for (const workspace of workspaces) {
      const registryRows = await ctx.db
        .query("cardTypeRegistry")
        .withIndex("by_workspace", (query) => query.eq("workspaceId", workspace._id))
        .collect();

      for (const row of registryRows) {
        const coreFields: Array<Record<string, unknown>> = (row.manifest as any).fields?.core ?? [];
        const hasDueDate = coreFields.some((f) => f.key === "dueDate");
        if (hasDueDate) continue;

        const manifest = row.manifest as any;
        manifest.fields = manifest.fields ?? {};
        manifest.fields.core = [...coreFields, dueDateField];
        manifest.automationExposedFields = [
          ...new Set([...(manifest.automationExposedFields ?? []), "dueDate"]),
        ];
        manifest.queryIndexHints = [
          ...(manifest.queryIndexHints ?? []).filter(
            (hint: any) => hint.fieldKey !== "dueDate",
          ),
          dueDateIndexHint,
        ];

        await ctx.db.patch(row._id, {
          manifest,
          updatedAt: Date.now(),
        });
        registryPatched += 1;
      }
    }

    return {
      workspacesProcessed: workspaces.length,
      registryPatched,
    };
  },
});
