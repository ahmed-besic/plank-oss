import type { Doc, Id } from "../../_generated/dataModel";
import type { MutationCtx } from "../../_generated/server";

const TARGET_ORDER: Record<Doc<"behaviorBindings">["targetType"], number> = {
  workspace: 0,
  boardType: 1,
  board: 2,
  cardType: 3,
  tag: 4,
};

export interface ResolvedBinding {
  binding: Doc<"behaviorBindings">;
  pack: Doc<"behaviorPacks">;
}

function sortBindings(bindings: ResolvedBinding[]) {
  return [...bindings].sort((left, right) => {
    const tierOrder = TARGET_ORDER[left.binding.targetType] - TARGET_ORDER[right.binding.targetType];
    if (tierOrder !== 0) {
      return tierOrder;
    }

    const priorityOrder = left.binding.priority - right.binding.priority;
    if (priorityOrder !== 0) {
      return priorityOrder;
    }

    return left.binding._id.localeCompare(right.binding._id);
  });
}

async function loadTargetBindings({
  ctx,
  workspaceId,
  targetType,
  targetId,
}: {
  ctx: MutationCtx;
  workspaceId: Id<"workspaces">;
  targetType: Doc<"behaviorBindings">["targetType"];
  targetId: string;
}) {
  return await ctx.db
    .query("behaviorBindings")
    .withIndex("by_workspace_target", (query) =>
      query.eq("workspaceId", workspaceId).eq("targetType", targetType).eq("targetId", targetId),
    )
    .collect();
}

export async function resolveBindingsForCardEvent({
  ctx,
  workspaceId,
  board,
  card,
}: {
  ctx: MutationCtx;
  workspaceId: Id<"workspaces">;
  board: Doc<"boards">;
  card: {
    id: string;
    typeKey?: string;
    tagIds?: string[];
  };
}) {
  const candidates: Array<{
    targetType: Doc<"behaviorBindings">["targetType"];
    targetId: string;
  }> = [
    { targetType: "workspace", targetId: workspaceId },
    { targetType: "boardType", targetId: board.boardTypeId },
    { targetType: "board", targetId: board._id },
    ...(card.typeKey ? [{ targetType: "cardType" as const, targetId: card.typeKey }] : []),
    ...(card.tagIds ?? []).map((tagId) => ({ targetType: "tag" as const, targetId: tagId })),
  ];

  const collected = await Promise.all(
    candidates.map((candidate) =>
      loadTargetBindings({
        ctx,
        workspaceId,
        targetType: candidate.targetType,
        targetId: candidate.targetId,
      }),
    ),
  );

  const bindings = collected.flat().filter((binding) => binding.enabled);
  const resolved: ResolvedBinding[] = [];

  for (const binding of bindings) {
    const pack = await ctx.db.get(binding.behaviorPackId);
    if (!pack) {
      continue;
    }
    if (pack.workspaceId !== workspaceId || pack.status !== "active" || !pack.compiledProgram) {
      continue;
    }
    if (!pack.allowedTargetTypes.includes(binding.targetType)) {
      continue;
    }
    resolved.push({
      binding,
      pack,
    });
  }

  return sortBindings(resolved);
}
