import { internalMutation } from "../_generated/server";
import { upsertCardRelationProjection } from "../lib/cardRuntime";

export const backfillCardRelationsAndScopes = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cards = await ctx.db.query("cards").collect();
    let scopedCards = 0;
    let relations = 0;

    for (const card of cards) {
      if (!card.scopeId) {
        await ctx.db.patch(card._id, { scopeId: "shared" });
        scopedCards += 1;
      }

      for (const relation of card.relations) {
        const targetCard = await ctx.db.get(relation.targetCardId);
        if (!targetCard || targetCard.workspaceId !== card.workspaceId) {
          continue;
        }
        await upsertCardRelationProjection({
          ctx,
          workspaceId: card.workspaceId,
          sourceBoardId: card.boardId,
          sourceCardId: card._id,
          targetBoardId: targetCard.boardId,
          targetCardId: targetCard._id,
          type: relation.type,
        });
        relations += 1;
      }
    }

    return { scopedCards, relations };
  },
});
